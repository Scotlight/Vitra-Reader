import {
    useRef, useEffect, useState, useCallback, useLayoutEffect,
    forwardRef, useImperativeHandle, useMemo
} from 'react';
import type { ContentProvider, SpineItemInfo } from '../../engine/core/contentProvider';
import { ShadowRenderer, ReaderStyleConfig, createWindowedVectorChapterShell, segmentPool } from './ShadowRenderer';
import {
    shouldPreloadChapter,
    detectScrollDirection,
    ScrollDirection,
} from '../../utils/scrollDetection';
import { useScrollInertia } from '../../hooks/useScrollInertia';
import { useScrollEvents } from '../../hooks/useScrollEvents';
import { db, type Highlight } from '../../services/storageService';
import { findTextAcrossSegments, findTextInDOM, highlightRange } from '../../utils/textFinder';
import { preprocessChapterContent } from '../../engine/render/chapterPreprocessService';
import {
    buildChapterMetaVector,
    batchUpdateSegmentHeights,
    type ChapterMetaVector,
    type SegmentMeta,
} from '../../engine';
import { cancelIdleTask, scheduleIdleTask, type IdleTaskHandle } from '../../utils/idleScheduler';
import { clampNumber } from '../../utils/mathUtils';
import { useSelectionMenu } from '../../hooks/useSelectionMenu';
import { releaseMediaResources } from '../../utils/mediaResourceCleanup';
import { captureAnchorInfo, calculateAnchorDelta, findBestAnchor } from '../../utils/anchorDetection';
import {
    canRestoreWindowedVectorPlaceholder,
    computeGlobalVirtualSegmentMountPlan,
    partitionStyleChangeTargets,
    shouldBypassShadowQueueForSegmentMetas,
} from './scrollVectorStrategy';
import {
    findAncestorChapterSpineIndex,
    findChapterAtViewportOffset,
    parseChapterSpineIndex,
    resolveViewportChapterProgress,
    type ChapterViewportEntry,
} from './scrollChapterViewport';
import styles from './ScrollReaderView.module.css';

// ── Types ──

interface LoadedChapter {
    spineIndex: number;
    id: string;
    htmlContent: string;
    htmlFragments: string[];
    externalStyles: string[];
    segmentMetas?: SegmentMeta[];
    vectorStyleKey?: string;
    domNode: HTMLElement | null;
    height: number;
    status: 'loading' | 'shadow-rendering' | 'ready' | 'mounted' | 'placeholder';
    mountedAt?: number;
}

interface VirtualChapterRuntime {
    chapterId: string;
    spineIndex: number;
    chapterEl: HTMLElement;
    contentEl: HTMLElement;
    vector: ChapterMetaVector;
    activeSegmentEls: Map<number, HTMLElement>;
}

type PipelineState =
    | 'idle'
    | 'pre-fetching'
    | 'rendering-offscreen';

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
// 上方章节保留 10 章缓冲（占位符高度保持机制可防止坐标系崩溃）
const UNLOAD_ABOVE_RADIUS = 10;
// 下方章节超出 3 章时才卸载（下方消失不影响当前 scrollTop）
const UNLOAD_BELOW_RADIUS = 3;
const UNLOAD_COOLDOWN_MS = 3000;
const SCROLL_IDLE_RESUME_MS = 200;
const PREFETCH_IDLE_TIMEOUT_MS = 120;
const CHAPTER_DETECTION_ANCHOR_RATIO = 0.22;
const CHAPTER_DETECTION_ANCHOR_MAX_PX = 140;
const HIGHLIGHT_IDLE_TIMEOUT_MS = 600;
const CHAPTER_PLACEHOLDER_MIN_HEIGHT_PX = 240;
const CHAPTER_PLACEHOLDER_DEFAULT_HEIGHT_PX = 800;
const SCROLL_HEDGE_EPSILON_PX = 0.1;
const INSTANT_SCROLL_BEHAVIOR: ScrollBehavior = 'auto';
const RANGE_HYDRATION_OVERSCAN_SEGMENTS = 3;
const RANGE_HYDRATION_PRELOAD_MARGIN_PX = 720;
const GLOBAL_VIRTUAL_SEGMENT_BUDGET = 18;
const VIRTUAL_SEGMENT_MIN_HEIGHT_PX = 96;
const SEARCH_SEGMENT_WINDOW_RADIUS = 1;

// ── 物理引擎调参常量 ──
const PHYSICS_FRICTION_NUMERATOR = 26;
const PHYSICS_FRICTION_NO_EASING_OFFSET = 0.02;
const PHYSICS_FRICTION_MIN = 0.04;
const PHYSICS_FRICTION_MAX = 0.18;
const PHYSICS_STOP_THRESHOLD_EASING = 0.08;
const PHYSICS_STOP_THRESHOLD_LINEAR = 0.14;
const PHYSICS_SPRING_STIFFNESS = 0.06;
const PHYSICS_SPRING_DAMPING_EASING = 0.7;
const PHYSICS_SPRING_DAMPING_LINEAR = 0.55;
const INERTIA_IMPULSE_BLEND_BASE = 0.72;
const INERTIA_IMPULSE_BLEND_RATIO_SCALE = 0.05;
const INERTIA_IMPULSE_BLEND_MIN = 0.65;
const INERTIA_IMPULSE_BLEND_MAX = 0.94;
const INERTIA_IMPULSE_GAIN_BASE = 0.18;
const INERTIA_IMPULSE_GAIN_STEP_REF = 120;
const INERTIA_IMPULSE_GAIN_STEP_DIVISOR = 900;
const INERTIA_IMPULSE_GAIN_MIN = 0.1;
const INERTIA_IMPULSE_GAIN_MAX = 0.38;
const INERTIA_VELOCITY_STEP_FACTOR = 0.75;
const INERTIA_VELOCITY_ACCEL_FACTOR = 5;
const INERTIA_VELOCITY_MIN = 48;
const INERTIA_VELOCITY_MAX = 220;
const INERTIA_FRAME_CAP_EASING_MS = 24;
const INERTIA_FRAME_CAP_LINEAR_MS = 32;
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



function resolveChapterPlaceholderHeight(height: number): number {
    // 已被 ResizeObserver 实测过的高度：原值直接用，保留亚像素精度，杜绝舍入漂移
    if (height > CHAPTER_PLACEHOLDER_MIN_HEIGHT_PX) return height;
    return Math.max(
        CHAPTER_PLACEHOLDER_MIN_HEIGHT_PX,
        height || CHAPTER_PLACEHOLDER_DEFAULT_HEIGHT_PX,
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

function releaseChapterSegmentNodes(chapterEl: HTMLElement): void {
    chapterEl.querySelectorAll('section[data-shadow-segment-index]').forEach((segmentEl) => {
        segmentPool.release(segmentEl as HTMLElement);
    });
}

function getVectorContentContainer(node: ParentNode | null): HTMLElement | null {
    if (!node) return null;
    return node.querySelector('[data-vitra-vector-content="true"]') as HTMLElement | null;
}

function resolveVirtualSegmentHeight(segment: SegmentMeta): number {
    return Math.max(VIRTUAL_SEGMENT_MIN_HEIGHT_PX, segment.realHeight ?? segment.estimatedHeight);
}

function updateVirtualContentHeight(contentEl: HTMLElement, vector: ChapterMetaVector): void {
    const totalHeight = Math.max(1, vector.totalEstimatedHeight);
    contentEl.style.height = `${totalHeight}px`;
    contentEl.style.minHeight = `${totalHeight}px`;
    contentEl.setAttribute('data-vitra-vector-total-height', String(totalHeight));
}

function updateVirtualSegmentLayout(segmentEl: HTMLElement, segment: SegmentMeta): void {
    segmentEl.style.transform = `translateY(${Math.max(0, segment.offsetY)}px)`;
    segmentEl.style.containIntrinsicSize = `${resolveVirtualSegmentHeight(segment)}px`;
}

function insertVirtualSegmentInOrder(
    container: HTMLElement,
    activeSegmentEls: ReadonlyMap<number, HTMLElement>,
    nextIndex: number,
    segmentEl: HTMLElement,
): void {
    const ordered = Array.from(activeSegmentEls.entries())
        .sort((a, b) => a[0] - b[0]);
    const nextSibling = ordered.find(([index]) => index > nextIndex)?.[1] ?? null;
    container.insertBefore(segmentEl, nextSibling);
}

function normalizeSearchText(input: string): string {
    return input.replace(/\s+/g, ' ').trim();
}

function collectChapterViewportEntries(listEl: HTMLElement): ChapterViewportEntry[] {
    return Array.from(listEl.querySelectorAll('[data-chapter-id]'))
        .map((node) => {
            const el = node as HTMLElement;
            const spineIndex = parseChapterSpineIndex(el.getAttribute('data-chapter-id'));
            if (spineIndex === null) return null;
            return {
                spineIndex,
                top: el.offsetTop,
                bottom: el.offsetTop + el.offsetHeight,
            };
        })
        .filter((entry): entry is ChapterViewportEntry => entry !== null);
}

function shouldUseWindowedVectorChapter(segmentMetas: readonly SegmentMeta[] | undefined): boolean {
    return shouldBypassShadowQueueForSegmentMetas(segmentMetas);
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
    const jumpGenerationRef = useRef(0);

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
    const virtualChaptersRef = useRef<Map<string, VirtualChapterRuntime>>(new Map());
    const virtualMeasureQueueRef = useRef<Map<string, { chapterId: string; segIndex: number; el: HTMLElement }>>(new Map());
    const virtualMeasureRafRef = useRef<number | null>(null);
    const virtualSyncRafRef = useRef<number | null>(null);
    const syncVirtualizedSegmentsRef = useRef<(scrollTop: number, viewportHeight: number) => void>(() => {});
    const revealSearchInChapterRef = useRef<(chapterEl: HTMLElement, chapterId: string, searchText: string) => boolean>(() => false);
    const applyVirtualHighlightsRef = useRef<(spineIndex: number, segmentEl: HTMLElement) => void>(() => {});
    const chapterHighlightCacheRef = useRef<Map<number, Highlight[]>>(new Map());
    const segmentSearchTextCacheRef = useRef<Map<string, string>>(new Map());

    // ── Selection Menu (shared hook) ──
    const getHighlightContainer = useCallback((spineIndex: number): HTMLElement | null => {
        const listEl = chapterListRef.current;
        if (!listEl) return null;
        return listEl.querySelector(`[data-chapter-id="ch-${spineIndex}"]`) as HTMLElement | null;
    }, []);
    const handleHighlightCreated = useCallback((highlight: Highlight, spineIndex: number) => {
        const existing = chapterHighlightCacheRef.current.get(spineIndex) || [];
        if (existing.some((item) => item.id === highlight.id)) {
            return;
        }
        chapterHighlightCacheRef.current.set(spineIndex, [...existing, highlight]);
    }, []);
    const {
        selectionMenu, setSelectionMenu,
        renderedHighlightsRef,
        renderSelectionUI,
    } = useSelectionMenu({ bookId, onSelectionSearch, getHighlightContainer, onHighlightCreated: handleHighlightCreated });
    const highlightIdleHandlesRef = useRef<Map<number, IdleTaskHandle>>(new Map());
    // rAF 批处理：收集同帧内完成的所有 shadow-ready 事件，合并为一次 setChapters
    const pendingReadyRef = useRef<Array<{ spineIndex: number; node: HTMLElement; height: number }>>([]);
    const pendingReadyRafRef = useRef<number | null>(null);
    const styleReloadRafRef = useRef<number | null>(null);
    const pendingDeltaRef = useRef(0);
    const flushRafRef = useRef<number | null>(null);
    const unlockAdjustingRafRef = useRef<number | null>(null);
    const ignoreScrollEventRef = useRef(false);
    const lastKnownAnchorIndexRef = useRef(initialSpineIndex);
    const shadowResourceExists = useCallback((url: string) => {
        return provider.isAssetUrlAvailable?.(url) ?? true;
    }, [provider]);

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

    const requestFlush = useCallback(() => {
        if (flushRafRef.current !== null) return;

        flushRafRef.current = requestAnimationFrame(() => {
            flushRafRef.current = null;

            const viewport = viewportRef.current;
            if (!viewport) {
                pendingDeltaRef.current = 0;
                return;
            }

            const totalDelta = pendingDeltaRef.current;
            if (Math.abs(totalDelta) <= SCROLL_HEDGE_EPSILON_PX) {
                pendingDeltaRef.current = 0;
                return;
            }

            pendingDeltaRef.current = 0;
            ignoreScrollEventRef.current = true;
            const targetTop = viewport.scrollTop + totalDelta;
            viewport.scrollTo({ top: targetTop, behavior: INSTANT_SCROLL_BEHAVIOR });

            if (unlockAdjustingRafRef.current !== null) {
                cancelAnimationFrame(unlockAdjustingRafRef.current);
            }

            unlockAdjustingRafRef.current = requestAnimationFrame(() => {
                unlockAdjustingRafRef.current = requestAnimationFrame(() => {
                    unlockAdjustingRafRef.current = null;
                    ignoreScrollEventRef.current = false;
                });
            });
        });
    }, []);

    const physicsConfig = useMemo(() => {
        const friction = clampNumber(PHYSICS_FRICTION_NUMERATOR / normalizedSmoothConfig.animationTimeMs + (normalizedSmoothConfig.easing ? 0 : PHYSICS_FRICTION_NO_EASING_OFFSET), PHYSICS_FRICTION_MIN, PHYSICS_FRICTION_MAX);
        const stopThreshold = normalizedSmoothConfig.easing ? PHYSICS_STOP_THRESHOLD_EASING : PHYSICS_STOP_THRESHOLD_LINEAR;
        const springStiffness = PHYSICS_SPRING_STIFFNESS;
        const springDamping = normalizedSmoothConfig.easing ? PHYSICS_SPRING_DAMPING_EASING : PHYSICS_SPRING_DAMPING_LINEAR;
        return {
            friction,
            stopThreshold,
            springStiffness,
            springDamping,
        };
    }, [normalizedSmoothConfig.animationTimeMs, normalizedSmoothConfig.easing]);

    const inertiaTuning = useMemo(() => {
        const ratio = normalizedSmoothConfig.tailToHeadRatio;
        const impulseBlend = clampNumber(INERTIA_IMPULSE_BLEND_BASE + (ratio - 1) * INERTIA_IMPULSE_BLEND_RATIO_SCALE, INERTIA_IMPULSE_BLEND_MIN, INERTIA_IMPULSE_BLEND_MAX);
        const impulseGain = clampNumber(INERTIA_IMPULSE_GAIN_BASE + (normalizedSmoothConfig.stepSizePx - INERTIA_IMPULSE_GAIN_STEP_REF) / INERTIA_IMPULSE_GAIN_STEP_DIVISOR, INERTIA_IMPULSE_GAIN_MIN, INERTIA_IMPULSE_GAIN_MAX);
        const maxAbsVelocity = clampNumber(normalizedSmoothConfig.stepSizePx * INERTIA_VELOCITY_STEP_FACTOR + normalizedSmoothConfig.accelerationMax * INERTIA_VELOCITY_ACCEL_FACTOR, INERTIA_VELOCITY_MIN, INERTIA_VELOCITY_MAX);
        const frameCapMs = normalizedSmoothConfig.easing ? INERTIA_FRAME_CAP_EASING_MS : INERTIA_FRAME_CAP_LINEAR_MS;
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
        observedResizeHeightsRef.current.set(node, Math.max(1, node.getBoundingClientRect().height));
        resizeObserverRef.current?.observe(node);
    }, []);

    const unobserveResizeNode = useCallback((node: HTMLElement | null) => {
        if (!node) return;
        if (!observedResizeNodesRef.current.has(node)) return;
        observedResizeNodesRef.current.delete(node);
        resizeObserverRef.current?.unobserve(node);
    }, []);

    const refreshVirtualChapterLayout = useCallback((runtime: VirtualChapterRuntime) => {
        updateVirtualContentHeight(runtime.contentEl, runtime.vector);
        runtime.activeSegmentEls.forEach((segmentEl, index) => {
            const meta = runtime.vector.segments[index];
            if (!meta) return;
            updateVirtualSegmentLayout(segmentEl, meta);
        });
    }, []);

    const cleanupVirtualChapterRuntime = useCallback((chapterId: string) => {
        const runtime = virtualChaptersRef.current.get(chapterId);
        if (!runtime) return;

        runtime.activeSegmentEls.forEach((segmentEl) => {
            unobserveResizeNode(segmentEl);
            if (segmentEl.isConnected) {
                segmentEl.remove();
            }
            segmentPool.release(segmentEl);
        });
        runtime.activeSegmentEls.clear();
        virtualChaptersRef.current.delete(chapterId);
    }, [unobserveResizeNode]);

    const enqueueVirtualMeasurement = useCallback((chapterId: string, segIndex: number, el: HTMLElement) => {
        virtualMeasureQueueRef.current.set(`${chapterId}:${segIndex}`, { chapterId, segIndex, el });
        if (virtualMeasureRafRef.current !== null) return;

        virtualMeasureRafRef.current = requestAnimationFrame(() => {
            virtualMeasureRafRef.current = null;
            const viewport = viewportRef.current;
            const queued = Array.from(virtualMeasureQueueRef.current.values());
            virtualMeasureQueueRef.current.clear();
            if (!viewport || queued.length === 0) return;

            const anchorElement = findBestAnchor(viewport);
            const anchorBefore = captureAnchorInfo(anchorElement);
            const groupedUpdates = new Map<string, Map<number, number>>();

            queued.forEach(({ chapterId, segIndex, el }) => {
                const runtime = virtualChaptersRef.current.get(chapterId);
                if (!runtime || !el.isConnected) return;
                if (!runtime.activeSegmentEls.has(segIndex)) return;
                const realHeight = Math.max(VIRTUAL_SEGMENT_MIN_HEIGHT_PX, el.getBoundingClientRect().height);
                let chapterUpdates = groupedUpdates.get(chapterId);
                if (!chapterUpdates) {
                    chapterUpdates = new Map<number, number>();
                    groupedUpdates.set(chapterId, chapterUpdates);
                }
                chapterUpdates.set(segIndex, realHeight);
            });

            if (groupedUpdates.size === 0) return;

            let needsCompensation = false;
            const heightUpdates = new Map<number, number>();
            groupedUpdates.forEach((chapterUpdates, chapterId) => {
                const runtime = virtualChaptersRef.current.get(chapterId);
                if (!runtime) return;
                const updates = Array.from(chapterUpdates.entries()).map(([index, realHeight]) => ({ index, realHeight }));
                const totalDelta = batchUpdateSegmentHeights(runtime.vector, updates);
                if (Math.abs(totalDelta) > SCROLL_HEDGE_EPSILON_PX) {
                    needsCompensation = true;
                }
                refreshVirtualChapterLayout(runtime);
                heightUpdates.set(runtime.spineIndex, runtime.vector.totalEstimatedHeight);
            });

            if (heightUpdates.size > 0) {
                setChapters((prev) => prev.map((chapter) => {
                    const nextHeight = heightUpdates.get(chapter.spineIndex);
                    if (nextHeight === undefined) return chapter;
                    if (Math.abs(chapter.height - nextHeight) <= SCROLL_HEDGE_EPSILON_PX) return chapter;
                    return { ...chapter, height: nextHeight };
                }));
            }

            if (needsCompensation && anchorBefore.element.isConnected) {
                const anchorAfter = captureAnchorInfo(anchorBefore.element);
                const deltaY = calculateAnchorDelta(anchorBefore, anchorAfter);
                if (Math.abs(deltaY) > SCROLL_HEDGE_EPSILON_PX) {
                    pendingDeltaRef.current += deltaY;
                    requestFlush();
                }
            }

            syncVirtualizedSegmentsRef.current(viewport.scrollTop, viewport.clientHeight);
        });
    }, [refreshVirtualChapterLayout, requestFlush]);

    const mountVirtualSegment = useCallback((runtime: VirtualChapterRuntime, segIndex: number): void => {
        const meta = runtime.vector.segments[segIndex];
        if (!meta) return;

        const existing = runtime.activeSegmentEls.get(segIndex);
        if (existing) {
            updateVirtualSegmentLayout(existing, meta);
            return;
        }

        const segmentEl = segmentPool.acquire();
        segmentEl.setAttribute('data-shadow-segment-index', String(segIndex));
        segmentEl.setAttribute('data-shadow-segment-state', 'hydrated');
        segmentEl.setAttribute('data-vitra-virtual-segment', 'true');
        segmentEl.setAttribute('data-vitra-chapter-id', runtime.chapterId);
        segmentEl.style.position = 'absolute';
        segmentEl.style.top = '0';
        segmentEl.style.left = '0';
        segmentEl.style.right = '0';
        segmentEl.style.width = '100%';
        segmentEl.style.contain = 'layout style paint';
        segmentEl.style.minHeight = '0px';
        segmentEl.innerHTML = meta.htmlContent;
        updateVirtualSegmentLayout(segmentEl, meta);

        insertVirtualSegmentInOrder(runtime.contentEl, runtime.activeSegmentEls, segIndex, segmentEl);
        runtime.activeSegmentEls.set(segIndex, segmentEl);
        observeResizeNode(segmentEl);
        applyVirtualHighlightsRef.current(runtime.spineIndex, segmentEl);

        if (!meta.measured || meta.hasMedia) {
            enqueueVirtualMeasurement(runtime.chapterId, segIndex, segmentEl);
        }
    }, [enqueueVirtualMeasurement, observeResizeNode]);

    const releaseVirtualSegment = useCallback((runtime: VirtualChapterRuntime, segIndex: number): void => {
        const segmentEl = runtime.activeSegmentEls.get(segIndex);
        if (!segmentEl) return;
        runtime.activeSegmentEls.delete(segIndex);
        unobserveResizeNode(segmentEl);
        if (segmentEl.isConnected) {
            segmentEl.remove();
        }
        segmentPool.release(segmentEl);
    }, [unobserveResizeNode]);

    const registerVirtualChapterRuntime = useCallback((chapterId: string, spineIndex: number, chapterEl: HTMLElement) => {
        const vector = chapterVectorsRef.current.get(chapterId);
        const contentEl = getVectorContentContainer(chapterEl);
        if (!vector || !contentEl) {
            cleanupVirtualChapterRuntime(chapterId);
            return;
        }

        cleanupVirtualChapterRuntime(chapterId);
        updateVirtualContentHeight(contentEl, vector);
        virtualChaptersRef.current.set(chapterId, {
            chapterId,
            spineIndex,
            chapterEl,
            contentEl,
            vector,
            activeSegmentEls: new Map<number, HTMLElement>(),
        });
    }, [cleanupVirtualChapterRuntime]);

    const getCachedSegmentSearchText = useCallback((chapterId: string, segment: SegmentMeta): string => {
        const cacheKey = `${chapterId}:${segment.index}`;
        const cached = segmentSearchTextCacheRef.current.get(cacheKey);
        if (cached !== undefined) {
            return cached;
        }

        const probe = document.createElement('div');
        probe.innerHTML = segment.htmlContent;
        const normalized = normalizeSearchText(probe.textContent || '');
        segmentSearchTextCacheRef.current.set(cacheKey, normalized);
        return normalized;
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

    const cleanupMountedChapterDom = useCallback((chapterId: string, chapterEl: HTMLElement) => {
        cleanupVirtualChapterRuntime(chapterId);
        unobserveChapterResizeNodes(chapterEl);
        releaseChapterSegmentNodes(chapterEl);
        releaseMediaResources(chapterEl);
    }, [cleanupVirtualChapterRuntime, unobserveChapterResizeNodes]);

    const collapseChapterDomToPlaceholder = useCallback((chapterId: string, chapterEl: HTMLElement, height: number) => {
        cleanupMountedChapterDom(chapterId, chapterEl);
        markChapterAsPlaceholder(chapterEl, height);
    }, [cleanupMountedChapterDom]);

    const resetResizeObservers = useCallback(() => {
        observedResizeNodesRef.current.forEach((node) => {
            resizeObserverRef.current?.unobserve(node);
        });
        observedResizeNodesRef.current.clear();
        observedResizeHeightsRef.current = new WeakMap<HTMLElement, number>();
    }, []);

    useEffect(() => {
        const observer = new ResizeObserver((entries) => {
            entries.forEach((entry) => {
                const target = entry.target as HTMLElement;
                const nextHeight = Math.max(1, entry.contentRect.height);
                observedResizeHeightsRef.current.set(target, nextHeight);

                if (target.getAttribute('data-vitra-virtual-segment') !== 'true') {
                    return;
                }

                const chapterId = target.getAttribute('data-vitra-chapter-id');
                const segIndexRaw = target.getAttribute('data-shadow-segment-index');
                const segIndex = segIndexRaw ? Number.parseInt(segIndexRaw, 10) : -1;
                if (!chapterId || segIndex < 0) return;
                enqueueVirtualMeasurement(chapterId, segIndex, target);
            });
        });

        resizeObserverRef.current = observer;
        return () => {
            resetResizeObservers();
            observer.disconnect();
            if (resizeObserverRef.current === observer) {
                resizeObserverRef.current = null;
            }
        };
    }, [enqueueVirtualMeasurement, resetResizeObservers]);

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
        lastKnownAnchorIndexRef.current = safeIndex;
        loadChapter(safeIndex, 'initial');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [spineItems]);

    // ── Chapter Loading ──

    const commitWindowedVectorChapter = useCallback((chapter: LoadedChapter, previousHeight: number) => {
        const segmentMetas = chapter.segmentMetas;
        if (!shouldUseWindowedVectorChapter(segmentMetas) || !segmentMetas) {
            return false;
        }

        const vector = buildChapterMetaVector(chapter.id, chapter.spineIndex, segmentMetas);
        chapterVectorsRef.current.set(chapter.id, vector);
        const height = Math.max(1, vector.totalEstimatedHeight);
        const node = createWindowedVectorChapterShell({
            chapterId: chapter.id,
            externalStyles: chapter.externalStyles,
            readerStyles,
            totalHeight: height,
        });

        setChapters(prev => prev.map((item) =>
            item.spineIndex === chapter.spineIndex
                ? { ...chapter, domNode: node, height, status: 'ready' as const }
                : item
        ));
        pipelineRef.current = 'idle';

        if (chapter.spineIndex < lastKnownAnchorIndexRef.current) {
            pendingDeltaRef.current += height - previousHeight;
            requestFlush();
        }

        return true;
    }, [readerStyles, requestFlush]);

    const loadChapter = useCallback(async (
        spineIndex: number,
        direction: 'prev' | 'next' | 'initial',
    ) => {
        if (loadingLockRef.current.has(spineIndex)) return;
        const currentSpineItems = spineItemsRef.current;
        if (spineIndex < 0 || spineIndex >= currentSpineItems.length) return;

        const existingChapter = chaptersRef.current.find(ch => ch.spineIndex === spineIndex);
        if (existingChapter && existingChapter.status !== 'placeholder') return;
        const previousHeight = existingChapter?.height || 0;

        loadingLockRef.current.add(spineIndex);
        pipelineRef.current = 'pre-fetching';

        const chapterId = `ch-${spineIndex}`;
        const currentReaderStyleKey = JSON.stringify(readerStyles);
        const canRestoreFromVectorCache = canRestoreWindowedVectorPlaceholder(
            existingChapter,
            currentReaderStyleKey,
        );

        const loadingChapter: LoadedChapter = {
            spineIndex,
            id: chapterId,
            htmlContent: '',
            htmlFragments: [],
            externalStyles: existingChapter?.externalStyles || [],
            segmentMetas: existingChapter?.segmentMetas,
            vectorStyleKey: existingChapter?.vectorStyleKey ?? currentReaderStyleKey,
            domNode: null,
            height: previousHeight,
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
            if (canRestoreFromVectorCache) {
                const restored: LoadedChapter = {
                    ...loadingChapter,
                    status: 'shadow-rendering',
                    vectorStyleKey: currentReaderStyleKey,
                };

                console.log(`[ScrollReader] Restore vector cache: spine ${spineIndex}`);
                if (!commitWindowedVectorChapter(restored, previousHeight)) {
                    setChapters(prev =>
                        prev.map(ch => ch.spineIndex === spineIndex ? restored : ch)
                    );
                    setShadowQueue(prev => [...prev, restored]);
                    pipelineRef.current = 'rendering-offscreen';
                }
                return;
            }

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
                vectorStyleKey: currentReaderStyleKey,
                status: 'shadow-rendering',
            };

            if (!commitWindowedVectorChapter(loaded, previousHeight)) {
                setChapters(prev =>
                    prev.map(ch => ch.spineIndex === spineIndex ? loaded : ch)
                );
                setShadowQueue(prev => [...prev, loaded]);
                pipelineRef.current = 'rendering-offscreen';
            }
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
    }, [commitWindowedVectorChapter, provider, readerStyles]);

    const readerStylesKeyRef = useRef('');
    useEffect(() => {
        const nextKey = JSON.stringify(readerStyles);
        if (readerStylesKeyRef.current === '' || readerStylesKeyRef.current === nextKey) {
            readerStylesKeyRef.current = nextKey;
            return;
        }
        readerStylesKeyRef.current = nextKey;

        const rerenderTargets = chaptersRef.current.filter((chapter) =>
            chapter.status === 'mounted' || chapter.status === 'ready'
        );
        if (rerenderTargets.length === 0) return;

        const {
            vectorReloadTargets,
            shadowRerenderTargets,
        } = partitionStyleChangeTargets(rerenderTargets);
        if (vectorReloadTargets.length === 0 && shadowRerenderTargets.length === 0) return;

        const rerenderIndexes = new Set(rerenderTargets.map((chapter) => chapter.spineIndex));
        const vectorReloadIndexes = new Set(vectorReloadTargets.map((chapter) => chapter.spineIndex));
        const shadowRerenderIndexes = new Set(shadowRerenderTargets.map((chapter) => chapter.spineIndex));
        const rerenderQueue = shadowRerenderTargets.map((chapter) => ({
            ...chapter,
            domNode: null,
            vectorStyleKey: nextKey,
            status: 'shadow-rendering' as const,
        }));

        vectorReloadTargets.forEach((chapter) => {
            chapterVectorsRef.current.delete(chapter.id);
        });

        const listEl = chapterListRef.current;
        if (listEl) {
            vectorReloadTargets.forEach((chapter) => {
                const chapterEl = listEl.querySelector(`[data-chapter-id="${chapter.id}"]`) as HTMLElement | null;
                if (!chapterEl) return;
                collapseChapterDomToPlaceholder(chapter.id, chapterEl, chapter.height);
            });
        }

        renderedHighlightsRef.current.clear();
        pendingReadyRef.current = pendingReadyRef.current.filter((item) => !rerenderIndexes.has(item.spineIndex));
        setShadowQueue((prev) => [
            ...prev.filter((chapter) => !rerenderIndexes.has(chapter.spineIndex)),
            ...rerenderQueue,
        ]);
        setChapters((prev) => prev.map((chapter) =>
            vectorReloadIndexes.has(chapter.spineIndex)
                ? {
                    ...chapter,
                    htmlContent: '',
                    htmlFragments: [],
                    segmentMetas: undefined,
                    domNode: null,
                    height: resolveChapterPlaceholderHeight(chapter.height),
                    vectorStyleKey: nextKey,
                    status: 'placeholder' as const,
                }
                : shadowRerenderIndexes.has(chapter.spineIndex)
                ? { ...chapter, domNode: null, vectorStyleKey: nextKey, status: 'shadow-rendering' as const }
                : chapter
        ));

        if (styleReloadRafRef.current !== null) {
            cancelAnimationFrame(styleReloadRafRef.current);
            styleReloadRafRef.current = null;
        }
        if (vectorReloadTargets.length > 0) {
            styleReloadRafRef.current = requestAnimationFrame(() => {
                styleReloadRafRef.current = null;
                vectorReloadTargets.forEach((chapter) => {
                    const direction = chapter.spineIndex < lastKnownAnchorIndexRef.current
                        ? 'prev'
                        : (chapter.spineIndex > lastKnownAnchorIndexRef.current ? 'next' : 'initial');
                    void loadChapter(chapter.spineIndex, direction);
                });
            });
        }
    }, [collapseChapterDomToPlaceholder, loadChapter, readerStyles, renderedHighlightsRef]);

    const runPredictivePrefetch = useCallback(() => {
        if (isUserScrollingRef.current) return;

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isInitialized, currentSpineIndex, runPredictivePrefetch, scheduleIdlePrefetch, cancelIdlePrefetch]);

    // ── Shadow Render Complete Handler ──

    const handleShadowReady = useCallback((
        spineIndex: number,
        node: HTMLElement,
        height: number,
    ) => {
        console.log(`[ScrollReader] Shadow ready: spine ${spineIndex}, height ${height}px`);

        const chapterId = `ch-${spineIndex}`;
        const ch = chaptersRef.current.find(c => c.spineIndex === spineIndex);
        const previousHeight = ch?.height ?? 0;
        const delta = height - previousHeight;

        if (ch?.segmentMetas && ch.segmentMetas.length > 0) {
            const vector = buildChapterMetaVector(chapterId, spineIndex, ch.segmentMetas);
            chapterVectorsRef.current.set(chapterId, vector);
        }

        pendingReadyRef.current.push({ spineIndex, node, height });

        if (pendingReadyRafRef.current === null) {
            pendingReadyRafRef.current = requestAnimationFrame(() => {
                pendingReadyRafRef.current = null;
                const batch = pendingReadyRef.current.splice(0);
                if (batch.length === 0) return;

                console.log(`[ScrollReader] Flush batch: ${batch.map(b => `spine ${b.spineIndex}`).join(', ')}`);

                const batchIndices = new Set(batch.map(b => b.spineIndex));
                setShadowQueue(prev => prev.filter(c => !batchIndices.has(c.spineIndex)));

                setChapters(prev => {
                    let updated = prev;
                    for (const item of batch) {
                        const index = updated.findIndex(c => c.spineIndex === item.spineIndex);
                        if (index < 0) continue;
                        if (updated[index].status === 'mounted') continue;
                        if (updated === prev) updated = [...prev];
                        updated[index] = {
                            ...updated[index],
                            domNode: item.node,
                            height: item.height,
                            status: 'ready',
                        };
                    }
                    return updated;
                });
            });
        }

        if (spineIndex < lastKnownAnchorIndexRef.current) {
            pendingDeltaRef.current += delta;
            requestFlush();
        }
    }, [requestFlush]);

    // 组件卸载时取消悬空的 ready-batch rAF，避免在已卸载的组件上调用 setState
    useEffect(() => {
        return () => {
            if (pendingReadyRafRef.current !== null) {
                cancelAnimationFrame(pendingReadyRafRef.current);
                pendingReadyRafRef.current = null;
            }
            if (styleReloadRafRef.current !== null) {
                cancelAnimationFrame(styleReloadRafRef.current);
                styleReloadRafRef.current = null;
            }
            if (virtualMeasureRafRef.current !== null) {
                cancelAnimationFrame(virtualMeasureRafRef.current);
                virtualMeasureRafRef.current = null;
            }
            if (virtualSyncRafRef.current !== null) {
                cancelAnimationFrame(virtualSyncRafRef.current);
                virtualSyncRafRef.current = null;
            }
            if (flushRafRef.current !== null) {
                cancelAnimationFrame(flushRafRef.current);
                flushRafRef.current = null;
            }
            if (unlockAdjustingRafRef.current !== null) {
                cancelAnimationFrame(unlockAdjustingRafRef.current);
                unlockAdjustingRafRef.current = null;
            }
            virtualMeasureQueueRef.current.clear();
            virtualChaptersRef.current.forEach((_runtime, chapterId) => {
                cleanupVirtualChapterRuntime(chapterId);
            });
            pendingReadyRef.current = [];
            pendingDeltaRef.current = 0;
            ignoreScrollEventRef.current = false;
        };
    }, [cleanupVirtualChapterRuntime]);

    // ── Atomic DOM Commit ──

    useLayoutEffect(() => {
        const viewport = viewportRef.current;
        const listEl = chapterListRef.current;
        if (!viewport || !listEl) return;

        const readyChapters = chapters.filter(ch => ch.status === 'ready');
        if (readyChapters.length === 0) return;

        readyChapters.forEach(ch => {
            const existingChapterEl = listEl.querySelector(`[data-chapter-id="${ch.id}"]`) as HTMLElement | null;
            const isInsertion = !existingChapterEl;

            const chapterEl = existingChapterEl || document.createElement('div');
            if (!existingChapterEl) {
                chapterEl.setAttribute('data-chapter-id', ch.id);
                chapterEl.className = styles.chapterBlock;
            }
            cleanupVirtualChapterRuntime(ch.id);
            unobserveChapterResizeNodes(chapterEl);
            markChapterAsMounted(chapterEl, ch.height);
            chapterEl.replaceChildren();

            if (ch.domNode) {
                chapterEl.appendChild(ch.domNode);
            }

            if (isInsertion) {
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
            registerVirtualChapterRuntime(ch.id, ch.spineIndex, chapterEl);
            observeChapterResizeNodes(chapterEl);
        });

        pipelineRef.current = 'idle';

        setChapters(prev =>
            prev.map(ch =>
                ch.status === 'ready' ? { ...ch, status: 'mounted', mountedAt: Date.now() } : ch
            )
        );

        if (!initialScrollDone.current && initialScrollOffset > 0) {
            viewport.scrollTop = initialScrollOffset;
            lastScrollTopRef.current = viewport.scrollTop;
            initialScrollDone.current = true;
        }

        const searchText = pendingSearchTextRef.current;
        if (searchText) {
            pendingSearchTextRef.current = null;
            const mountedChapters = chapters.filter(ch => ch.status === 'ready' || ch.status === 'mounted');
            for (const ch of mountedChapters) {
                const el = listEl.querySelector(`[data-chapter-id="${ch.id}"]`) as HTMLElement | null;
                if (el) {
                    if (revealSearchInChapterRef.current(el, ch.id, searchText)) {
                        break;
                    }
                }
            }
        }

        if (!isInitialized && chapters.some(ch => ch.status === 'ready' || ch.status === 'mounted')) {
            setIsInitialized(true);
        }
    }, [
        chapters,
        cleanupVirtualChapterRuntime,
        initialScrollOffset,
        isInitialized,
        observeChapterResizeNodes,
        registerVirtualChapterRuntime,
        unobserveChapterResizeNodes,
    ]);

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


            // Check if we need to preload
            const needsPreload = shouldPreloadChapter(
                scrollTop, viewportHeight, contentHeight, direction,
                { threshold: PRELOAD_THRESHOLD_PX }
            );

            if (needsPreload && pipelineRef.current === 'idle') {
                const sortedChapters = [...chaptersRef.current].sort((a, b) => a.spineIndex - b.spineIndex);
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
        const checkUnload = () => {
            const currentChapters = chaptersRef.current;
            const mountedChapters = currentChapters.filter(ch => ch.status === 'mounted');
            const now = Date.now();
            const toUnload = mountedChapters
                .filter(ch => {
                    // 惯性滚动中禁止任何卸载，防止高度真空导致坐标系崩溃
                    if (isUserScrollingRef.current) return false;
                    const dist = ch.spineIndex - currentSpineIndex;
                    // 上方章节：使用极大 radius（相当于永不卸载）
                    // 下方章节：正常 radius
                    const radius = dist < 0 ? UNLOAD_ABOVE_RADIUS : UNLOAD_BELOW_RADIUS;
                    return Math.abs(dist) > radius
                        && (!ch.mountedAt || now - ch.mountedAt > UNLOAD_COOLDOWN_MS);
                })
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
                        collapseChapterDomToPlaceholder(ch.id, domEl, ch.height);
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
                    externalStyles: ch.externalStyles,
                    domNode: null,
                    height: resolveChapterPlaceholderHeight(ch.height),
                    status: 'placeholder',
                };
            }));

            console.log(`[ScrollReader] Collapsed to placeholders: ${toUnload.map(ch => ch.spineIndex).join(', ')}`);
        };

        // 延迟检查，避免在章节状态快速变化时频繁执行
        const timer = setTimeout(checkUnload, UNLOAD_COOLDOWN_MS);
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [collapseChapterDomToPlaceholder, currentSpineIndex, provider]);

    // ── Current Chapter Detection ──

    const updateCurrentChapter = useCallback((scrollTop: number, viewportHeight: number) => {
        const listEl = chapterListRef.current;
        if (!listEl) return;

        const chapterProbeLine = scrollTop + Math.min(
            viewportHeight * CHAPTER_DETECTION_ANCHOR_RATIO,
            CHAPTER_DETECTION_ANCHOR_MAX_PX,
        );
        const matched = findChapterAtViewportOffset(
            collectChapterViewportEntries(listEl),
            chapterProbeLine,
        );
        if (!matched) return;

        lastKnownAnchorIndexRef.current = matched.spineIndex;
        if (matched.spineIndex !== currentSpineIndex) {
            setCurrentSpineIndex(matched.spineIndex);
            if (onChapterChange && spineItems[matched.spineIndex]) {
                onChapterChange(spineItems[matched.spineIndex].id, spineItems[matched.spineIndex].href);
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
        const resolved = resolveViewportChapterProgress(
            collectChapterViewportEntries(listEl),
            viewportMid,
            spineItems.length,
        );
        if (!resolved) return;

        onProgressChange?.(resolved.progress);

        // Persist progress
        db.progress.put({
            bookId,
            location: `vitra:${resolved.spineIndex}:${scrollTop}`,
            percentage: resolved.progress,
            currentChapter: spineItems[resolved.spineIndex]?.href || '',
            updatedAt: Date.now(),
        }).catch(err => console.warn('[ScrollReader] Progress save failed:', err));
    }, [spineItems, bookId, onProgressChange]);

    const commitViewportScroll = useCallback((
        viewport: HTMLDivElement,
        nextScrollTop: number,
        syncDerivedState: boolean = false,
    ) => {
        viewport.scrollTop = nextScrollTop;
        lastScrollTopRef.current = viewport.scrollTop;
        if (!syncDerivedState) return;
        updateCurrentChapter(viewport.scrollTop, viewport.clientHeight);
        updateProgress(viewport.scrollTop, viewport.clientHeight);
    }, [updateCurrentChapter, updateProgress]);

    const findVirtualSearchTargetIndex = useCallback((chapterId: string, searchText: string): number => {
        const vector = chapterVectorsRef.current.get(chapterId);
        if (!vector || vector.segments.length === 0) return -1;

        const normalizedSearch = normalizeSearchText(searchText);
        if (!normalizedSearch) return -1;

        for (const segment of vector.segments) {
            const normalizedText = getCachedSegmentSearchText(chapterId, segment);
            if (normalizedText.includes(normalizedSearch)) {
                return segment.index;
            }
        }

        return -1;
    }, [getCachedSegmentSearchText]);

    const revealSearchInChapter = useCallback((chapterEl: HTMLElement, chapterId: string, searchText: string): boolean => {
        const runtime = virtualChaptersRef.current.get(chapterId);
        const viewport = viewportRef.current;
        if (!viewport) return false;

        if (!runtime) {
            const range = findTextInDOM(chapterEl, searchText);
            if (!range) return false;
            const rect = range.getBoundingClientRect();
            const vpRect = viewport.getBoundingClientRect();
            commitViewportScroll(viewport, viewport.scrollTop + rect.top - vpRect.top);
            return true;
        }

        const targetIndex = findVirtualSearchTargetIndex(chapterId, searchText);
        if (targetIndex < 0) return false;

        const startIndex = Math.max(0, targetIndex - SEARCH_SEGMENT_WINDOW_RADIUS);
        const endIndex = Math.min(runtime.vector.segments.length - 1, targetIndex + SEARCH_SEGMENT_WINDOW_RADIUS);
        for (let index = startIndex; index <= endIndex; index += 1) {
            mountVirtualSegment(runtime, index);
        }
        refreshVirtualChapterLayout(runtime);

        const targetSegment = runtime.vector.segments[targetIndex];
        if (!targetSegment) return false;
        commitViewportScroll(viewport, runtime.chapterEl.offsetTop + targetSegment.offsetY);
        syncVirtualizedSegmentsRef.current(viewport.scrollTop, viewport.clientHeight);

        requestAnimationFrame(() => {
            const orderedSegments = Array.from(runtime.activeSegmentEls.entries())
                .filter(([index]) => index >= startIndex && index <= endIndex)
                .sort((a, b) => a[0] - b[0])
                .map(([, el]) => el);
            const ranges = findTextAcrossSegments(orderedSegments, searchText);
            const primaryRange = ranges?.[0] ?? null;
            if (!primaryRange) return;
            const rect = primaryRange.getBoundingClientRect();
            const vpRect = viewport.getBoundingClientRect();
            commitViewportScroll(viewport, viewport.scrollTop + rect.top - vpRect.top);
        });

        return true;
    }, [commitViewportScroll, findVirtualSearchTargetIndex, mountVirtualSegment, refreshVirtualChapterLayout]);

    revealSearchInChapterRef.current = revealSearchInChapter;



    // ── TOC Jump ──

    const jumpToSpine = useCallback(async (targetSpineIndex: number, searchText?: string) => {
        if (targetSpineIndex < 0 || targetSpineIndex >= spineItemsRef.current.length) return;

        // 递增跳转代数，使上一次未完成的跳转自动失效
        const generation = ++jumpGenerationRef.current;

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
        lastKnownAnchorIndexRef.current = targetSpineIndex;
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
                    commitViewportScroll(viewport, domEl.offsetTop, true);

                    requestAnimationFrame(() => {
                        if (jumpGenerationRef.current !== generation) return;
                        commitViewportScroll(viewport, domEl.offsetTop, true);
                    });

                    // If searchText, find and scroll to it
                    if (searchText) {
                        pendingSearchTextRef.current = null;
                        if (revealSearchInChapter(domEl, `ch-${targetSpineIndex}`, searchText)) {
                            updateCurrentChapter(viewport.scrollTop, viewport.clientHeight);
                            updateProgress(viewport.scrollTop, viewport.clientHeight);
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
            // 仅移除手动插入的章节 DOM 节点，不动 React 管理的子节点（如 loading indicator）
            // innerHTML = '' 会导致 React commitDeletionEffects 时 removeChild 失败
            const chapterNodes = listEl.querySelectorAll('[data-chapter-id]');
            chapterNodes.forEach(node => {
                const el = node as HTMLElement;
                const chapterId = el.getAttribute('data-chapter-id');
                if (chapterId) {
                    cleanupMountedChapterDom(chapterId, el);
                }
                el.remove();
            });
        }

        chaptersRef.current = [];
        setChapters([]);
        setShadowQueue([]);
        loadingLockRef.current.clear();
        pipelineRef.current = 'idle';
        setCurrentSpineIndex(targetSpineIndex);
        lastKnownAnchorIndexRef.current = targetSpineIndex;

        // 跳转代数检查：如果在清理过程中又触发了新的跳转，放弃本次加载
        if (jumpGenerationRef.current !== generation) return;

        // loadChapter uses chaptersRef (always current), so no stale closure issue
        loadChapter(targetSpineIndex, 'initial');
    }, [
        cancelIdlePrefetch,
        cleanupMountedChapterDom,
        commitViewportScroll,
        loadChapter,
        onChapterChange,
        revealSearchInChapter,
        resetResizeObservers,
        stop,
        updateCurrentChapter,
        updateProgress,
    ]);

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

            const spineIdx = findAncestorChapterSpineIndex(range.startContainer, viewport);

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

    const applyHighlightRecordsToRoot = useCallback((
        rootEl: HTMLElement,
        highlights: readonly Highlight[],
        useRenderedGuard: boolean,
    ) => {
        for (const highlight of highlights) {
            if (useRenderedGuard && renderedHighlightsRef.current.has(highlight.id)) {
                continue;
            }
            const range = findTextInDOM(rootEl, highlight.text);
            if (!range) continue;
            highlightRange(range, highlight.id, highlight.color);
            if (useRenderedGuard) {
                renderedHighlightsRef.current.add(highlight.id);
            }
        }
    }, [renderedHighlightsRef]);

    const applyHighlightsToVirtualSegment = useCallback((spineIndex: number, segmentEl: HTMLElement) => {
        const highlights = chapterHighlightCacheRef.current.get(spineIndex);
        if (!highlights || highlights.length === 0) return;
        applyHighlightRecordsToRoot(segmentEl, highlights, false);
    }, [applyHighlightRecordsToRoot]);

    applyVirtualHighlightsRef.current = applyHighlightsToVirtualSegment;

    const applyHighlightsToChapter = useCallback((
        chapterEl: HTMLElement,
        spineIndex: number,
    ) => {
        const runtime = virtualChaptersRef.current.get(`ch-${spineIndex}`);
        const highlightRoots = runtime
            ? Array.from(runtime.activeSegmentEls.values())
            : [chapterEl];
        db.highlights.where('bookId').equals(bookId).toArray().then(highlights => {
            const matching = highlights.filter(h => {
                if (h.cfiRange.startsWith('vitra:') || h.cfiRange.startsWith('bdise:')) {
                    return parseInt(h.cfiRange.split(':')[1], 10) === spineIndex;
                }
                if (h.cfiRange.startsWith('epubcfi(')) {
                    const m = h.cfiRange.match(/^epubcfi\(\/\d+\/(\d+)/);
                    return m ? Math.max(0, Math.floor(parseInt(m[1], 10) / 2) - 1) === spineIndex : false;
                }
                return false;
            });
            chapterHighlightCacheRef.current.set(spineIndex, matching);
            const useRenderedGuard = !runtime;
            for (const rootEl of highlightRoots) {
                applyHighlightRecordsToRoot(rootEl, matching, useRenderedGuard);
            }
        }).catch(err => console.warn('[ScrollReader] Highlight load failed:', err));
    }, [applyHighlightRecordsToRoot, bookId]);

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

    const syncVirtualizedSegmentsByRange = useCallback((scrollTop: number, viewportHeight: number) => {
        if (viewportHeight <= 0) return;

        const runtimes = Array.from(virtualChaptersRef.current.values());
        runtimes.forEach((runtime) => {
            refreshVirtualChapterLayout(runtime);
        });

        const mountPlan = computeGlobalVirtualSegmentMountPlan(
            runtimes.map((runtime) => ({
                chapterId: runtime.chapterId,
                chapterTop: runtime.chapterEl.offsetTop,
                vector: runtime.vector,
            })),
            scrollTop,
            viewportHeight,
            {
                overscanSegments: RANGE_HYDRATION_OVERSCAN_SEGMENTS,
                preloadMarginPx: RANGE_HYDRATION_PRELOAD_MARGIN_PX,
                globalSegmentBudget: GLOBAL_VIRTUAL_SEGMENT_BUDGET,
            },
        );

        runtimes.forEach((runtime) => {
            const nextIndices = new Set(mountPlan.get(runtime.chapterId) ?? []);

            Array.from(runtime.activeSegmentEls.keys()).forEach((index) => {
                if (!nextIndices.has(index)) {
                    releaseVirtualSegment(runtime, index);
                }
            });

            Array.from(nextIndices)
                .sort((left, right) => left - right)
                .forEach((index) => {
                    mountVirtualSegment(runtime, index);
                });
        });
    }, [mountVirtualSegment, refreshVirtualChapterLayout, releaseVirtualSegment]);

    syncVirtualizedSegmentsRef.current = syncVirtualizedSegmentsByRange;

    const scheduleVirtualSync = useCallback(() => {
        const viewport = viewportRef.current;
        if (!viewport) return;
        if (ignoreScrollEventRef.current) return;
        if (virtualSyncRafRef.current !== null) return;

        virtualSyncRafRef.current = requestAnimationFrame(() => {
            virtualSyncRafRef.current = null;
            syncVirtualizedSegmentsByRange(viewport.scrollTop, viewport.clientHeight);
        });
    }, [syncVirtualizedSegmentsByRange]);

    useLayoutEffect(() => {
        scheduleVirtualSync();
    }, [chapters, scheduleVirtualSync]);

    useEffect(() => {
        const viewport = viewportRef.current;
        if (!viewport) return;

        const handleVirtualSync = () => {
            scheduleVirtualSync();
        };

        viewport.addEventListener('scroll', handleVirtualSync, { passive: true });
        return () => {
            viewport.removeEventListener('scroll', handleVirtualSync);
            if (virtualSyncRafRef.current !== null) {
                cancelAnimationFrame(virtualSyncRafRef.current);
                virtualSyncRafRef.current = null;
            }
        };
    }, [scheduleVirtualSync]);

    // ── Render ──

    return (
        <div
            className={styles.vitraViewport}
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
                        chapterId={ch.id}
                        externalStyles={ch.externalStyles}
                        preprocessed
                        readerStyles={readerStyles}
                        resourceExists={shadowResourceExists}
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

            {renderSelectionUI()}
        </div>
    );
});

ScrollReaderView.displayName = 'ScrollReaderView';
