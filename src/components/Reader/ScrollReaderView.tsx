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
import { db } from '../../services/storageService';
import { findTextInDOM, highlightRange } from '../../utils/textFinder';
import { preprocessChapterContent } from '../../engine/render/chapterPreprocessService';
import {
    buildChapterMetaVector,
    type ChapterMetaVector,
    type SegmentMeta,
} from '../../engine';
import { cancelIdleTask, scheduleIdleTask, type IdleTaskHandle } from '../../utils/idleScheduler';
import { clampNumber } from '../../utils/mathUtils';
import { useSelectionMenu } from '../../hooks/useSelectionMenu';
import { releaseMediaResources } from '../../utils/mediaResourceCleanup';
import {
    canRestoreWindowedVectorPlaceholder,
    computeGlobalVirtualSegmentMountPlan,
    partitionStyleChangeTargets,
    shouldBypassShadowQueueForSegmentMetas,
} from './scrollVectorStrategy';
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
// 上方章节保留 30 章缓冲，避免回滚时频繁重挂载导致 CPU 抖动
const UNLOAD_ABOVE_RADIUS = 30;
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
const GLOBAL_VIRTUAL_SEGMENT_BUDGET = 24;
const VIRTUAL_SEGMENT_MIN_HEIGHT_PX = 96;

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

function getVectorContentContainer(node: ParentNode | null): HTMLElement | null {
    if (!node) return null;
    return node.querySelector('[data-vitra-vector-content="true"]') as HTMLElement | null;
}

function resolveVirtualSegmentHeight(segment: SegmentMeta): number {
    return Math.max(VIRTUAL_SEGMENT_MIN_HEIGHT_PX, segment.realHeight ?? segment.estimatedHeight);
}

function updateVirtualContentHeight(contentEl: HTMLElement, vector: ChapterMetaVector): void {
    const totalHeight = Math.max(1, vector.totalEstimatedHeight);
    contentEl.style.position = 'relative';
    contentEl.style.height = `${totalHeight}px`;
    contentEl.style.minHeight = `${totalHeight}px`;
    contentEl.setAttribute('data-vitra-vector-total-height', String(totalHeight));
}

function updateVirtualSegmentLayout(segmentEl: HTMLElement, segment: SegmentMeta): void {
    segmentEl.style.position = 'absolute';
    segmentEl.style.top = '0';
    segmentEl.style.left = '0';
    segmentEl.style.right = '0';
    segmentEl.style.width = '100%';
    segmentEl.style.transform = `translateY(${Math.max(0, segment.offsetY)}px)`;
    segmentEl.style.containIntrinsicSize = `${resolveVirtualSegmentHeight(segment)}px`;
}

function insertVirtualSegmentInOrder(
    container: HTMLElement,
    activeSegmentEls: ReadonlyMap<number, HTMLElement>,
    nextIndex: number,
    segmentEl: HTMLElement,
): void {
    const ordered = Array.from(activeSegmentEls.entries()).sort((a, b) => a[0] - b[0]);
    const nextSibling = ordered.find(([index]) => index > nextIndex)?.[1] ?? null;
    container.insertBefore(segmentEl, nextSibling);
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
    const virtualSyncRafRef = useRef<number | null>(null);

    // ── Selection Menu (shared hook) ──
    const getHighlightContainer = useCallback((spineIndex: number): HTMLElement | null => {
        const listEl = chapterListRef.current;
        if (!listEl) return null;
        return listEl.querySelector(`[data-chapter-id="ch-${spineIndex}"]`) as HTMLElement | null;
    }, []);
    const {
        selectionMenu, setSelectionMenu,
        renderedHighlightsRef,
        renderSelectionUI,
    } = useSelectionMenu({ bookId, onSelectionSearch, getHighlightContainer });
    const highlightIdleHandlesRef = useRef<Map<number, IdleTaskHandle>>(new Map());
    // rAF 批处理：收集同帧内完成的所有 shadow-ready 事件，合并为一次 setChapters
    const pendingReadyRef = useRef<Array<{ spineIndex: number; node: HTMLElement; height: number }>>([]);
    const pendingReadyRafRef = useRef<number | null>(null);
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
            virtualChaptersRef.current.clear();
            if (virtualSyncRafRef.current !== null) {
                cancelAnimationFrame(virtualSyncRafRef.current);
                virtualSyncRafRef.current = null;
            }
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

    const releaseVirtualSegment = useCallback((runtime: VirtualChapterRuntime, segmentIndex: number) => {
        const segmentEl = runtime.activeSegmentEls.get(segmentIndex);
        if (!segmentEl) return;
        runtime.activeSegmentEls.delete(segmentIndex);
        unobserveResizeNode(segmentEl);
        if (segmentEl.isConnected) {
            segmentEl.remove();
        }
        segmentPool.release(segmentEl);
    }, [unobserveResizeNode]);

    const cleanupVirtualChapterRuntime = useCallback((chapterId: string) => {
        const runtime = virtualChaptersRef.current.get(chapterId);
        if (!runtime) return;
        Array.from(runtime.activeSegmentEls.keys()).forEach((segmentIndex) => {
            releaseVirtualSegment(runtime, segmentIndex);
        });
        virtualChaptersRef.current.delete(chapterId);
    }, [releaseVirtualSegment]);

    const refreshVirtualChapterLayout = useCallback((runtime: VirtualChapterRuntime) => {
        updateVirtualContentHeight(runtime.contentEl, runtime.vector);
        runtime.activeSegmentEls.forEach((segmentEl, segmentIndex) => {
            const segment = runtime.vector.segments[segmentIndex];
            if (!segment) return;
            updateVirtualSegmentLayout(segmentEl, segment);
        });
    }, []);

    const mountVirtualSegment = useCallback((runtime: VirtualChapterRuntime, segmentIndex: number) => {
        const segment = runtime.vector.segments[segmentIndex];
        if (!segment) return;

        const existing = runtime.activeSegmentEls.get(segmentIndex);
        if (existing) {
            updateVirtualSegmentLayout(existing, segment);
            return;
        }

        const segmentEl = segmentPool.acquire();
        segmentEl.setAttribute('data-shadow-segment-index', String(segmentIndex));
        segmentEl.setAttribute('data-shadow-segment-state', 'hydrated');
        segmentEl.style.contain = 'layout style paint';
        segmentEl.style.minHeight = '0px';
        segmentEl.innerHTML = segment.htmlContent;
        updateVirtualSegmentLayout(segmentEl, segment);

        insertVirtualSegmentInOrder(runtime.contentEl, runtime.activeSegmentEls, segmentIndex, segmentEl);
        runtime.activeSegmentEls.set(segmentIndex, segmentEl);
        observeResizeNode(segmentEl);
    }, [observeResizeNode]);

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

    useEffect(() => {
        const observer = new ResizeObserver((entries) => {
            entries.forEach((entry) => {
                const target = entry.target as HTMLElement;
                const nextHeight = Math.max(1, entry.contentRect.height);
                observedResizeHeightsRef.current.set(target, nextHeight);
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
    }, [resetResizeObservers]);

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

    const loadChapter = useCallback(async (
        spineIndex: number,
        direction: 'prev' | 'next' | 'initial',
        forceReload = false,
    ) => {
        if (loadingLockRef.current.has(spineIndex)) return;
        const currentSpineItems = spineItemsRef.current;
        if (spineIndex < 0 || spineIndex >= currentSpineItems.length) return;

        const existingChapter = chaptersRef.current.find(ch => ch.spineIndex === spineIndex);
        if (existingChapter && existingChapter.status !== 'placeholder' && !forceReload) return;
        const currentReaderStyleKey = JSON.stringify(readerStyles);

        loadingLockRef.current.add(spineIndex);
        pipelineRef.current = 'pre-fetching';

        const chapterId = `ch-${spineIndex}`;

        const loadingChapter: LoadedChapter = {
            spineIndex,
            id: chapterId,
            htmlContent: '',
            htmlFragments: [],
            externalStyles: existingChapter?.externalStyles || [],
            segmentMetas: existingChapter?.segmentMetas,
            vectorStyleKey: existingChapter?.vectorStyleKey ?? currentReaderStyleKey,
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
            if (!forceReload && canRestoreWindowedVectorPlaceholder(existingChapter, currentReaderStyleKey)) {
                const restoredMetas = existingChapter?.segmentMetas;
                if (restoredMetas && restoredMetas.length > 0) {
                    const { node, height } = createWindowedVectorChapterShell({
                        chapterId,
                        externalStyles: existingChapter.externalStyles,
                        readerStyles,
                        segmentMetas: restoredMetas,
                    });
                    chapterVectorsRef.current.set(chapterId, buildChapterMetaVector(chapterId, spineIndex, restoredMetas));
                    setChapters(prev => prev.map(ch => ch.spineIndex === spineIndex ? {
                        ...loadingChapter,
                        domNode: node,
                        height,
                        status: 'ready',
                    } : ch));
                    pipelineRef.current = 'idle';
                    return;
                }
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

            if (shouldBypassShadowQueueForSegmentMetas(preprocessed.segmentMetas)) {
                const vectorMetas = preprocessed.segmentMetas || [];
                const { node, height } = createWindowedVectorChapterShell({
                    chapterId,
                    externalStyles: preprocessed.externalStyles,
                    readerStyles,
                    segmentMetas: vectorMetas,
                });
                chapterVectorsRef.current.set(chapterId, buildChapterMetaVector(chapterId, spineIndex, vectorMetas));
                setChapters(prev =>
                    prev.map(ch => ch.spineIndex === spineIndex ? {
                        ...loaded,
                        domNode: node,
                        height,
                        status: 'ready',
                    } : ch)
                );
                setShadowQueue(prev => prev.filter(ch => ch.spineIndex !== spineIndex));
                pipelineRef.current = 'idle';
            } else {
                // Update in list and add to shadow queue
                setChapters(prev =>
                    prev.map(ch => ch.spineIndex === spineIndex ? loaded : ch)
                );
                setShadowQueue(prev => [...prev.filter(ch => ch.spineIndex !== spineIndex), loaded]);

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
    }, [provider, readerStyles]);

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

        const partition = partitionStyleChangeTargets(rerenderTargets);
        const shadowTargets = partition.shadowRerenderTargets;
        const vectorTargets = partition.vectorReloadTargets;

        const rerenderIndexes = new Set(shadowTargets.map((chapter) => chapter.spineIndex));
        const rerenderQueue = shadowTargets.map((chapter) => ({
            ...chapter,
            domNode: null,
            vectorStyleKey: nextKey,
            status: 'shadow-rendering' as const,
        }));

        renderedHighlightsRef.current.clear();
        if (rerenderIndexes.size > 0) {
            pendingReadyRef.current = pendingReadyRef.current.filter((item) => !rerenderIndexes.has(item.spineIndex));
            setShadowQueue((prev) => [
                ...prev.filter((chapter) => !rerenderIndexes.has(chapter.spineIndex)),
                ...rerenderQueue,
            ]);
            setChapters((prev) => prev.map((chapter) =>
                rerenderIndexes.has(chapter.spineIndex)
                    ? { ...chapter, domNode: null, vectorStyleKey: nextKey, status: 'shadow-rendering' as const }
                    : chapter
            ));
        }

        vectorTargets.forEach((chapter) => {
            const direction = chapter.spineIndex < currentSpineIndex
                ? 'prev'
                : (chapter.spineIndex > currentSpineIndex ? 'next' : 'initial');
            void loadChapter(chapter.spineIndex, direction, true);
        });
    }, [currentSpineIndex, loadChapter, readerStyles, renderedHighlightsRef]);

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
            if (flushRafRef.current !== null) {
                cancelAnimationFrame(flushRafRef.current);
                flushRafRef.current = null;
            }
            if (unlockAdjustingRafRef.current !== null) {
                cancelAnimationFrame(unlockAdjustingRafRef.current);
                unlockAdjustingRafRef.current = null;
            }
            pendingReadyRef.current = [];
            pendingDeltaRef.current = 0;
            ignoreScrollEventRef.current = false;
        };
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

        // 直接使用段的 htmlContent
        segmentEl.innerHTML = meta.htmlContent;
        segmentEl.setAttribute('data-shadow-segment-state', 'hydrated');
        segmentEl.style.minHeight = '0px';
    }, []);

    const materializeAllVirtualSegments = useCallback((chapterId: string) => {
        const runtime = virtualChaptersRef.current.get(chapterId);
        if (!runtime) return;
        for (let index = 0; index < runtime.vector.segments.length; index += 1) {
            mountVirtualSegment(runtime, index);
        }
        refreshVirtualChapterLayout(runtime);
    }, [mountVirtualSegment, refreshVirtualChapterLayout]);

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
            observeChapterResizeNodes(chapterEl);
            if (ch.segmentMetas && shouldBypassShadowQueueForSegmentMetas(ch.segmentMetas)) {
                registerVirtualChapterRuntime(ch.id, ch.spineIndex, chapterEl);
            } else {
                cleanupVirtualChapterRuntime(ch.id);
            }
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
        if (virtualSyncRafRef.current === null) {
            virtualSyncRafRef.current = requestAnimationFrame(() => {
                virtualSyncRafRef.current = null;
                const viewportEl = viewportRef.current;
                if (!viewportEl) return;
                const scrollTop = viewportEl.scrollTop;
                const viewportHeight = viewportEl.clientHeight;
                const runtimes = Array.from(virtualChaptersRef.current.values());
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
                    Array.from(nextIndices).sort((a, b) => a - b).forEach((segmentIndex) => {
                        mountVirtualSegment(runtime, segmentIndex);
                    });
                    refreshVirtualChapterLayout(runtime);
                });
            });
        }
    }, [chapters, cleanupVirtualChapterRuntime, initialScrollOffset, isInitialized, mountVirtualSegment, observeChapterResizeNodes, refreshVirtualChapterLayout, registerVirtualChapterRuntime, unobserveChapterResizeNodes]);

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
                cleanupVirtualChapterRuntime(ch.id);
                // Remove DOM
                if (listEl) {
                    const domEl = listEl.querySelector(`[data-chapter-id="${ch.id}"]`) as HTMLElement | null;
                    if (domEl) {
                        // 先 unobserve 再 release，避免清空段内容时 ResizeObserver 记录额外高度变动
                        unobserveChapterResizeNodes(domEl);
                        domEl.querySelectorAll('section[data-shadow-segment-index]').forEach(seg => {
                            segmentPool.release(seg as HTMLElement);
                        });
                        releaseMediaResources(domEl);
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
    }, [cleanupVirtualChapterRuntime, currentSpineIndex, provider, unobserveChapterResizeNodes]);

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
                    const spineIdx = Number(match[1]);
                    lastKnownAnchorIndexRef.current = spineIdx;
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
            location: `vitra:${resolvedSpineIndex}:${scrollTop}`,
            percentage: progress,
            currentChapter: spineItems[resolvedSpineIndex]?.href || '',
            updatedAt: Date.now(),
        }).catch(err => console.warn('[ScrollReader] Progress save failed:', err));
    }, [spineItems, bookId, currentSpineIndex, onProgressChange]);



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
                    viewport.scrollTop = domEl.offsetTop;
                    lastScrollTopRef.current = viewport.scrollTop;
                    updateCurrentChapter(viewport.scrollTop, viewport.clientHeight);
                    updateProgress(viewport.scrollTop, viewport.clientHeight);

                    requestAnimationFrame(() => {
                        if (jumpGenerationRef.current !== generation) return;
                        viewport.scrollTop = domEl.offsetTop;
                        lastScrollTopRef.current = viewport.scrollTop;
                        updateCurrentChapter(viewport.scrollTop, viewport.clientHeight);
                        updateProgress(viewport.scrollTop, viewport.clientHeight);
                    });

                    // If searchText, find and scroll to it
                    if (searchText) {
                        pendingSearchTextRef.current = null;
                        materializeAllVirtualSegments(existing.id);
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
            // 仅移除手动插入的章节 DOM 节点，不动 React 管理的子节点（如 loading indicator）
            // innerHTML = '' 会导致 React commitDeletionEffects 时 removeChild 失败
            const chapterNodes = listEl.querySelectorAll('[data-chapter-id]');
            chapterNodes.forEach(node => {
                const el = node as HTMLElement;
                const chapterId = el.getAttribute('data-chapter-id');
                if (chapterId) {
                    cleanupVirtualChapterRuntime(chapterId);
                }
                // 释放段池中的段元素
                el.querySelectorAll('[data-shadow-segment-index]').forEach(seg => {
                    segmentPool.release(seg as HTMLElement);
                });
                releaseMediaResources(el);
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
    }, [cancelIdlePrefetch, cleanupVirtualChapterRuntime, forceHydrateSegment, loadChapter, materializeAllVirtualSegments, onChapterChange, resetResizeObservers, stop, updateCurrentChapter, updateProgress]);

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
        const chapterId = chapterEl.getAttribute('data-chapter-id');
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
            if (matching.length === 0) return;
            if (chapterId) {
                materializeAllVirtualSegments(chapterId);
            }
            // 强制 hydrate 所有 placeholder 段以确保高亮可达
            chapterEl.querySelectorAll('[data-shadow-segment-state="placeholder"]').forEach(seg => {
                forceHydrateSegment(seg as HTMLElement);
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
    }, [bookId, forceHydrateSegment, materializeAllVirtualSegments]);

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

    // ── Active-only 虚拟段同步 ──

    const syncVirtualizedSegmentsByRange = useCallback((scrollTop: number, viewportHeight: number) => {
        if (viewportHeight <= 0) return;

        const runtimes = Array.from(virtualChaptersRef.current.values());
        if (runtimes.length === 0) return;

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

            Array.from(runtime.activeSegmentEls.keys()).forEach((segmentIndex) => {
                if (!nextIndices.has(segmentIndex)) {
                    releaseVirtualSegment(runtime, segmentIndex);
                }
            });

            Array.from(nextIndices).sort((a, b) => a - b).forEach((segmentIndex) => {
                mountVirtualSegment(runtime, segmentIndex);
            });

            refreshVirtualChapterLayout(runtime);
        });
    }, [mountVirtualSegment, refreshVirtualChapterLayout, releaseVirtualSegment]);

    useEffect(() => {
        const viewport = viewportRef.current;
        if (!viewport) return;

        const scheduleVirtualSync = () => {
            if (ignoreScrollEventRef.current) return;
            if (virtualSyncRafRef.current !== null) return;
            virtualSyncRafRef.current = requestAnimationFrame(() => {
                virtualSyncRafRef.current = null;
                syncVirtualizedSegmentsByRange(viewport.scrollTop, viewport.clientHeight);
            });
        };

        scheduleVirtualSync();
        viewport.addEventListener('scroll', scheduleVirtualSync, { passive: true });

        return () => {
            viewport.removeEventListener('scroll', scheduleVirtualSync);
            if (virtualSyncRafRef.current !== null) {
                cancelAnimationFrame(virtualSyncRafRef.current);
                virtualSyncRafRef.current = null;
            }
        };
    }, [chapters, syncVirtualizedSegmentsByRange]);

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
