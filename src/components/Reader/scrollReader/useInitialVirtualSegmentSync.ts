import { useCallback } from 'react';
import type { MutableRefObject } from 'react';
import {
    mountPlannedVirtualSegments,
    resolveVirtualSegmentMountPlan,
} from './virtualSegmentSyncPlan';
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
            const mountPlan = resolveVirtualSegmentMountPlan(runtimes, scrollTop, viewportHeight);

            runtimes.forEach((runtime) => {
                mountPlannedVirtualSegments(runtime, mountPlan, mountVirtualSegment);
                refreshVirtualChapterLayout(runtime);
            });
        });
    }, [mountVirtualSegment, refreshVirtualChapterLayout, virtualChaptersRef, virtualSyncRafRef, viewportRef]);
}
