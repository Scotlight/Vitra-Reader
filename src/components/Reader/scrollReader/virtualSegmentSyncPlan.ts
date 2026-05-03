import { computeGlobalVirtualSegmentMountPlan } from '../scrollVectorStrategy';
import {
    GLOBAL_VIRTUAL_SEGMENT_BUDGET,
    RANGE_HYDRATION_OVERSCAN_SEGMENTS,
    RANGE_HYDRATION_PRELOAD_MARGIN_PX,
} from './scrollReaderConstants';
import type { VirtualChapterRuntime } from './useVirtualChapterRuntime';

export function resolveVirtualSegmentMountPlan(
    runtimes: VirtualChapterRuntime[],
    scrollTop: number,
    viewportHeight: number,
): Map<string, number[]> {
    return computeGlobalVirtualSegmentMountPlan(
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
}

export function mountPlannedVirtualSegments(
    runtime: VirtualChapterRuntime,
    mountPlan: ReadonlyMap<string, number[]>,
    mountVirtualSegment: (runtime: VirtualChapterRuntime, segmentIndex: number) => void,
): void {
    const nextIndices = new Set(mountPlan.get(runtime.chapterId) ?? []);
    Array.from(nextIndices).sort((a, b) => a - b).forEach((segmentIndex) => {
        mountVirtualSegment(runtime, segmentIndex);
    });
}

export function syncPlannedVirtualSegments(
    runtime: VirtualChapterRuntime,
    mountPlan: ReadonlyMap<string, number[]>,
    mountVirtualSegment: (runtime: VirtualChapterRuntime, segmentIndex: number) => void,
    releaseVirtualSegment: (runtime: VirtualChapterRuntime, segmentIndex: number) => void,
): boolean {
    const nextIndices = new Set(mountPlan.get(runtime.chapterId) ?? []);
    let virtualDomChanged = false;

    Array.from(runtime.activeSegmentEls.keys()).forEach((segmentIndex) => {
        if (!nextIndices.has(segmentIndex)) {
            virtualDomChanged = true;
            releaseVirtualSegment(runtime, segmentIndex);
        }
    });

    Array.from(nextIndices).sort((a, b) => a - b).forEach((segmentIndex) => {
        const alreadyMounted = runtime.activeSegmentEls.has(segmentIndex);
        mountVirtualSegment(runtime, segmentIndex);
        if (!alreadyMounted) {
            virtualDomChanged = true;
        }
    });

    return virtualDomChanged;
}
