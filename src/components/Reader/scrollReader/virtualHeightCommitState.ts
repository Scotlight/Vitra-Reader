import { batchUpdateSegmentHeights } from '@/engine';
import type { ChapterMetaVector } from '@/engine';
import type { VirtualChapterRuntime } from './useVirtualChapterRuntime';

interface SegmentResizeTarget {
    chapterId: string;
    segmentIndex: number;
}

interface ApplyPendingVirtualHeightUpdatesOptions {
    pending: Map<string, Map<number, number>>;
    chapterVectors: Map<string, ChapterMetaVector>;
    virtualChapters: Map<string, VirtualChapterRuntime>;
    anchorIndex: number;
    refreshVirtualChapterLayout: (runtime: VirtualChapterRuntime) => void;
}

export function resolveSegmentResizeTarget(target: HTMLElement): SegmentResizeTarget | null {
    const indexAttr = target.getAttribute('data-shadow-segment-index');
    if (indexAttr === null) return null;

    const segmentIndex = Number.parseInt(indexAttr, 10);
    if (!Number.isFinite(segmentIndex) || segmentIndex < 0) return null;

    const chapterEl = target.closest('[data-chapter-id]') as HTMLElement | null;
    if (!chapterEl) return null;

    const chapterId = chapterEl.getAttribute('data-chapter-id');
    if (!chapterId) return null;

    return { chapterId, segmentIndex };
}

export function recordPendingSegmentHeightUpdate(
    pending: Map<string, Map<number, number>>,
    chapterId: string,
    segmentIndex: number,
    height: number,
): void {
    let segmentMap = pending.get(chapterId);
    if (!segmentMap) {
        segmentMap = new Map();
        pending.set(chapterId, segmentMap);
    }
    segmentMap.set(segmentIndex, height);
}

export function applyPendingVirtualHeightUpdates({
    pending,
    chapterVectors,
    virtualChapters,
    anchorIndex,
    refreshVirtualChapterLayout,
}: ApplyPendingVirtualHeightUpdatesOptions): number {
    let aboveAnchorDelta = 0;

    pending.forEach((segmentMap, chapterId) => {
        const vector = chapterVectors.get(chapterId);
        if (!vector) return;

        const updates: Array<{ index: number; realHeight: number }> = [];
        segmentMap.forEach((height, index) => {
            updates.push({ index, realHeight: height });
        });
        if (updates.length === 0) return;

        const totalDelta = batchUpdateSegmentHeights(vector, updates);
        const runtime = virtualChapters.get(chapterId);
        if (!runtime) return;

        if (runtime.spineIndex < anchorIndex) {
            aboveAnchorDelta += totalDelta;
        }
        refreshVirtualChapterLayout(runtime);
    });

    return aboveAnchorDelta;
}
