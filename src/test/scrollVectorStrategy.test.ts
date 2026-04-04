import { describe, expect, it } from 'vitest';
import { buildChapterMetaVector } from '../engine/render/metaVectorManager';
import type { SegmentMeta } from '../engine/types/vectorRender';
import {
    canRestoreWindowedVectorPlaceholder,
    computeGlobalVirtualSegmentMountPlan,
    shouldBypassShadowQueueForSegmentMetas,
} from '../components/Reader/scrollVectorStrategy';

function createSegment(
    index: number,
    charCount: number,
    estimatedHeight: number,
): SegmentMeta {
    return {
        index,
        charCount,
        estimatedHeight,
        realHeight: null,
        offsetY: 0,
        measured: false,
        htmlContent: `<p>segment-${index}</p>`,
        hasMedia: false,
    };
}

describe('scrollVectorStrategy', () => {
    it('placeholder 且样式键一致时允许恢复向量缓存', () => {
        expect(canRestoreWindowedVectorPlaceholder({
            status: 'placeholder',
            vectorStyleKey: '{"fontSize":16}',
            segmentMetas: [createSegment(0, 200_000, 320)],
        }, '{"fontSize":16}')).toBe(true);
    });

    it('样式键变化时禁止复用旧的向量缓存', () => {
        expect(canRestoreWindowedVectorPlaceholder({
            status: 'placeholder',
            vectorStyleKey: '{"fontSize":18}',
            segmentMetas: [createSegment(0, 200_000, 320)],
        }, '{"fontSize":16}')).toBe(false);
    });

    it('命中向量化计划的章节继续绕过 shadowQueue', () => {
        const segmentMetas = [
            createSegment(0, 180_000, 320),
            createSegment(1, 180_000, 320),
            createSegment(2, 180_000, 320),
        ];

        expect(shouldBypassShadowQueueForSegmentMetas(segmentMetas)).toBe(true);
    });

    it('跨章节预算控制只保留最接近视口的全局段集合', () => {
        const chapterA = buildChapterMetaVector('ch-0', 0, [
            createSegment(0, 180_000, 120),
            createSegment(1, 180_000, 120),
            createSegment(2, 180_000, 120),
        ]);
        const chapterB = buildChapterMetaVector('ch-1', 1, [
            createSegment(0, 180_000, 120),
            createSegment(1, 180_000, 120),
            createSegment(2, 180_000, 120),
        ]);

        const plan = computeGlobalVirtualSegmentMountPlan([
            { chapterId: 'ch-0', chapterTop: 0, vector: chapterA },
            { chapterId: 'ch-1', chapterTop: 360, vector: chapterB },
        ], 300, 120, {
            overscanSegments: 0,
            preloadMarginPx: 200,
            globalSegmentBudget: 2,
        });

        expect(plan.get('ch-0')).toEqual([2]);
        expect(plan.get('ch-1')).toEqual([0]);
    });
});
