import {
    useEffect, useState, useCallback,
    forwardRef, memo, useImperativeHandle
} from 'react';
import type { ContentProvider } from '@/engine/core/contentProvider';
import type { ReaderStyleConfig } from './ShadowRenderer';
import { ScrollReaderShell } from './ScrollReaderShell';
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
import { useVirtualHeightCommit } from './scrollReader/useVirtualHeightCommit';
import { useChapterResizeObserver } from './scrollReader/useChapterResizeObserver';
import { useIdlePrefetch } from './scrollReader/useIdlePrefetch';
import { useBookHighlights } from './scrollReader/useBookHighlights';
import { useScrollPhysics, DEFAULT_SMOOTH_CONFIG, type SmoothScrollConfig } from './scrollReader/useScrollPhysics';
import { useSpineItems } from './scrollReader/useSpineItems';
import { useReaderUnmountCleanup } from './scrollReader/useReaderUnmountCleanup';
import {
    clampReaderUnit,
    resolveProgressInChapter,
    type ReaderModePositionSnapshot,
} from './readerModeSwitchPosition';
import {
    markChapterShadowRenderError,
    removeShadowQueueChapter,
} from './scrollChapterLoad';
import { markScrollPipelineIdle } from './scrollReader/scrollPipelineRuntime';
import type { LoadedChapter } from './scrollReader/scrollReaderTypes';
import { useSelectionMenu } from '@/hooks/useSelectionMenu';
interface ScrollReaderViewProps {
    provider: ContentProvider;
    bookId: string;
    initialSpineIndex?: number;
    initialScrollOffset?: number;
    initialChapterProgress?: number;
    smoothConfig?: SmoothScrollConfig;
    readerStyles: ReaderStyleConfig;
    onProgressChange?: (progress: number) => void;
    onChapterChange?: (label: string, href: string) => void;
    onSelectionSearch?: (keyword: string) => void;
}
export interface ScrollReaderHandle {
    jumpToSpine: (spineIndex: number, searchText?: string) => Promise<void>;
    getPosition: () => ReaderModePositionSnapshot | null;
}
const ScrollReaderViewComponent = forwardRef<ScrollReaderHandle, ScrollReaderViewProps>(({
    provider,
    bookId,
    initialSpineIndex = 0,
    initialScrollOffset = 0,
    initialChapterProgress,
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
        chaptersRef,
        highlightDirtyChaptersRef,
        lastReportedProgressRef,
        pendingProgressSnapshotRef,
        lastKnownAnchorIndexRef,
    } = refs;
    const [chapters, setChapters] = useState<LoadedChapter[]>([]);
    const [currentSpineIndex, setCurrentSpineIndex] = useState(initialSpineIndex);
    const [isInitialized, setIsInitialized] = useState(false);
    const spineItems = useSpineItems(refs, provider);
    const { handleHighlightCreated, highlightsBySpineIndex } = useBookHighlights({
        bookId,
        highlightDirtyChaptersRef,
        lastReportedProgressRef,
        pendingProgressSnapshotRef,
    });
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
    useEffect(() => {
        renderedHighlightsRef.current.clear();
    }, [bookId, renderedHighlightsRef]);
    const shadowResourceExists = useCallback((url: string) => {
        return provider.isAssetUrlAvailable?.(url) ?? true;
    }, [provider]);
    chaptersRef.current = chapters;
    const { stop } = useScrollPhysics(viewportRef, smoothConfig);
    const { scheduleIdlePrefetch, cancelIdlePrefetch } = useIdlePrefetch(refs);
    const {
        observeResizeNode,
        unobserveResizeNode,
        observeChapterResizeNodes,
        unobserveChapterResizeNodes,
        resetResizeObservers,
    } = useChapterResizeObserver(refs);
    const {
        virtualChaptersRef,
        chapterVectorsRef,
        mountVirtualSegment,
        releaseVirtualSegment,
        cleanupVirtualChapterRuntime,
        refreshVirtualChapterLayout,
        registerVirtualChapterRuntime,
    } = useVirtualChapterRuntime({ observeResizeNode, unobserveResizeNode });
    useReaderUnmountCleanup(refs, {
        cancelIdlePrefetch,
        virtualChaptersRef,
        cleanupVirtualChapterRuntime,
    });
    const [shadowQueue, setShadowQueue] = useState<LoadedChapter[]>([]);
    useEffect(() => {
        if (spineItems.length === 0 || isInitialized) return;
        if (loadingLockRef.current.size > 0) return; // already loading
        const safeIndex = Math.min(initialSpineIndex, spineItems.length - 1);
        setCurrentSpineIndex(safeIndex);
        lastKnownAnchorIndexRef.current = safeIndex;
        loadChapter(safeIndex, 'initial');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [spineItems]);
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
    const { requestFlush, commitProgressSnapshot, syncViewportState } = useAtomicDomCommit(refs, {
        chapters,
        spineItems,
        currentSpineIndex,
        initialScrollOffset,
        initialChapterProgress,
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
    useVirtualHeightCommit(refs, {
        chapterVectorsRef,
        virtualChaptersRef,
        refreshVirtualChapterLayout,
        requestFlush,
    });
    const { handleShadowReady, forceHydrateSegment, materializeAllVirtualSegments } = useShadowRenderComplete(refs, {
        chapterVectorsRef,
        virtualChaptersRef,
        mountVirtualSegment,
        refreshVirtualChapterLayout,
        setChapters,
        setShadowQueue,
        requestFlush,
    });
    useScrollHandler(refs, {
        spineItems,
        loadChapter,
        runPredictivePrefetch,
        scheduleIdlePrefetch,
        cancelIdlePrefetch,
        syncViewportState,
        commitProgressSnapshot,
    });
    useChapterUnloader(refs, {
        provider,
        currentSpineIndex,
        cleanupVirtualChapterRuntime,
        unobserveChapterResizeNodes,
        chapterVectorsRef,
        setChapters,
    });
    const { jumpToSpine } = useTocJump(refs, {
        provider,
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
    const getPosition = useCallback((): ReaderModePositionSnapshot | null => {
        const spineCount = spineItems.length;
        if (spineCount === 0) return null;
        const snapshot = pendingProgressSnapshotRef.current;
        const spineIndex = snapshot?.spineIndex ?? lastKnownAnchorIndexRef.current ?? currentSpineIndex;
        const scrollTop = viewportRef.current?.scrollTop ?? snapshot?.scrollTop ?? 0;
        const chapterProgress = snapshot
            ? resolveProgressInChapter(snapshot.progress, spineIndex, spineCount)
            : clampReaderUnit(initialChapterProgress ?? 0);
        return {
            sourceMode: 'scrolled-continuous',
            spineIndex,
            position: scrollTop,
            chapterProgress,
        };
    }, [
        currentSpineIndex,
        initialChapterProgress,
        lastKnownAnchorIndexRef,
        pendingProgressSnapshotRef,
        spineItems.length,
        viewportRef,
    ]);
    useImperativeHandle(ref, () => ({
        jumpToSpine,
        getPosition,
    }));
    const { scheduleHighlightInjection } = useHighlightAndSelection(refs, {
        chapters,
        highlightsBySpineIndex,
        renderedHighlightsRef,
        selectionMenu,
        setSelectionMenu,
    });
    useVirtualSegmentSync(refs, {
        chapters,
        highlightsBySpineIndex,
        virtualChaptersRef,
        mountVirtualSegment,
        releaseVirtualSegment,
        refreshVirtualChapterLayout,
        scheduleHighlightInjection,
    });
    const handleShadowRenderError = useCallback((spineIndex: number, chapterId: string, err: Error) => {
        console.error(`[ScrollReader] Shadow error for ${chapterId}:`, err);
        setShadowQueue(prev => removeShadowQueueChapter(prev, spineIndex) as LoadedChapter[]);
        setChapters(prev => markChapterShadowRenderError(prev, spineIndex) as LoadedChapter[]);
        markScrollPipelineIdle(refs);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return (
        <ScrollReaderShell
            chapters={chapters}
            chapterListRef={chapterListRef}
            handleShadowReady={handleShadowReady}
            handleShadowRenderError={handleShadowRenderError}
            isInitialized={isInitialized}
            readerStyles={readerStyles}
            renderSelectionUI={renderSelectionUI}
            shadowQueue={shadowQueue}
            shadowResourceExists={shadowResourceExists}
            viewportRef={viewportRef}
        />
    );
});
ScrollReaderViewComponent.displayName = 'ScrollReaderView';
export const ScrollReaderView = memo(ScrollReaderViewComponent);
