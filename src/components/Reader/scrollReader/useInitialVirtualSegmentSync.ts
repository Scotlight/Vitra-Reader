import { useCallback } from 'react';
import type { MutableRefObject } from 'react';
import { computeGlobalVirtualSegmentMountPlan } from '../scrollVectorStrategy';
import {
    GLOBAL_VIRTUAL_SEGMENT_BUDGET,
    RANGE_HYDRATION_OVERSCAN_SEGMENTS,
    RANGE_HYDRATION_PRELOAD_MARGIN_PX,
} from './scrollReaderConstants';
import type { ScrollReaderRefs } from './useScrollReaderRefs';
import type { VirtualChapterRuntime } from './useVirtualChapterRuntime';

interface UseInitialVirtualSegmentSyncOptions {
    virtualChaptersRef: MutableRefObject<Map<string, VirtualChapterRuntime>>;
    mountVirtualSegment: (runtime: VirtualChapterRuntime, segmentIndex: number) => void;
    refreshVirtualChapterLayout: (runtime: VirtualChapterRuntime) => void;
}

export function useInitialVirtualSegmentSync(
    refs: ScrollReaderRefs,
    options: UseInitialVirtualSegmentSyncOptions,
) {
    const { viewportRef, virtualSyncRafRef } = refs;
    const {
        virtualChaptersRef,
        mountVirtualSegment,
        refreshVirtualChapterLayout,
    } = options;

    return useCallback(() => {
        if (virtualSyncRafRef.current !== null) return;
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
    }, [mountVirtualSegment, refreshVirtualChapterLayout, virtualChaptersRef, virtualSyncRafRef, viewportRef]);
}
