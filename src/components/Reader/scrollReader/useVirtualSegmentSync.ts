import { useCallback, useEffect } from 'react';
import type { MutableRefObject } from 'react';
import type { Highlight } from '@/services/storageService';
import {
    resolveVirtualSegmentMountPlan,
    syncPlannedVirtualSegments,
} from './virtualSegmentSyncPlan';
import type { LoadedChapter } from './scrollReaderTypes';
import type { ScrollReaderRefs } from './useScrollReaderRefs';
import type { VirtualChapterRuntime } from './useVirtualChapterRuntime';

interface UseVirtualSegmentSyncOptions {
    chapters: LoadedChapter[];
    highlightsBySpineIndex: Map<number, Highlight[]>;
    virtualChaptersRef: MutableRefObject<Map<string, VirtualChapterRuntime>>;
    mountVirtualSegment: (runtime: VirtualChapterRuntime, segmentIndex: number) => void;
    releaseVirtualSegment: (runtime: VirtualChapterRuntime, segmentIndex: number) => void;
    refreshVirtualChapterLayout: (runtime: VirtualChapterRuntime) => void;
    scheduleHighlightInjection: (chapterEl: HTMLElement, spineIndex: number) => void;
}

/**
 * 基于可视区域的虚拟段 mount/release 协议：
 * - scroll 事件 rAF 节流触发 syncVirtualizedSegmentsByRange
 * - 计算全局 mountPlan（overscan + preloadMargin + budget），再对每个
 *   runtime diff：应挂未挂的 mount，已挂不在计划里的 release
 * - 若某章节段集合变化且有高亮，标记 dirty 并安排高亮注入
 * - 忽略 ignoreScrollEventRef 标志置位时的滚动事件（scroll 补偿期间）
 */
export function useVirtualSegmentSync(
    refs: ScrollReaderRefs,
    options: UseVirtualSegmentSyncOptions,
) {
    const {
        chapters,
        highlightsBySpineIndex,
        virtualChaptersRef,
        mountVirtualSegment,
        releaseVirtualSegment,
        refreshVirtualChapterLayout,
        scheduleHighlightInjection,
    } = options;
    const {
        viewportRef,
        virtualSyncRafRef,
        ignoreScrollEventRef,
        highlightDirtyChaptersRef,
    } = refs;

    const syncVirtualizedSegmentsByRange = useCallback((scrollTop: number, viewportHeight: number) => {
        if (viewportHeight <= 0) return;

        const runtimes = Array.from(virtualChaptersRef.current.values());
        if (runtimes.length === 0) return;

        runtimes.forEach((runtime) => {
            refreshVirtualChapterLayout(runtime);
        });

        const mountPlan = resolveVirtualSegmentMountPlan(runtimes, scrollTop, viewportHeight);

        runtimes.forEach((runtime) => {
            const virtualDomChanged = syncPlannedVirtualSegments(
                runtime,
                mountPlan,
                mountVirtualSegment,
                releaseVirtualSegment,
            );

            refreshVirtualChapterLayout(runtime);
            if (virtualDomChanged && (highlightsBySpineIndex.get(runtime.spineIndex)?.length ?? 0) > 0) {
                highlightDirtyChaptersRef.current.add(runtime.spineIndex);
                scheduleHighlightInjection(runtime.chapterEl, runtime.spineIndex);
            }
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mountVirtualSegment, refreshVirtualChapterLayout, releaseVirtualSegment, highlightsBySpineIndex, scheduleHighlightInjection]);

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
        window.addEventListener('resize', scheduleVirtualSync);
        document.addEventListener('fullscreenchange', scheduleVirtualSync);

        return () => {
            viewport.removeEventListener('scroll', scheduleVirtualSync);
            window.removeEventListener('resize', scheduleVirtualSync);
            document.removeEventListener('fullscreenchange', scheduleVirtualSync);
            if (virtualSyncRafRef.current !== null) {
                cancelAnimationFrame(virtualSyncRafRef.current);
                virtualSyncRafRef.current = null;
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [chapters, syncVirtualizedSegmentsByRange]);
}
