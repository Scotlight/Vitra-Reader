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
import { useIdlePrefetch } from './scrollReader/useIdlePrefetch';
import { useBookHighlights } from './scrollReader/useBookHighlights';
import { useScrollPhysics, DEFAULT_SMOOTH_CONFIG, type SmoothScrollConfig } from './scrollReader/useScrollPhysics';
import type { LoadedChapter } from './scrollReader/scrollReaderTypes';
import { type Highlight } from '../../services/storageService';
import { cancelIdleTask } from '../../utils/idleScheduler';
import { useSelectionMenu } from '../../hooks/useSelectionMenu';
import styles from './ScrollReaderView.module.css';

// ── Types ──

interface ScrollReaderViewProps {
    provider: ContentProvider;
    bookId: string;
    initialSpineIndex?: number;
    initialScrollOffset?: number;
    smoothConfig?: SmoothScrollConfig;
    readerStyles: ReaderStyleConfig;
    onProgressChange?: (progress: number) => void;
    onChapterChange?: (label: string, href: string) => void;
    onSelectionSearch?: (keyword: string) => void;
}

export interface ScrollReaderHandle {
    jumpToSpine: (spineIndex: number, searchText?: string) => Promise<void>;
}

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

    // ── Highlights ──

    const { highlights, handleHighlightCreated } = useBookHighlights({
        bookId,
        highlightDirtyChaptersRef,
        lastReportedProgressRef,
        pendingProgressSnapshotRef,
    });

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

    // Clear rendered highlights cache when book changes
    useEffect(() => {
        renderedHighlightsRef.current.clear();
    }, [bookId, renderedHighlightsRef]);

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

    const shadowResourceExists = useCallback((url: string) => {
        return provider.isAssetUrlAvailable?.(url) ?? true;
    }, [provider]);

    // Keep refs in sync with state
    chaptersRef.current = chapters;

    // ── Physics / Scroll ──

    const { stop } = useScrollPhysics(viewportRef, smoothConfig);

    // ── Idle Prefetch Scheduling ──

    const { scheduleIdlePrefetch, cancelIdlePrefetch } = useIdlePrefetch(refs);

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
