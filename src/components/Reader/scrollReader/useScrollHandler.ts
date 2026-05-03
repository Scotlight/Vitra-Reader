import { useEffect } from 'react';
import type { SpineItemInfo } from '@/engine/core/contentProvider';
import type { ScrollReaderRefs } from './useScrollReaderRefs';
import { PRELOAD_THRESHOLD_PX, SCROLL_IDLE_RESUME_MS } from './scrollReaderConstants';
import { detectScrollDirection, shouldPreloadChapter, ScrollDirection } from '@/utils/scrollDetection';
import { isScrollPipelineIdle } from './scrollPipelineRuntime';
import { resolveScrollPreloadRequest } from './scrollPreloadTarget';

interface UseScrollHandlerOptions {
    spineItems: SpineItemInfo[];
    loadChapter: (spineIndex: number, kind: 'prev' | 'next' | 'initial') => void;
    runPredictivePrefetch: () => void;
    scheduleIdlePrefetch: (task: () => void) => void;
    cancelIdlePrefetch: () => void;
    syncViewportState: (scrollTop: number, viewportHeight: number) => void;
    commitProgressSnapshot: (
        snapshot: { spineIndex: number; progress: number; scrollTop: number } | null,
    ) => void;
}

/**
 * 绑定 viewport 的 scroll 事件：
 * - 标记用户正在滚动（抑制 idle prefetch / chapter unload 等）
 * - 方向检测 + 阈值判断触发相邻章节预加载
 * - 同步 viewport 派生状态（activeSpine / progress）
 * - 防抖提交 progress 快照
 */
export function useScrollHandler(
    refs: ScrollReaderRefs,
    options: UseScrollHandlerOptions,
) {
    const {
        spineItems,
        loadChapter,
        runPredictivePrefetch,
        scheduleIdlePrefetch,
        cancelIdlePrefetch,
        syncViewportState,
        commitProgressSnapshot,
    } = options;
    const {
        viewportRef,
        isUserScrollingRef,
        scrollIdleTimerRef,
        lastScrollTopRef,
        chaptersRef,
        progressTimerRef,
        pendingProgressSnapshotRef,
    } = refs;

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

            const needsPreload = shouldPreloadChapter(
                scrollTop, viewportHeight, contentHeight, direction,
                { threshold: PRELOAD_THRESHOLD_PX }
            );

            if (needsPreload && isScrollPipelineIdle(refs)) {
                const preloadRequest = resolveScrollPreloadRequest(
                    chaptersRef.current,
                    direction,
                    spineItems.length,
                );
                if (preloadRequest?.kind === 'predictive') {
                    runPredictivePrefetch();
                } else if (preloadRequest?.kind === 'chapter') {
                    loadChapter(preloadRequest.spineIndex, preloadRequest.loadKind);
                }
            }

            syncViewportState(scrollTop, viewportHeight);

            if (progressTimerRef.current) {
                window.clearTimeout(progressTimerRef.current);
            }
            progressTimerRef.current = window.setTimeout(() => {
                commitProgressSnapshot(pendingProgressSnapshotRef.current);
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
        syncViewportState,
        commitProgressSnapshot,
        // eslint-disable-next-line react-hooks/exhaustive-deps
    ]);
}
