import {
    useRef, useEffect, useState, useCallback, useLayoutEffect,
    forwardRef, useImperativeHandle, useMemo
} from 'react';
import type { ContentProvider, SpineItemInfo } from '../../services/contentProvider';
import { ShadowRenderer, ReaderStyleConfig, segmentPool } from './ShadowRenderer';
import type { SegmentMeta } from '../../types/vectorRender';
import {
    shouldPreloadChapter,
    detectScrollDirection,
    ScrollDirection,
} from '../../utils/scrollDetection';
import {
    findBestAnchor,
    captureAnchorInfo,
    calculateAnchorDelta,
} from '../../utils/anchorDetection';
import { useScrollInertia } from '../../hooks/useScrollInertia';
import { useScrollEvents } from '../../hooks/useScrollEvents';
import { db } from '../../services/storageService';
import { findTextInDOM, highlightRange } from '../../utils/textFinder';
import { SelectionMenu } from './SelectionMenu';
import { NoteDialog } from './NoteDialog';
import { TranslationDialog } from './TranslationDialog';
import { getProviderLabel, translateText } from '../../services/translateService';
import { preprocessChapterContent } from '../../services/chapterPreprocessService';
import { buildChapterMetaVector, batchUpdateSegmentHeights, resolveSegmentHtml } from '../../services/metaVectorManager';
import type { ChapterMetaVector } from '../../types/vectorRender';
import { cancelIdleTask, scheduleIdleTask, type IdleTaskHandle } from '../../utils/idleScheduler';
import styles from './ScrollReaderView.module.css';

// ── Types ──

interface LoadedChapter {
    spineIndex: number;
    id: string;
    htmlContent: string;
    htmlFragments: string[];
    externalStyles: string[];
    segmentMetas?: SegmentMeta[];
    /** Piece Table: 不可变 buffer，segmentMetas 通过 (bufferOffset, bufferLength) 索引 */
    htmlBuffer?: string;
    domNode: HTMLElement | null;
    height: number;
    status: 'loading' | 'shadow-rendering' | 'ready' | 'mounted' | 'placeholder';
}

type PipelineState =
    | 'idle'
    | 'pre-fetching'
    | 'rendering-offscreen'
    | 'anchoring-locked'
    | 'committing';

interface ScrollReaderViewProps {
    provider: ContentProvider;
    bookId: string;
    initialSpineIndex?: number;
    initialScrollOffset?: number;
    smoothConfig?: {
        enabled: boolean;
        stepSizePx: number;
        animationTimeMs: number;
        accelerationDeltaMs: number;
        accelerationMax: number;
        tailToHeadRatio: number;
        easing: boolean;
        reverseWheelDirection: boolean;
    };
    readerStyles: ReaderStyleConfig;
    onProgressChange?: (progress: number) => void;
    onChapterChange?: (label: string, href: string) => void;
    onSelectionSearch?: (keyword: string) => void;
}

export interface ScrollReaderHandle {
    jumpToSpine: (spineIndex: number, searchText?: string) => Promise<void>;
}

// ── Constants ──

const PRELOAD_THRESHOLD_PX = 600;
const ACTIVE_MOUNTED_WINDOW_RADIUS = 1;
const SCROLL_IDLE_RESUME_MS = 200;
const PREFETCH_IDLE_TIMEOUT_MS = 120;
const CHAPTER_DETECTION_ANCHOR_RATIO = 0.22;
const CHAPTER_DETECTION_ANCHOR_MAX_PX = 140;
const HIGHLIGHT_IDLE_TIMEOUT_MS = 600;
const CHAPTER_PLACEHOLDER_MIN_HEIGHT_PX = 240;
const CHAPTER_PLACEHOLDER_DEFAULT_HEIGHT_PX = 800;
const RESIZE_DELTA_THRESHOLD_PX = 1;
const RESIZE_ANCHOR_EPSILON_PX = 0.5;
const RESIZE_CORRECTION_STOP_INERTIA_PX = 48;
const DEFAULT_SMOOTH_CONFIG: NonNullable<ScrollReaderViewProps['smoothConfig']> = {
    enabled: true,
    stepSizePx: 120,
    animationTimeMs: 360,
    accelerationDeltaMs: 70,
    accelerationMax: 7,
    tailToHeadRatio: 3,
    easing: true,
    reverseWheelDirection: false,
};

function revokeBlobUrl(rawUrl: string | null) {
    if (!rawUrl) return;
    if (!rawUrl.startsWith('blob:')) return;
    try {
        URL.revokeObjectURL(rawUrl);
    } catch {
        // Ignore revoke failures
    }
}

function releaseChapterDomResources(chapterNode: HTMLElement | null) {
    if (!chapterNode) return;

    chapterNode.querySelectorAll('img').forEach((img) => {
        revokeBlobUrl(img.getAttribute('src'));
        const srcSet = img.getAttribute('srcset');
        if (srcSet) {
            srcSet.split(',').forEach((part) => {
                const url = part.trim().split(/\s+/)[0];
                revokeBlobUrl(url || null);
            });
        }
        img.removeAttribute('srcset');
        img.removeAttribute('src');
        img.loading = 'lazy';
        img.decoding = 'async';
    });

    chapterNode.querySelectorAll('source').forEach((sourceEl) => {
        revokeBlobUrl(sourceEl.getAttribute('src'));
        sourceEl.removeAttribute('srcset');
        sourceEl.removeAttribute('src');
    });

    chapterNode.querySelectorAll('video,audio').forEach((mediaEl) => {
        revokeBlobUrl(mediaEl.getAttribute('src'));
        mediaEl.removeAttribute('src');
        mediaEl.querySelectorAll('source').forEach((sourceEl) => {
            revokeBlobUrl(sourceEl.getAttribute('src'));
            sourceEl.removeAttribute('src');
        });
    });

    chapterNode.replaceChildren();
}

function clampNumber(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

function resolveChapterPlaceholderHeight(height: number): number {
    return Math.max(
        CHAPTER_PLACEHOLDER_MIN_HEIGHT_PX,
        Math.floor(height || CHAPTER_PLACEHOLDER_DEFAULT_HEIGHT_PX),
    );
}

function applyChapterShellStyles(chapterEl: HTMLElement, height: number): void {
    chapterEl.style.contain = 'layout style paint';
    chapterEl.style.display = 'flow-root';
    chapterEl.style.contentVisibility = 'auto';
    chapterEl.style.containIntrinsicSize = `${resolveChapterPlaceholderHeight(height)}px`;
}

function markChapterAsPlaceholder(chapterEl: HTMLElement, height: number): void {
    const resolvedHeight = resolveChapterPlaceholderHeight(height);
    applyChapterShellStyles(chapterEl, resolvedHeight);
    chapterEl.style.height = `${resolvedHeight}px`;
    chapterEl.style.minHeight = `${resolvedHeight}px`;
    chapterEl.setAttribute('data-chapter-state', 'placeholder');
}

function markChapterAsMounted(chapterEl: HTMLElement, height: number): void {
    applyChapterShellStyles(chapterEl, height);
    chapterEl.style.height = '';
    chapterEl.style.minHeight = '';
    chapterEl.removeAttribute('data-chapter-state');
}

// ── Component ──

export const ScrollReaderView = forwardRef<ScrollReaderHandle, ScrollReaderViewProps>(({
    provider,
    bookId,
    initialSpineIndex = 0,
    initialScrollOffset = 0,
    smoothConfig = DEFAULT_SMOOTH_CONFIG,
    readerStyles,
    onProgressChange,
    onChapterChange,
    onSelectionSearch,
}: ScrollReaderViewProps, ref) => {
    const viewportRef = useRef<HTMLDivElement>(null);
    const chapterListRef = useRef<HTMLDivElement>(null);
    const lastScrollTopRef = useRef(0);
    const pipelineRef = useRef<PipelineState>('idle');
    const loadingLockRef = useRef<Set<number>>(new Set());
    const progressTimerRef = useRef<number | null>(null);
    const scrollIdleTimerRef = useRef<number | null>(null);
    const idlePrefetchHandleRef = useRef<number | null>(null);
    const isUserScrollingRef = useRef(false);
    const initialScrollDone = useRef(false);
    const pendingSearchTextRef = useRef<string | null>(null);

    const [chapters, setChapters] = useState<LoadedChapter[]>([]);
    const chaptersRef = useRef<LoadedChapter[]>([]);
    const [spineItems, setSpineItems] = useState<SpineItemInfo[]>([]);
    const spineItemsRef = useRef<SpineItemInfo[]>([]);
    const [currentSpineIndex, setCurrentSpineIndex] = useState(initialSpineIndex);

    const [isInitialized, setIsInitialized] = useState(false);
    const resizeObserverRef = useRef<ResizeObserver | null>(null);
    const observedResizeNodesRef = useRef<Set<HTMLElement>>(new Set());
    const observedResizeHeightsRef = useRef<WeakMap<HTMLElement, number>>(new WeakMap());
    const chapterVectorsRef = useRef<Map<string, ChapterMetaVector>>(new Map());

    // ── Selection Menu State ──
    const [selectionMenu, setSelectionMenu] = useState<{
        visible: boolean; x: number; y: number; text: string; spineIndex: number;
    }>({ visible: false, x: 0, y: 0, text: '', spineIndex: -1 });
    const [noteDialog, setNoteDialog] = useState<{
        visible: boolean; text: string; spineIndex: number;
    }>({ visible: false, text: '', spineIndex: -1 });
    const [translateDialog, setTranslateDialog] = useState<{
        visible: boolean;
        sourceText: string;
        translatedText: string;
        loading: boolean;
        error: string;
        providerLabel: string;
        fromCache: boolean;
    }>({
        visible: false,
        sourceText: '',
        translatedText: '',
        loading: false,
        error: '',
        providerLabel: '-',
        fromCache: false,
    });
    const renderedHighlightsRef = useRef<Set<string>>(new Set());
    const highlightIdleHandlesRef = useRef<Map<number, IdleTaskHandle>>(new Map());

    // Keep refs in sync with state
    chaptersRef.current = chapters;

    const normalizedSmoothConfig = useMemo(() => ({
        enabled: smoothConfig.enabled !== false,
        stepSizePx: clampNumber(Number(smoothConfig.stepSizePx || DEFAULT_SMOOTH_CONFIG.stepSizePx), 20, 300),
        animationTimeMs: clampNumber(Number(smoothConfig.animationTimeMs || DEFAULT_SMOOTH_CONFIG.animationTimeMs), 120, 1200),
        accelerationDeltaMs: clampNumber(Number(smoothConfig.accelerationDeltaMs || DEFAULT_SMOOTH_CONFIG.accelerationDeltaMs), 10, 400),
        accelerationMax: clampNumber(Number(smoothConfig.accelerationMax || DEFAULT_SMOOTH_CONFIG.accelerationMax), 1, 12),
        tailToHeadRatio: clampNumber(Number(smoothConfig.tailToHeadRatio || DEFAULT_SMOOTH_CONFIG.tailToHeadRatio), 1, 8),
        easing: smoothConfig.easing !== false,
        reverseWheelDirection: Boolean(smoothConfig.reverseWheelDirection),
    }), [smoothConfig]);

    const physicsConfig = useMemo(() => {
        const friction = clampNumber(26 / normalizedSmoothConfig.animationTimeMs + (normalizedSmoothConfig.easing ? 0 : 0.02), 0.04, 0.18);
        const stopThreshold = normalizedSmoothConfig.easing ? 0.08 : 0.14;
        const springStiffness = 0.06;
        const springDamping = normalizedSmoothConfig.easing ? 0.7 : 0.55;
        return {
            friction,
            stopThreshold,
            springStiffness,
            springDamping,
        };
    }, [normalizedSmoothConfig.animationTimeMs, normalizedSmoothConfig.easing]);

    const inertiaTuning = useMemo(() => {
        const ratio = normalizedSmoothConfig.tailToHeadRatio;
        const impulseBlend = clampNumber(0.72 + (ratio - 1) * 0.05, 0.65, 0.94);
        const impulseGain = clampNumber(0.18 + (normalizedSmoothConfig.stepSizePx - 120) / 900, 0.1, 0.38);
        const maxAbsVelocity = clampNumber(normalizedSmoothConfig.stepSizePx * 0.75 + normalizedSmoothConfig.accelerationMax * 5, 48, 220);
        const frameCapMs = normalizedSmoothConfig.easing ? 24 : 32;
        return {
            impulseBlend,
            impulseGain,
            maxAbsVelocity,
            frameCapMs,
        };
    }, [normalizedSmoothConfig.stepSizePx, normalizedSmoothConfig.tailToHeadRatio, normalizedSmoothConfig.accelerationMax, normalizedSmoothConfig.easing]);

    // ── Physics Engine Integration ──

    const inertiaCallbacks = useMemo(() => ({
        onStart: () => {
            viewportRef.current?.classList.add(styles.flinging);
        },
        onStop: () => {
            viewportRef.current?.classList.remove(styles.flinging);
        }
    }), []);

    const { addImpulse, fling, stop, setDragging } = useScrollInertia(viewportRef, physicsConfig, inertiaCallbacks, inertiaTuning);

    const scrollCallbacks = useMemo(() => ({
        onWheelImpulse: (deltaY: number) => {
            addImpulse(deltaY);
        },
        wheelConfig: {
            enabled: normalizedSmoothConfig.enabled,
            stepSizePx: normalizedSmoothConfig.stepSizePx,
            accelerationDeltaMs: normalizedSmoothConfig.accelerationDeltaMs,
            accelerationMax: normalizedSmoothConfig.accelerationMax,
            reverseDirection: normalizedSmoothConfig.reverseWheelDirection,
        },
        onDragStart: () => {
            stop();
            setDragging(true);
        },
        onTouchFling: (velocity: number) => {
            setDragging(false);
            fling(velocity);
        },
        onDragEnd: () => {
            setDragging(false);
        }
    }), [
        addImpulse,
        fling,
        stop,
        setDragging,
        normalizedSmoothConfig.enabled,
        normalizedSmoothConfig.stepSizePx,
        normalizedSmoothConfig.accelerationDeltaMs,
        normalizedSmoothConfig.accelerationMax,
        normalizedSmoothConfig.reverseWheelDirection,
    ]);

    useScrollEvents(viewportRef, scrollCallbacks);

    const cancelIdlePrefetch = useCallback(() => {
        if (idlePrefetchHandleRef.current === null) return;
        if (typeof window !== 'undefined' && typeof window.cancelIdleCallback === 'function') {
            window.cancelIdleCallback(idlePrefetchHandleRef.current);
        } else {
            window.clearTimeout(idlePrefetchHandleRef.current);
        }
        idlePrefetchHandleRef.current = null;
    }, []);

    const scheduleIdlePrefetch = useCallback((task: () => void) => {
        cancelIdlePrefetch();
        if (isUserScrollingRef.current) return;

        if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
            idlePrefetchHandleRef.current = window.requestIdleCallback(() => {
                idlePrefetchHandleRef.current = null;
                task();
            }, { timeout: PREFETCH_IDLE_TIMEOUT_MS });
            return;
        }

        idlePrefetchHandleRef.current = window.setTimeout(() => {
            idlePrefetchHandleRef.current = null;
            task();
        }, 16);
    }, [cancelIdlePrefetch]);

    useEffect(() => {
        return () => {
            cancelIdlePrefetch();
            if (scrollIdleTimerRef.current !== null) {
                window.clearTimeout(scrollIdleTimerRef.current);
                scrollIdleTimerRef.current = null;
            }
            highlightIdleHandlesRef.current.forEach((handle) => {
                cancelIdleTask(handle);
            });
            highlightIdleHandlesRef.current.clear();
        };
    }, [cancelIdlePrefetch]);

    const observeResizeNode = useCallback((node: HTMLElement | null) => {
        if (!node) return;
        if (observedResizeNodesRef.current.has(node)) return;
        observedResizeNodesRef.current.add(node);
        observedResizeHeightsRef.current.set(node, Math.max(1, Math.floor(node.getBoundingClientRect().height)));
        resizeObserverRef.current?.observe(node);
    }, []);

    const unobserveResizeNode = useCallback((node: HTMLElement | null) => {
        if (!node) return;
        if (!observedResizeNodesRef.current.has(node)) return;
        observedResizeNodesRef.current.delete(node);
        resizeObserverRef.current?.unobserve(node);
    }, []);

    const observeChapterResizeNodes = useCallback((chapterEl: HTMLElement | null) => {
        if (!chapterEl) return;
        const segments = Array.from(
            chapterEl.querySelectorAll('[data-shadow-segment-index]')
        ) as HTMLElement[];
        if (segments.length > 0) {
            segments.forEach((segmentEl) => observeResizeNode(segmentEl));
            return;
        }
        observeResizeNode(chapterEl);
    }, [observeResizeNode]);

    const unobserveChapterResizeNodes = useCallback((chapterEl: HTMLElement | null) => {
        if (!chapterEl) return;
        const segments = Array.from(
            chapterEl.querySelectorAll('[data-shadow-segment-index]')
        ) as HTMLElement[];
        if (segments.length > 0) {
            segments.forEach((segmentEl) => unobserveResizeNode(segmentEl));
        }
        unobserveResizeNode(chapterEl);
    }, [unobserveResizeNode]);

    const resetResizeObservers = useCallback(() => {
        observedResizeNodesRef.current.forEach((node) => {
            resizeObserverRef.current?.unobserve(node);
        });
        observedResizeNodesRef.current.clear();
        observedResizeHeightsRef.current = new WeakMap<HTMLElement, number>();
    }, []);

    useEffect(() => {
        const observer = new ResizeObserver((entries) => {
            const viewport = viewportRef.current;
            if (!viewport) return;
            if (pipelineRef.current === 'anchoring-locked') return;

            const viewportRect = viewport.getBoundingClientRect();
            let corrected = false;

            entries.forEach((entry) => {
                const target = entry.target as HTMLElement;
                const prevHeight = observedResizeHeightsRef.current.get(target);
                const nextHeight = Math.max(1, Math.floor(entry.contentRect.height));
                if (prevHeight === undefined) {
                    observedResizeHeightsRef.current.set(target, nextHeight);
                    return;
                }

                const delta = nextHeight - prevHeight;
                if (Math.abs(delta) < RESIZE_DELTA_THRESHOLD_PX) {
                    return;
                }
                observedResizeHeightsRef.current.set(target, nextHeight);

                if (!target.isConnected) return;
                const targetTop = target.getBoundingClientRect().top - viewportRect.top + viewport.scrollTop;
                if (targetTop >= viewport.scrollTop - RESIZE_ANCHOR_EPSILON_PX) return;

                if (Math.abs(delta) >= RESIZE_CORRECTION_STOP_INERTIA_PX) {
                    stop();
                }
                viewport.scrollTop = Math.max(0, viewport.scrollTop + delta);
                corrected = true;
            });

            if (corrected) {
                lastScrollTopRef.current = viewport.scrollTop;
            }
        });

        resizeObserverRef.current = observer;
        return () => {
            resetResizeObservers();
            observer.disconnect();
            if (resizeObserverRef.current === observer) {
                resizeObserverRef.current = null;
            }
        };
    }, [resetResizeObservers, stop]);

    // Pending shadow renders queue
    const [shadowQueue, setShadowQueue] = useState<LoadedChapter[]>([]);

    // ── Spine Initialization ──

    useEffect(() => {
        const items = provider.getSpineItems();
        spineItemsRef.current = items;
        setSpineItems(items);
    }, [provider]);

    // Load initial chapter once spineItems are available
    useEffect(() => {
        if (spineItems.length === 0 || isInitialized) return;
        if (loadingLockRef.current.size > 0) return; // already loading
        const safeIndex = Math.min(initialSpineIndex, spineItems.length - 1);
        setCurrentSpineIndex(safeIndex);
        loadChapter(safeIndex, 'initial');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [spineItems]);

    // ── Chapter Loading ──

    const loadChapter = useCallback(async (
        spineIndex: number,
        direction: 'prev' | 'next' | 'initial',
    ) => {
        if (loadingLockRef.current.has(spineIndex)) return;
        const currentSpineItems = spineItemsRef.current;
        if (spineIndex < 0 || spineIndex >= currentSpineItems.length) return;

        const existingChapter = chaptersRef.current.find(ch => ch.spineIndex === spineIndex);
        if (existingChapter && existingChapter.status !== 'placeholder') return;

        loadingLockRef.current.add(spineIndex);
        pipelineRef.current = 'pre-fetching';

        const chapterId = `ch-${spineIndex}`;

        const loadingChapter: LoadedChapter = {
            spineIndex,
            id: chapterId,
            htmlContent: '',
            htmlFragments: [],
            externalStyles: [],
            domNode: null,
            height: existingChapter?.height || 0,
            status: 'loading',
        };

        setChapters(prev => {
            if (existingChapter) {
                return prev.map(ch => ch.spineIndex === spineIndex ? loadingChapter : ch);
            }
            if (direction === 'prev') return [loadingChapter, ...prev];
            return [...prev, loadingChapter];
        });

        try {
            const html = await provider.extractChapterHtml(spineIndex);
            let chapterStyles: string[] = [];
            try {
                chapterStyles = await provider.extractChapterStyles(spineIndex);
            } catch {
                // Styles are optional
            }

            const preprocessed = await preprocessChapterContent({
                chapterId,
                spineIndex,
                chapterHref: currentSpineItems[spineIndex]?.href,
                htmlContent: html,
                externalStyles: chapterStyles,
                vectorize: true,
                vectorConfig: {
                    targetChars: 16_000,
                    fontSize: readerStyles.fontSize,
                    pageWidth: readerStyles.pageWidth,
                    lineHeight: readerStyles.lineHeight,
                    paragraphSpacing: readerStyles.paragraphSpacing,
                },
            });

            const loaded: LoadedChapter = {
                ...loadingChapter,
                htmlContent: preprocessed.htmlContent,
                htmlFragments: preprocessed.htmlFragments,
                externalStyles: preprocessed.externalStyles,
                segmentMetas: preprocessed.segmentMetas,
                htmlBuffer: preprocessed.htmlBuffer,
                status: 'shadow-rendering',
            };

            // Update in list and add to shadow queue
            setChapters(prev =>
                prev.map(ch => ch.spineIndex === spineIndex ? loaded : ch)
            );
            setShadowQueue(prev => [...prev, loaded]);

            pipelineRef.current = 'rendering-offscreen';
        } catch (error) {
            console.error(`[ScrollReader] Failed to load chapter ${spineIndex}:`, error);
            if (existingChapter?.status === 'placeholder') {
                setChapters(prev =>
                    prev.map(ch => ch.spineIndex === spineIndex ? existingChapter : ch)
                );
            } else {
                setChapters(prev => prev.filter(ch => ch.spineIndex !== spineIndex));
            }
            pipelineRef.current = 'idle';
        } finally {
            loadingLockRef.current.delete(spineIndex);
        }
    }, [provider, readerStyles]);

    const runPredictivePrefetch = useCallback(() => {
        if (isUserScrollingRef.current) return;
        if (pipelineRef.current === 'anchoring-locked') return;

        const totalSpine = spineItemsRef.current.length;
        if (totalSpine === 0) return;

        const candidateIndexes = [
            currentSpineIndex - 1,
            currentSpineIndex,
            currentSpineIndex + 1,
        ].filter((index) => index >= 0 && index < totalSpine);

        candidateIndexes.forEach((index) => {
            if (loadingLockRef.current.has(index)) return;
            const existing = chaptersRef.current.find((chapter) => chapter.spineIndex === index);
            if (existing && existing.status !== 'placeholder') return;
            void loadChapter(index, index < currentSpineIndex ? 'prev' : 'next');
        });
    }, [currentSpineIndex, loadChapter]);

    useEffect(() => {
        if (!isInitialized) return;
        scheduleIdlePrefetch(() => {
            runPredictivePrefetch();
        });
        return () => {
            cancelIdlePrefetch();
        };
    }, [isInitialized, currentSpineIndex, chapters, runPredictivePrefetch, scheduleIdlePrefetch, cancelIdlePrefetch]);

    // ── Shadow Render Complete Handler ──

    const handleShadowReady = useCallback((
        spineIndex: number,
        node: HTMLElement,
        height: number,
    ) => {
        console.log(`[ScrollReader] Shadow ready: spine ${spineIndex}, height ${height}px`);

        // Remove from shadow queue
        setShadowQueue(prev => prev.filter(ch => ch.spineIndex !== spineIndex));

        // 构建 metaVector（若章节有 segmentMetas）
        const chapterId = `ch-${spineIndex}`;
        const ch = chaptersRef.current.find(c => c.spineIndex === spineIndex);
        if (ch?.segmentMetas && ch.segmentMetas.length > 0) {
            // Piece Table: htmlBuffer 是不可变 buffer，segmentMetas 通过 offset 索引
            const buffer = ch.htmlBuffer || ch.htmlContent;
            const vector = buildChapterMetaVector(chapterId, spineIndex, ch.segmentMetas, buffer);
            chapterVectorsRef.current.set(chapterId, vector);
        }

        // Determine if this is a prepend (previous chapter) or append
        setChapters(prev => {
            const index = prev.findIndex(c => c.spineIndex === spineIndex);
            if (index < 0) return prev;

            const updated = [...prev];
            updated[index] = {
                ...updated[index],
                domNode: node,
                height,
                status: 'ready',
            };
            return updated;
        });
    }, []);

    /** 强制 hydrate 指定段元素（供 jumpToSpine/applyHighlights 使用） */
    const forceHydrateSegment = useCallback((segmentEl: HTMLElement) => {
        const state = segmentEl.getAttribute('data-shadow-segment-state');
        if (state === 'hydrated') return;

        const chapterEl = segmentEl.closest('[data-chapter-id]') as HTMLElement | null;
        if (!chapterEl) return;
        const chapterId = chapterEl.getAttribute('data-chapter-id');
        if (!chapterId) return;

        const vector = chapterVectorsRef.current.get(chapterId);
        if (!vector) return;

        const segIndex = parseInt(segmentEl.getAttribute('data-shadow-segment-index') || '-1', 10);
        const meta = vector.segments[segIndex];
        if (!meta) return;

        // Piece Table: 按需从 buffer slice
        segmentEl.innerHTML = resolveSegmentHtml(vector.buffer, meta);
        segmentEl.setAttribute('data-shadow-segment-state', 'hydrated');
        segmentEl.style.minHeight = '0px';
    }, []);

    // ── Atomic DOM Commit (useLayoutEffect for prepend compensation) ──

    useLayoutEffect(() => {
        const viewport = viewportRef.current;
        const listEl = chapterListRef.current;
        if (!viewport || !listEl) return;

        const readyChapters = chapters.filter(ch => ch.status === 'ready');
        if (readyChapters.length === 0) return;

        readyChapters.forEach(ch => {
            const existingChapterEl = listEl.querySelector(`[data-chapter-id="${ch.id}"]`) as HTMLElement | null;
            const isInsertion = !existingChapterEl;

            // Check if this chapter needs prepend compensation
            const existingDomNodes = listEl.querySelectorAll('[data-chapter-id]');
            const isFirstInList = chapters.indexOf(ch) === 0;
            const needsCompensation = isInsertion && isFirstInList && existingDomNodes.length > 0;

            let anchorBefore: ReturnType<typeof captureAnchorInfo> | null = null;
            let oldScrollTop = 0;
            let expectedPrependHeight = 0;

            if (needsCompensation) {
                // Snapshot phase — capture anchor before DOM mutation
                pipelineRef.current = 'anchoring-locked';
                const anchor = findBestAnchor(viewport);
                anchorBefore = captureAnchorInfo(anchor);
                oldScrollTop = viewport.scrollTop;
                expectedPrependHeight = Math.max(1, Math.floor(ch.height || 0));
            }

            // Mutation phase — mount DOM
            const chapterEl = existingChapterEl || document.createElement('div');
            if (!existingChapterEl) {
                chapterEl.setAttribute('data-chapter-id', ch.id);
                chapterEl.className = styles.chapterBlock;
            }
            unobserveChapterResizeNodes(chapterEl);
            markChapterAsMounted(chapterEl, ch.height);
            chapterEl.replaceChildren();

            // Move the shadow-rendered node into the chapter element
            if (ch.domNode) {
                chapterEl.appendChild(ch.domNode);
            }

            if (isInsertion) {
                // Insert at the correct position
                const targetIndex = chapters.indexOf(ch);
                const existingNodes = Array.from(listEl.children);

                if (targetIndex === 0 && existingNodes.length > 0) {
                    listEl.prepend(chapterEl);
                } else if (targetIndex >= existingNodes.length) {
                    listEl.appendChild(chapterEl);
                } else {
                    listEl.insertBefore(chapterEl, existingNodes[targetIndex] || null);
                }
            }
            observeChapterResizeNodes(chapterEl);

            // Compensation phase — fix scroll position after prepend
            if (needsCompensation) {
                viewport.scrollTop = Math.max(0, oldScrollTop + expectedPrependHeight);
                lastScrollTopRef.current = viewport.scrollTop;
                console.log(`[ScrollReader] Scroll compensated by expected prepend height: ${expectedPrependHeight}px`);

                if (anchorBefore) {
                    const anchorAfter = captureAnchorInfo(anchorBefore.element);
                    const deltaY = calculateAnchorDelta(anchorBefore, anchorAfter);
                    if (Math.abs(deltaY) > 0.5) {
                        viewport.scrollTop = Math.max(0, viewport.scrollTop + deltaY);
                        lastScrollTopRef.current = viewport.scrollTop;
                        console.log(`[ScrollReader] Scroll fine-tuned by anchor delta: ${deltaY}px`);
                    }
                }
            }

            pipelineRef.current = 'idle';
        });

        // Mark as mounted
        setChapters(prev =>
            prev.map(ch =>
                ch.status === 'ready' ? { ...ch, status: 'mounted' } : ch
            )
        );

        // Handle initial scroll
        if (!initialScrollDone.current && initialScrollOffset > 0) {
            viewport.scrollTop = initialScrollOffset;
            lastScrollTopRef.current = viewport.scrollTop;
            initialScrollDone.current = true;
        }

        // Handle pending search text after chapter mount
        const searchText = pendingSearchTextRef.current;
        if (searchText) {
            pendingSearchTextRef.current = null;
            const mountedChapters = chapters.filter(ch => ch.status === 'ready' || ch.status === 'mounted');
            for (const ch of mountedChapters) {
                const el = listEl.querySelector(`[data-chapter-id="${ch.id}"]`) as HTMLElement | null;
                if (el) {
                    const range = findTextInDOM(el, searchText);
                    if (range) {
                        const rect = range.getBoundingClientRect();
                        const vpRect = viewport.getBoundingClientRect();
                        viewport.scrollTop += rect.top - vpRect.top;
                        lastScrollTopRef.current = viewport.scrollTop;
                        break;
                    }
                }
            }
        }

        if (!isInitialized && chapters.some(ch => ch.status === 'ready' || ch.status === 'mounted')) {
            setIsInitialized(true);
        }
    }, [chapters, initialScrollOffset, isInitialized, observeChapterResizeNodes, unobserveChapterResizeNodes]);

    // ── Scroll Event Handler ──

    useEffect(() => {
        const viewport = viewportRef.current;
        if (!viewport) return;

        const handleScroll = () => {
            isUserScrollingRef.current = true;
            cancelIdlePrefetch();
            if (scrollIdleTimerRef.current !== null) {
                window.clearTimeout(scrollIdleTimerRef.current);
            }
            scrollIdleTimerRef.current = window.setTimeout(() => {
                isUserScrollingRef.current = false;
                scheduleIdlePrefetch(() => {
                    runPredictivePrefetch();
                });
            }, SCROLL_IDLE_RESUME_MS);

            const scrollTop = viewport.scrollTop;
            const viewportHeight = viewport.clientHeight;
            const contentHeight = viewport.scrollHeight;
            const previousScrollTop = lastScrollTopRef.current;
            const rawDirection = detectScrollDirection(scrollTop, previousScrollTop);
            const direction: ScrollDirection = Math.abs(scrollTop - previousScrollTop) < 0.5 ? 'none' : rawDirection;
            lastScrollTopRef.current = scrollTop;

            if (pipelineRef.current === 'anchoring-locked') return;

            // Check if we need to preload
            const needsPreload = shouldPreloadChapter(
                scrollTop, viewportHeight, contentHeight, direction,
                { threshold: PRELOAD_THRESHOLD_PX }
            );

            if (needsPreload && pipelineRef.current === 'idle') {
                const sortedChapters = [...chapters].sort((a, b) => a.spineIndex - b.spineIndex);
                const mountedChapters = sortedChapters.filter(ch => ch.status === 'mounted');

                if (mountedChapters.length === 0) {
                    runPredictivePrefetch();
                }

                if (direction === 'up' && mountedChapters.length > 0) {
                    const earliest = mountedChapters[0].spineIndex;
                    if (earliest > 0) {
                        loadChapter(earliest - 1, 'prev');
                    }
                } else if (direction === 'down' && mountedChapters.length > 0) {
                    const latest = mountedChapters[mountedChapters.length - 1].spineIndex;
                    if (latest < spineItems.length - 1) {
                        loadChapter(latest + 1, 'next');
                    }
                }
            }

            // Update current chapter based on scroll position
            updateCurrentChapter(scrollTop, viewportHeight);

            // Debounced progress update
            if (progressTimerRef.current) {
                window.clearTimeout(progressTimerRef.current);
            }
            progressTimerRef.current = window.setTimeout(() => {
                updateProgress(scrollTop, viewportHeight);
            }, 200);
        };

        viewport.addEventListener('scroll', handleScroll, { passive: true });
        return () => {
            viewport.removeEventListener('scroll', handleScroll);
            if (scrollIdleTimerRef.current !== null) {
                window.clearTimeout(scrollIdleTimerRef.current);
                scrollIdleTimerRef.current = null;
            }
            if (progressTimerRef.current) {
                window.clearTimeout(progressTimerRef.current);
            }
        };
    }, [
        chapters,
        spineItems,
        loadChapter,
        runPredictivePrefetch,
        scheduleIdlePrefetch,
        cancelIdlePrefetch,
        currentSpineIndex,
        onChapterChange,
        onProgressChange,
        bookId,
    ]);

    // ── Chapter Unloading ──

    useEffect(() => {
        const mountedChapters = chapters.filter(ch => ch.status === 'mounted');
        const toUnload = mountedChapters
            .filter(ch => Math.abs(ch.spineIndex - currentSpineIndex) > ACTIVE_MOUNTED_WINDOW_RADIUS)
            .sort((a, b) =>
                Math.abs(b.spineIndex - currentSpineIndex) - Math.abs(a.spineIndex - currentSpineIndex)
            );

        if (toUnload.length === 0) return;

        const listEl = chapterListRef.current;
        toUnload.forEach(ch => {
            const idleHandle = highlightIdleHandlesRef.current.get(ch.spineIndex);
            if (idleHandle !== undefined) {
                cancelIdleTask(idleHandle);
                highlightIdleHandlesRef.current.delete(ch.spineIndex);
            }
            // Remove DOM
            if (listEl) {
                const domEl = listEl.querySelector(`[data-chapter-id="${ch.id}"]`) as HTMLElement | null;
                if (domEl) {
                    // 回收段元素到节点池
                    domEl.querySelectorAll('section[data-shadow-segment-index]').forEach(seg => {
                        segmentPool.release(seg as HTMLElement);
                    });
                    unobserveChapterResizeNodes(domEl);
                    releaseChapterDomResources(domEl);
                    markChapterAsPlaceholder(domEl, ch.height);
                }
            }
            // Free resources
            provider.unloadChapter(ch.spineIndex);
            // 清除 metaVector
            chapterVectorsRef.current.delete(ch.id);
        });

        const unloadIds = new Set(toUnload.map(ch => ch.spineIndex));
        setChapters(prev => prev.map(ch => {
            if (!unloadIds.has(ch.spineIndex)) return ch;
            return {
                ...ch,
                htmlContent: '',
                htmlFragments: [],
                externalStyles: [],
                domNode: null,
                height: resolveChapterPlaceholderHeight(ch.height),
                status: 'placeholder',
            };
        }));

        console.log(`[ScrollReader] Collapsed to placeholders: ${toUnload.map(ch => ch.spineIndex).join(', ')}`);
    }, [currentSpineIndex, chapters, provider, unobserveChapterResizeNodes]);

    // ── Current Chapter Detection ──

    const updateCurrentChapter = useCallback((scrollTop: number, viewportHeight: number) => {
        const listEl = chapterListRef.current;
        if (!listEl) return;

        const chapterProbeLine = scrollTop + Math.min(
            viewportHeight * CHAPTER_DETECTION_ANCHOR_RATIO,
            CHAPTER_DETECTION_ANCHOR_MAX_PX,
        );
        const chapterEls = Array.from(listEl.querySelectorAll('[data-chapter-id]')) as HTMLElement[];

        for (const el of chapterEls) {
            const top = el.offsetTop;
            const bottom = top + el.offsetHeight;

            if (chapterProbeLine >= top && chapterProbeLine < bottom) {
                const chapterIdAttr = el.getAttribute('data-chapter-id') || '';
                const match = chapterIdAttr.match(/^ch-(\d+)$/);
                if (match) {
                    const spineIdx = parseInt(match[1], 10);
                    if (spineIdx !== currentSpineIndex) {
                        setCurrentSpineIndex(spineIdx);
                        // Report chapter change
                        if (onChapterChange && spineItems[spineIdx]) {
                            onChapterChange(spineItems[spineIdx].id, spineItems[spineIdx].href);
                        }
                    }
                }
                break;
            }
        }
    }, [currentSpineIndex, spineItems, onChapterChange]);

    // ── Progress Calculation ──

    const updateProgress = useCallback((
        scrollTop: number,
        viewportHeight: number,
    ) => {
        if (spineItems.length === 0) return;

        // Find which chapter is in view
        const listEl = chapterListRef.current;
        if (!listEl) return;

        const viewportMid = scrollTop + viewportHeight / 2;
        const chapterEls = Array.from(listEl.querySelectorAll('[data-chapter-id]')) as HTMLElement[];

        let chapterProgress = 0;
        let resolvedSpineIndex = currentSpineIndex;
        let hasMatchedChapter = false;

        for (const el of chapterEls) {
            const top = el.offsetTop;
            const bottom = top + el.offsetHeight;
            const chapterIdAttr = el.getAttribute('data-chapter-id') || '';
            const match = chapterIdAttr.match(/^ch-(\d+)$/);

            if (match && viewportMid >= top && viewportMid < bottom) {
                const spineIdx = parseInt(match[1], 10);
                const localProgress = el.offsetHeight > 0
                    ? Math.max(0, Math.min(1, (viewportMid - top) / el.offsetHeight))
                    : 0;

                resolvedSpineIndex = spineIdx;
                chapterProgress = (spineIdx + localProgress) / spineItems.length;
                hasMatchedChapter = true;
                break;
            }
        }

        if (!hasMatchedChapter) return;

        const progress = Math.max(0, Math.min(1, chapterProgress));
        onProgressChange?.(progress);

        // Persist progress
        db.progress.put({
            bookId,
            location: `bdise:${resolvedSpineIndex}:${scrollTop}`,
            percentage: progress,
            currentChapter: spineItems[resolvedSpineIndex]?.href || '',
            updatedAt: Date.now(),
        }).catch(err => console.warn('[ScrollReader] Progress save failed:', err));
    }, [spineItems, bookId, currentSpineIndex, onProgressChange]);

    // ── Resize Anchor Restore ──

    useEffect(() => {
        const viewport = viewportRef.current;
        const listEl = chapterListRef.current;
        if (!viewport || !listEl) return;

        let resizeTimer: number | null = null;

        const observer = new ResizeObserver(() => {
            const oldScrollTop = viewport.scrollTop;
            const oldViewportHeight = viewport.clientHeight;
            const oldScrollable = Math.max(1, listEl.scrollHeight - oldViewportHeight);
            const oldProgressRatio = oldScrollTop / oldScrollable;

            const anchorElement = findBestAnchor(viewport);
            const anchorBefore = captureAnchorInfo(anchorElement);

            if (resizeTimer) {
                window.clearTimeout(resizeTimer);
            }

            resizeTimer = window.setTimeout(() => {
                requestAnimationFrame(() => {
                    if (anchorBefore.element.isConnected) {
                        const anchorAfter = captureAnchorInfo(anchorBefore.element);
                        const deltaY = calculateAnchorDelta(anchorBefore, anchorAfter);
                        if (Number.isFinite(deltaY) && Math.abs(deltaY) > 0.5) {
                            viewport.scrollTop = Math.max(0, oldScrollTop + deltaY);
                        }
                    } else {
                        const newScrollable = Math.max(1, listEl.scrollHeight - viewport.clientHeight);
                        viewport.scrollTop = Math.max(0, Math.min(newScrollable, oldProgressRatio * newScrollable));
                    }

                    lastScrollTopRef.current = viewport.scrollTop;
                    updateCurrentChapter(viewport.scrollTop, viewport.clientHeight);
                    updateProgress(viewport.scrollTop, viewport.clientHeight);
                });
            }, 110);
        });

        observer.observe(viewport);
        return () => {
            observer.disconnect();
            if (resizeTimer) {
                window.clearTimeout(resizeTimer);
            }
        };
    }, [updateCurrentChapter, updateProgress]);

    // ── TOC Jump ──

    const jumpToSpine = useCallback(async (targetSpineIndex: number, searchText?: string) => {
        if (targetSpineIndex < 0 || targetSpineIndex >= spineItemsRef.current.length) return;
        cancelIdlePrefetch();
        isUserScrollingRef.current = false;
        if (scrollIdleTimerRef.current !== null) {
            window.clearTimeout(scrollIdleTimerRef.current);
            scrollIdleTimerRef.current = null;
        }
        pendingSearchTextRef.current = searchText || null;
        initialScrollDone.current = true;
        stop();
        if (progressTimerRef.current) {
            window.clearTimeout(progressTimerRef.current);
            progressTimerRef.current = null;
        }

        setCurrentSpineIndex(targetSpineIndex);
        if (onChapterChange && spineItemsRef.current[targetSpineIndex]) {
            onChapterChange(
                spineItemsRef.current[targetSpineIndex].id,
                spineItemsRef.current[targetSpineIndex].href,
            );
        }

        // Check if already mounted
        const existing = chaptersRef.current.find(ch =>
            ch.spineIndex === targetSpineIndex && ch.status === 'mounted'
        );

        if (existing) {
            // Scroll to it
            const listEl = chapterListRef.current;
            const viewport = viewportRef.current;
            if (listEl && viewport) {
                const domEl = listEl.querySelector(`[data-chapter-id="ch-${targetSpineIndex}"]`) as HTMLElement | null;
                if (domEl) {
                    viewport.scrollTop = domEl.offsetTop;
                    lastScrollTopRef.current = viewport.scrollTop;
                    updateCurrentChapter(viewport.scrollTop, viewport.clientHeight);
                    updateProgress(viewport.scrollTop, viewport.clientHeight);

                    requestAnimationFrame(() => {
                        viewport.scrollTop = domEl.offsetTop;
                        lastScrollTopRef.current = viewport.scrollTop;
                        updateCurrentChapter(viewport.scrollTop, viewport.clientHeight);
                        updateProgress(viewport.scrollTop, viewport.clientHeight);
                    });

                    // If searchText, find and scroll to it
                    if (searchText) {
                        pendingSearchTextRef.current = null;
                        // 强制 hydrate 所有 placeholder 段以确保搜索可达
                        domEl.querySelectorAll('[data-shadow-segment-state="placeholder"]').forEach(seg => {
                            forceHydrateSegment(seg as HTMLElement);
                        });
                        const range = findTextInDOM(domEl, searchText);
                        if (range) {
                            const rect = range.getBoundingClientRect();
                            const vpRect = viewport.getBoundingClientRect();
                            viewport.scrollTop += rect.top - vpRect.top;
                            lastScrollTopRef.current = viewport.scrollTop;
                        }
                    }
                }
            }
            return;
        }

        // Clear all chapters and load from the target
        const viewport = viewportRef.current;
        if (viewport) {
            viewport.scrollTop = 0;
            lastScrollTopRef.current = 0;
        }
        const listEl = chapterListRef.current;
        if (listEl) {
            resetResizeObservers();
            listEl.innerHTML = '';
        }

        chaptersRef.current = [];
        setChapters([]);
        setShadowQueue([]);
        loadingLockRef.current.clear();
        pipelineRef.current = 'idle';
        setCurrentSpineIndex(targetSpineIndex);

        // loadChapter uses chaptersRef (always current), so no stale closure issue
        loadChapter(targetSpineIndex, 'initial');
    }, [cancelIdlePrefetch, forceHydrateSegment, loadChapter, onChapterChange, resetResizeObservers, stop, updateCurrentChapter, updateProgress]);

    useEffect(() => {
        const listEl = chapterListRef.current;
        if (!listEl) return;

        const handlePdfInternalLink = (event: MouseEvent) => {
            const target = event.target;
            if (!(target instanceof Element)) return;

            const anchor = target.closest('a[data-pdf-page]');
            if (!(anchor instanceof HTMLAnchorElement)) return;

            const rawPage = anchor.getAttribute('data-pdf-page');
            if (!rawPage) return;
            const targetSpine = Number.parseInt(rawPage, 10);
            if (!Number.isFinite(targetSpine)) return;
            if (targetSpine < 0 || targetSpine >= spineItemsRef.current.length) return;

            event.preventDefault();
            event.stopPropagation();
            void jumpToSpine(targetSpine);
        };

        listEl.addEventListener('click', handlePdfInternalLink);
        return () => {
            listEl.removeEventListener('click', handlePdfInternalLink);
        };
    }, [jumpToSpine]);

    // Expose jumpToSpine via ref for parent component
    useImperativeHandle(ref, () => ({
        jumpToSpine
    }));

    // ── Selection Detection ──

    useEffect(() => {
        const viewport = viewportRef.current;
        if (!viewport) return;

        const handleMouseUp = () => {
            const sel = window.getSelection();
            const text = sel?.toString().trim();
            if (!text || !sel?.rangeCount) {
                return;
            }

            const range = sel.getRangeAt(0);
            const rect = range.getBoundingClientRect();

            // Find which chapter this selection belongs to
            let node: Node | null = range.startContainer;
            let spineIdx = -1;
            while (node && node !== viewport) {
                if (node instanceof HTMLElement) {
                    const chId = node.getAttribute('data-chapter-id');
                    if (chId) {
                        const match = chId.match(/^ch-(\d+)$/);
                        if (match) spineIdx = parseInt(match[1], 10);
                        break;
                    }
                }
                node = node.parentNode;
            }

            setSelectionMenu({
                visible: true,
                x: rect.left + rect.width / 2,
                y: rect.top - 10,
                text,
                spineIndex: spineIdx,
            });
        };

        const handleContextMenu = (e: MouseEvent) => {
            const sel = window.getSelection();
            const text = sel?.toString().trim();
            if (!text) return;
            e.preventDefault();
            handleMouseUp();
        };

        viewport.addEventListener('mouseup', handleMouseUp);
        viewport.addEventListener('contextmenu', handleContextMenu);
        return () => {
            viewport.removeEventListener('mouseup', handleMouseUp);
            viewport.removeEventListener('contextmenu', handleContextMenu);
        };
    }, []);

    // Dismiss menu on scroll
    useEffect(() => {
        const viewport = viewportRef.current;
        if (!viewport || !selectionMenu.visible) return;

        const dismiss = () => setSelectionMenu(prev => ({ ...prev, visible: false }));
        viewport.addEventListener('scroll', dismiss, { passive: true, once: true });
        return () => viewport.removeEventListener('scroll', dismiss);
    }, [selectionMenu.visible]);

    // ── Highlight Rendering ──

    const applyHighlightsToChapter = useCallback((
        chapterEl: HTMLElement,
        spineIndex: number,
    ) => {
        // 强制 hydrate 所有 placeholder 段以确保高亮可达
        chapterEl.querySelectorAll('[data-shadow-segment-state="placeholder"]').forEach(seg => {
            forceHydrateSegment(seg as HTMLElement);
        });
        db.highlights.where('bookId').equals(bookId).toArray().then(highlights => {
            const matching = highlights.filter(h => {
                if (h.cfiRange.startsWith('bdise:')) {
                    return parseInt(h.cfiRange.split(':')[1], 10) === spineIndex;
                }
                if (h.cfiRange.startsWith('epubcfi(')) {
                    const m = h.cfiRange.match(/^epubcfi\(\/\d+\/(\d+)/);
                    return m ? Math.max(0, Math.floor(parseInt(m[1], 10) / 2) - 1) === spineIndex : false;
                }
                return false;
            });
            for (const h of matching) {
                if (renderedHighlightsRef.current.has(h.id)) continue;
                const range = findTextInDOM(chapterEl, h.text);
                if (range) {
                    highlightRange(range, h.id, h.color);
                    renderedHighlightsRef.current.add(h.id);
                }
            }
        }).catch(err => console.warn('[ScrollReader] Highlight load failed:', err));
    }, [bookId, forceHydrateSegment]);

    const scheduleHighlightInjection = useCallback((chapterEl: HTMLElement, spineIndex: number) => {
        const existing = highlightIdleHandlesRef.current.get(spineIndex);
        if (existing !== undefined) {
            cancelIdleTask(existing);
            highlightIdleHandlesRef.current.delete(spineIndex);
        }
        const handle = scheduleIdleTask(() => {
            highlightIdleHandlesRef.current.delete(spineIndex);
            applyHighlightsToChapter(chapterEl, spineIndex);
        }, { timeoutMs: HIGHLIGHT_IDLE_TIMEOUT_MS });
        highlightIdleHandlesRef.current.set(spineIndex, handle);
    }, [applyHighlightsToChapter]);

    // Apply highlights when chapters become mounted
    useLayoutEffect(() => {
        const listEl = chapterListRef.current;
        if (!listEl) return;

        const mountedChapters = chapters.filter(ch => ch.status === 'mounted');
        for (const ch of mountedChapters) {
            const el = listEl.querySelector(`[data-chapter-id="${ch.id}"]`) as HTMLElement | null;
            if (el) {
                scheduleHighlightInjection(el, ch.spineIndex);
            }
        }
    }, [chapters, scheduleHighlightInjection]);

    // ── IntersectionObserver 驱动段级按需 hydration ──

    const segmentIORef = useRef<IntersectionObserver | null>(null);
    const hydrationQueueRef = useRef<Set<HTMLElement>>(new Set());
    const hydrationRafRef = useRef<number | null>(null);

    const IO_HYDRATION_BATCH_SIZE = 4;

    /** 批量 hydration 流程 */
    const flushHydrationQueue = useCallback(() => {
        hydrationRafRef.current = null;
        const queue = hydrationQueueRef.current;
        if (queue.size === 0) return;

        const viewport = viewportRef.current;
        if (!viewport) return;

        // 取最多 IO_HYDRATION_BATCH_SIZE 段
        const batch: HTMLElement[] = [];
        for (const el of queue) {
            if (batch.length >= IO_HYDRATION_BATCH_SIZE) break;
            batch.push(el);
        }
        for (const el of batch) queue.delete(el);

        // 阶段 4A: 物化阶段（写 innerHTML）
        const hydratedPairs: { el: HTMLElement; chapterId: string; segIndex: number }[] = [];
        for (const segmentEl of batch) {
            const state = segmentEl.getAttribute('data-shadow-segment-state');
            if (state === 'hydrated') continue;

            const chapterEl = segmentEl.closest('[data-chapter-id]') as HTMLElement | null;
            if (!chapterEl) continue;
            const chapterId = chapterEl.getAttribute('data-chapter-id');
            if (!chapterId) continue;

            const vector = chapterVectorsRef.current.get(chapterId);
            if (!vector) continue;

            const segIndex = parseInt(segmentEl.getAttribute('data-shadow-segment-index') || '-1', 10);
            const meta = vector.segments[segIndex];
            if (!meta) continue;

            segmentEl.innerHTML = resolveSegmentHtml(vector.buffer, meta);
            segmentEl.setAttribute('data-shadow-segment-state', 'hydrated');
            segmentEl.style.minHeight = '0px';
            hydratedPairs.push({ el: segmentEl, chapterId, segIndex });
        }

        if (hydratedPairs.length === 0) {
            if (queue.size > 0) {
                hydrationRafRef.current = requestAnimationFrame(flushHydrationQueue);
            }
            return;
        }

        // yield rAF → 测量阶段（读 height）→ 数据更新 → 写阶段
        requestAnimationFrame(() => {
            const viewportScrollTop = viewport.scrollTop;

            // 测量阶段（批量读 height）
            const measurements = hydratedPairs.map(({ el, chapterId, segIndex }) => ({
                el,
                chapterId,
                segIndex,
                realHeight: Math.max(96, el.getBoundingClientRect().height),
            }));

            // 按 chapterId 分组更新 metaVector
            const groupedByChapter = new Map<string, { index: number; realHeight: number }[]>();
            for (const m of measurements) {
                let list = groupedByChapter.get(m.chapterId);
                if (!list) {
                    list = [];
                    groupedByChapter.set(m.chapterId, list);
                }
                list.push({ index: m.segIndex, realHeight: m.realHeight });
            }

            let totalDelta = 0;
            // 找出在视口上方的段的 delta（用于滚动补偿）
            for (const m of measurements) {
                const elTop = m.el.getBoundingClientRect().top + viewportScrollTop - (viewport.getBoundingClientRect().top + viewportScrollTop);
                if (elTop < viewportScrollTop) {
                    const vector = chapterVectorsRef.current.get(m.chapterId);
                    if (vector) {
                        const seg = vector.segments[m.segIndex];
                        if (seg) {
                            const oldHeight = seg.realHeight ?? seg.estimatedHeight;
                            totalDelta += m.realHeight - oldHeight;
                        }
                    }
                }
            }

            // 数据更新阶段（纯计算）
            for (const [chapterId, updates] of groupedByChapter) {
                const vector = chapterVectorsRef.current.get(chapterId);
                if (vector) {
                    batchUpdateSegmentHeights(vector, updates);
                }
            }

            // 写阶段（containIntrinsicSize）
            for (const m of measurements) {
                m.el.style.containIntrinsicSize = `${m.realHeight}px`;
            }

            // 滚动补偿：若段在视口上方
            if (Math.abs(totalDelta) > 1) {
                viewport.scrollTop = viewportScrollTop + totalDelta;
                lastScrollTopRef.current = viewport.scrollTop;
            }

            // 若队列还有待处理的段，继续下一帧
            if (queue.size > 0) {
                hydrationRafRef.current = requestAnimationFrame(flushHydrationQueue);
            }
        });
    }, []);

    // IO 创建与段注册
    useEffect(() => {
        const viewport = viewportRef.current;
        if (!viewport) return;

        // IO try-catch: 失败则保持现有 rIC 全量 hydration
        let observer: IntersectionObserver;
        try {
            observer = new IntersectionObserver((entries) => {
                let needsFlush = false;
                for (const entry of entries) {
                    const el = entry.target as HTMLElement;
                    const state = el.getAttribute('data-shadow-segment-state');
                    if (entry.isIntersecting && state === 'placeholder') {
                        hydrationQueueRef.current.add(el);
                        needsFlush = true;
                    }
                }
                if (needsFlush && hydrationRafRef.current === null) {
                    hydrationRafRef.current = requestAnimationFrame(flushHydrationQueue);
                }
            }, {
                root: viewport,
                rootMargin: '600px 0px',
                threshold: [0],
            });
        } catch (e) {
            console.warn('[ScrollReader] IntersectionObserver init failed, relying on fallback rIC hydration:', e);
            return;
        }

        segmentIORef.current = observer;

        return () => {
            observer.disconnect();
            segmentIORef.current = null;
            if (hydrationRafRef.current !== null) {
                cancelAnimationFrame(hydrationRafRef.current);
                hydrationRafRef.current = null;
            }
            hydrationQueueRef.current.clear();
        };
    }, [flushHydrationQueue]);

    // 章节挂载后注册段 IO observe
    useLayoutEffect(() => {
        const io = segmentIORef.current;
        if (!io) return;

        const listEl = chapterListRef.current;
        if (!listEl) return;

        const placeholderSegments = listEl.querySelectorAll('[data-shadow-segment-state="placeholder"]');
        placeholderSegments.forEach(el => {
            io.observe(el);
        });

        return () => {
            placeholderSegments.forEach(el => {
                io.unobserve(el);
            });
        };
    }, [chapters]);

    // ── Selection Menu Handlers ──

    const dismissMenu = useCallback(() => {
        setSelectionMenu(prev => ({ ...prev, visible: false }));
        window.getSelection()?.removeAllRanges();
    }, []);

    const handleCopy = useCallback(() => {
        navigator.clipboard.writeText(selectionMenu.text);
        dismissMenu();
    }, [selectionMenu.text, dismissMenu]);

    const handleHighlight = useCallback(async (color: string) => {
        const { text, spineIndex } = selectionMenu;
        const id = crypto.randomUUID();
        const cfiRange = `bdise:${spineIndex}`;

        await db.highlights.add({
            id,
            bookId,
            cfiRange,
            color,
            text,
            createdAt: Date.now(),
        });

        // Immediately render the highlight in DOM
        const listEl = chapterListRef.current;
        if (listEl) {
            const chapterEl = listEl.querySelector(`[data-chapter-id="ch-${spineIndex}"]`) as HTMLElement | null;
            if (chapterEl) {
                const range = findTextInDOM(chapterEl, text);
                if (range) {
                    highlightRange(range, id, color);
                    renderedHighlightsRef.current.add(id);
                }
            }
        }
        dismissMenu();
    }, [selectionMenu, bookId, dismissMenu]);

    const handleAddNote = useCallback(async () => {
        setNoteDialog({
            visible: true,
            text: selectionMenu.text,
            spineIndex: selectionMenu.spineIndex,
        });
        dismissMenu();
    }, [selectionMenu, dismissMenu]);

    const handleNoteSave = useCallback(async (note: string) => {
        await db.bookmarks.add({
            id: crypto.randomUUID(), bookId,
            location: `bdise:${noteDialog.spineIndex}`,
            title: noteDialog.text.slice(0, 80),
            note,
            createdAt: Date.now(),
        });
        setNoteDialog({ visible: false, text: '', spineIndex: -1 });
    }, [noteDialog, bookId]);

    const handleSearch = useCallback(() => {
        const keyword = selectionMenu.text.trim();
        if (!keyword) return;
        onSelectionSearch?.(keyword);
        dismissMenu();
    }, [selectionMenu.text, onSelectionSearch, dismissMenu]);

    const handleWebSearch = useCallback(() => {
        const q = encodeURIComponent(selectionMenu.text.trim());
        if (!q) return;
        window.electronAPI.openExternal(`https://www.google.com/search?q=${q}`);
        dismissMenu();
    }, [selectionMenu.text, dismissMenu]);

    const handleReadAloud = useCallback(() => {
        const text = selectionMenu.text.trim();
        if (!text) return;
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(text);
        utter.lang = 'zh-CN';
        utter.rate = 1;
        window.speechSynthesis.speak(utter);
        dismissMenu();
    }, [selectionMenu.text, dismissMenu]);

    const runTranslate = useCallback(async (text: string) => {
        const sourceText = text.trim();
        if (!sourceText) return;

        setTranslateDialog({
            visible: true,
            sourceText,
            translatedText: '',
            loading: true,
            error: '',
            providerLabel: '-',
            fromCache: false,
        });

        try {
            const result = await translateText(sourceText);
            if (!result.ok) {
                setTranslateDialog((prev) => ({
                    ...prev,
                    loading: false,
                    error: result.error || '翻译失败',
                    providerLabel: getProviderLabel(result.provider),
                    fromCache: false,
                }));
                return;
            }

            setTranslateDialog((prev) => ({
                ...prev,
                loading: false,
                error: '',
                translatedText: result.translatedText,
                providerLabel: getProviderLabel(result.provider),
                fromCache: result.fromCache,
            }));
        } catch (error: any) {
            setTranslateDialog((prev) => ({
                ...prev,
                loading: false,
                error: error?.message || '翻译请求异常',
            }));
        }
    }, []);

    const handleTranslate = useCallback(() => {
        const text = selectionMenu.text.trim();
        if (!text) return;
        void runTranslate(text);
        dismissMenu();
    }, [selectionMenu.text, dismissMenu, runTranslate]);

    // ── Render ──

    return (
        <div
            className={styles.bdiseViewport}
            ref={viewportRef}
            style={{ overflow: 'hidden' }} // Override to disable native scrolling
        >
            {/* Shadow rendering area */}
            <div className={styles.shadowArea}>
                {shadowQueue.map(ch => (
                    <ShadowRenderer
                        key={ch.id}
                        htmlContent={ch.htmlContent}
                        htmlFragments={ch.htmlFragments}
                        segmentMetas={ch.segmentMetas}
                        htmlBuffer={ch.htmlBuffer}
                        chapterId={ch.id}
                        externalStyles={ch.externalStyles}
                        preprocessed
                        readerStyles={readerStyles}
                        onReady={(node, height) => handleShadowReady(ch.spineIndex, node, height)}
                        onError={(err) => {
                            console.error(`[ScrollReader] Shadow error for ${ch.id}:`, err);
                            setShadowQueue(prev => prev.filter(q => q.spineIndex !== ch.spineIndex));
                        }}
                    />
                ))}
            </div>

            {/* Chapter list — DOM nodes are mounted here by useLayoutEffect */}
            <div className={styles.chapterList} ref={chapterListRef}>
                {/* Loading indicator at top */}
                {chapters.length > 0 &&
                    chapters[0].spineIndex > 0 &&
                    (chapters[0].status === 'loading' || chapters[0].status === 'shadow-rendering') && (
                        <div className={styles.loadingIndicator}>
                            <span className={styles.loadingDot} />
                            <span className={styles.loadingDot} />
                            <span className={styles.loadingDot} />
                        </div>
                    )}
            </div>

            {/* Loading indicator at bottom */}
            {chapters.length > 0 && (
                chapters[chapters.length - 1].status === 'loading' ||
                chapters[chapters.length - 1].status === 'shadow-rendering'
            ) && (
                    <div className={styles.loadingIndicator}>
                        <span className={styles.loadingDot} />
                        <span className={styles.loadingDot} />
                        <span className={styles.loadingDot} />
                    </div>
                )}

            {/* Empty state */}
            {!isInitialized && chapters.length === 0 && (
                <div className={styles.emptyState}>Loading...</div>
            )}

            {/* Selection Menu */}
            <SelectionMenu
                visible={selectionMenu.visible}
                x={selectionMenu.x}
                y={selectionMenu.y}
                onCopy={handleCopy}
                onHighlight={handleHighlight}
                onNote={handleAddNote}
                onSearch={handleSearch}
                onWebSearch={handleWebSearch}
                onReadAloud={handleReadAloud}
                onTranslate={handleTranslate}
                onDismiss={dismissMenu}
            />

            <NoteDialog
                visible={noteDialog.visible}
                selectedText={noteDialog.text}
                onSave={handleNoteSave}
                onCancel={() => setNoteDialog({ visible: false, text: '', spineIndex: -1 })}
            />

            <TranslationDialog
                visible={translateDialog.visible}
                sourceText={translateDialog.sourceText}
                translatedText={translateDialog.translatedText}
                providerLabel={translateDialog.providerLabel}
                fromCache={translateDialog.fromCache}
                loading={translateDialog.loading}
                error={translateDialog.error}
                onRetry={() => void runTranslate(translateDialog.sourceText)}
                onClose={() => setTranslateDialog((prev) => ({ ...prev, visible: false }))}
            />
        </div>
    );
});

ScrollReaderView.displayName = 'ScrollReaderView';
