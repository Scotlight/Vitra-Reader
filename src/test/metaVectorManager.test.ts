import { describe, expect, it } from 'vitest';
import {
    batchUpdateSegmentHeights,
    buildChapterMetaVector,
} from '@/engine/render/metaVectorManager';
import type { SegmentMeta } from '@/engine/types/vectorRender';

function createSegment(
    index: number,
    estimatedHeight: number,
    realHeight: number | null = null,
    measured: boolean = false,
): SegmentMeta {
    return {
        index,
        charCount: 10_000,
        estimatedHeight,
        realHeight,
        offsetY: 0,
        measured,
        htmlContent: `<p>segment-${index}</p>`,
        hasMedia: false,
    };
}

describe('metaVectorManager', () => {
    it('从已测量段恢复 metaVector 时保留 offsetY 与 fullyMeasured', () => {
        const vector = buildChapterMetaVector('chapter-1', 0, [
            createSegment(0, 120, 140, true),
            createSegment(1, 130, 150, true),
            createSegment(2, 140, 160, true),
        ]);

        expect(vector.fullyMeasured).toBe(true);
        expect(vector.totalEstimatedHeight).toBe(450);
        expect(vector.totalMeasuredHeight).toBe(450);
        expect(vector.segments.map((segment) => segment.offsetY)).toEqual([0, 140, 290]);
    });

    it('批量回写最后一批实测高度后切换为 fullyMeasured', () => {
        const vector = buildChapterMetaVector('chapter-2', 1, [
            createSegment(0, 120, 132, true),
            createSegment(1, 130, null, false),
            createSegment(2, 140, null, false),
        ]);

        const totalDelta = batchUpdateSegmentHeights(vector, [
            { index: 1, realHeight: 148 },
            { index: 2, realHeight: 156 },
        ]);

        expect(totalDelta).toBe(34);
        expect(vector.fullyMeasured).toBe(true);
        expect(vector.totalEstimatedHeight).toBe(436);
        expect(vector.segments.map((segment) => segment.offsetY)).toEqual([0, 132, 280]);
    });
});
