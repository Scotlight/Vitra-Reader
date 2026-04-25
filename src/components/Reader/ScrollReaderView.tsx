import {
    useEffect, useState, useCallback,
    forwardRef, memo, useImperativeHandle, useMemo
} from 'react';
import type { ContentProvider, SpineItemInfo } from '../../engine/core/contentProvider';
import { ShadowRenderer, ReaderStyleConfig } from './ShadowRenderer';
import { useVirtualChapterRuntime } from './scrollReader/useVirtualChapterRuntime';
import { useScrollReaderRefs } from './scrollReader/useScrollReaderRefs';
import { useChapterUnloader } from './scrollReader/useChapterUnloader';
import { useScrollHandler } from './scrollReader/useScrollHandler';
import { useChapterLoader } from './scrollReader/useChapterLoader';
import { useShadowRenderComplete } from './scrollReader/useShadowRenderComplete';
import { useAtomicDomCommit } from './scrollReader/useAtomicDomCommit';
import { useTocJump } from './scrollReader/useTocJump';
import { useHighlightAndSelection } from './scrollReader/useHighlightAndSelection';
import { useVirtualSegmentSync } from './scrollReader/useVirtualSegmentSync';
import { useChapterResizeObserver } from './scrollReader/useChapterResizeObserver';
import type { LoadedChapter } from './scrollReader/scrollReaderTypes';
import { resolveHighlightSpineIndex } from './scrollReader/scrollReaderHelpers';
import {
    PREFETCH_IDLE_TIMEOUT_MS,
    PHYSICS_FRICTION_NUMERATOR,
    PHYSICS_FRICTION_NO_EASING_OFFSET,
    PHYSICS_FRICTION_MIN,
    PHYSICS_FRICTION_MAX,
    PHYSICS_STOP_THRESHOLD_EASING,
    PHYSICS_STOP_THRESHOLD_LINEAR,
    PHYSICS_SPRING_STIFFNESS,
    PHYSICS_SPRING_DAMPING_EASING,
    PHYSICS_SPRING_DAMPING_LINEAR,
    INERTIA_IMPULSE_BLEND_BASE,
    INERTIA_IMPULSE_BLEND_RATIO_SCALE,
    INERTIA_IMPULSE_BLEND_MIN,
    INERTIA_IMPULSE_BLEND_MAX,
    INERTIA_IMPULSE_GAIN_BASE,
    INERTIA_IMPULSE_GAIN_STEP_REF,
    INERTIA_IMPULSE_GAIN_STEP_DIVISOR,
    INERTIA_IMPULSE_GAIN_MIN,
    INERTIA_IMPULSE_GAIN_MAX,
    INERTIA_VELOCITY_STEP_FACTOR,
    INERTIA_VELOCITY_ACCEL_FACTOR,
    INERTIA_VELOCITY_MIN,
    INERTIA_VELOCITY_MAX,
    INERTIA_FRAME_CAP_EASING_MS,
    INERTIA_FRAME_CAP_LINEAR_MS,
} from './scrollReader/scrollReaderConstants';
import { useScrollInertia } from '../../hooks/useScrollInertia';
import { useScrollEvents } from '../../hooks/useScrollEvents';
import { db, type Highlight } from '../../services/storageService';
import { cancelIdleTask } from '../../utils/idleScheduler';
import { clampNumber } from '../../utils/mathUtils';
import { useSelectionMenu } from '../../hooks/useSelectionMenu';
import styles from './ScrollReaderView.module.css';

// ── Types ──

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



// ── Component ──

const ScrollReaderViewComponent = forwardRef<ScrollReaderHandle, ScrollReaderViewProps>(({
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
    const refs = useScrollReaderRefs({ initialSpineIndex });
    const {
        viewportRef,
        chapterListRef,
        loadingLockRef,
        scrollIdleTimerRef,
        idlePrefetchHandleRef,
        isUserScrollingRef,
        chaptersRef,
        spineItemsRef,
        virtualSyncRafRef,
        highlightDirtyChaptersRef,
        highlightIdleHandlesRef,
        lastReportedProgressRef,
        pendingProgressSnapshotRef,
        lastKnownAnchorIndexRef,
    } = refs;

    const [chapters, setChapters] = useState<LoadedChapter[]>([]);
    const [spineItems, setSpineItems] = useState<SpineItemInfo[]>([]);
    const [currentSpineIndex, setCurrentSpineIndex] = useState(initialSpineIndex);

    const [isInitialized, setIsInitialized] = useState(false);
    const [highlights, setHighlights] = useState<Highlight[]>([]);

    const highlightsBySpineIndex = useMemo(() => {
        const grouped = new Map<number, Highlight[]>();
        highlights.forEach((highlight) => {
            const spineIndex = resolveHighlightSpineIndex(highlight.cfiRange);
            if (spineIndex === null) return;
            const existing = grouped.get(spineIndex) ?? [];
            existing.push(highlight);
            grouped.set(spineIndex, existing);
        });
        return grouped;
    }, [highlights]);

    const handleHighlightCreated = useCallback((highlight: Highlight) => {
        setHighlights((prev) => prev.some((item) => item.id === highlight.id) ? prev : [...prev, highlight]);
    }, []);

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
    } = useSelectionMenu({ bookId, onSelectionSearch, getHighlightContainer, onHighlightCreated: handleHighlightCreated });
    const shadowResourceExists = useCallback((url: string) => {
        return provider.isAssetUrlAvailable?.(url) ?? true;
    }, [provider]);

    // Keep refs in sync with state
    chaptersRef.current = chapters;

    useEffect(() => {
        let disposed = false;
        renderedHighlightsRef.current.clear();
        highlightDirtyChaptersRef.current.clear();
        lastReportedProgressRef.current = null;
        pendingProgressSnapshotRef.current = null;
        setHighlights([]);

        db.highlights.where('bookId').equals(bookId).toArray()
            .then((loaded) => {
                if (disposed) return;
                setHighlights(loaded);
            })
            .catch((error) => {
                if (!disposed) {
                    console.warn('[ScrollReader] Highlight preload failed:', error);
                }
            });

        return () => {
            disposed = true;
        };
    }, [bookId, renderedHighlightsRef]);

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

    // ── Physics / Scroll Hooks ──

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

    // ── Idle Prefetch Scheduling ──

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

    // ── Chapter Resize Observer ──

    const {
        observeResizeNode,
        unobserveResizeNode,
        observeChapterResizeNodes,
        unobserveChapterResizeNodes,
        resetResizeObservers,
    } = useChapterResizeObserver(refs);

    // ── Virtual Chapter Runtime ──

    const {
        virtualChaptersRef,
        chapterVectorsRef,
        mountVirtualSegment,
        releaseVirtualSegment,
        cleanupVirtualChapterRuntime,
        refreshVirtualChapterLayout,
        registerVirtualChapterRuntime,
    } = useVirtualChapterRuntime({ observeResizeNode, unobserveResizeNode });

    // ── Aggregate Unmount Cleanup ──

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
    }, [cancelIdlePrefetch, virtualChaptersRef]);

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

    const { loadChapter, runPredictivePrefetch } = useChapterLoader(refs, {
        provider,
        readerStyles,
        currentSpineIndex,
        isInitialized,
        chapterVectorsRef,
        renderedHighlightsRef,
        setChapters,
        setShadowQueue,
        scheduleIdlePrefetch,
        cancelIdlePrefetch,
    });

    // ── Atomic DOM Commit ──

    const { requestFlush, commitProgressSnapshot, syncViewportState } = useAtomicDomCommit(refs, {
        chapters,
        spineItems,
        currentSpineIndex,
        initialScrollOffset,
        isInitialized,
        bookId,
        onProgressChange,
        onChapterChange,
        setChapters,
        setIsInitialized,
        setCurrentSpineIndex,
        virtualChaptersRef,
        cleanupVirtualChapterRuntime,
        registerVirtualChapterRuntime,
        mountVirtualSegment,
        refreshVirtualChapterLayout,
        observeChapterResizeNodes,
        unobserveChapterResizeNodes,
    });

    // ── Shadow Render Complete Handler ──

    const { handleShadowReady, forceHydrateSegment, materializeAllVirtualSegments } = useShadowRenderComplete(refs, {
        chapterVectorsRef,
        virtualChaptersRef,
        mountVirtualSegment,
        refreshVirtualChapterLayout,
        setChapters,
        setShadowQueue,
        requestFlush,
    });

    // ── Scroll Event Handler ──

    useScrollHandler(refs, {
        spineItems,
        loadChapter,
        runPredictivePrefetch,
        scheduleIdlePrefetch,
        cancelIdlePrefetch,
        syncViewportState,
        commitProgressSnapshot,
    });

    // ── Chapter Unloading ──

    useChapterUnloader(refs, {
        provider,
        currentSpineIndex,
        cleanupVirtualChapterRuntime,
        unobserveChapterResizeNodes,
        chapterVectorsRef,
        setChapters,
    });

    // ── TOC Jump ──

    const { jumpToSpine } = useTocJump(refs, {
        onChapterChange,
        setCurrentSpineIndex,
        setChapters: (next: LoadedChapter[]) => setChapters(next),
        setShadowQueue: (next: LoadedChapter[]) => setShadowQueue(next),
        chapterVectorsRef,
        loadChapter,
        cleanupVirtualChapterRuntime,
        forceHydrateSegment,
        materializeAllVirtualSegments,
        resetResizeObservers,
        syncViewportState,
        cancelIdlePrefetch,
        stop,
    });

    // Expose jumpToSpine via ref for parent component
    useImperativeHandle(ref, () => ({
        jumpToSpine
    }));

    // ── Selection + Highlight ──

    const { scheduleHighlightInjection } = useHighlightAndSelection(refs, {
        chapters,
        highlightsBySpineIndex,
        renderedHighlightsRef,
        selectionMenu,
        setSelectionMenu,
    });

    // ── Active-only 虚拟段同步 ──

    useVirtualSegmentSync(refs, {
        chapters,
        highlightsBySpineIndex,
        virtualChaptersRef,
        mountVirtualSegment,
        releaseVirtualSegment,
        refreshVirtualChapterLayout,
        scheduleHighlightInjection,
    });

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

ScrollReaderViewComponent.displayName = 'ScrollReaderView';

export const ScrollReaderView = memo(ScrollReaderViewComponent);
