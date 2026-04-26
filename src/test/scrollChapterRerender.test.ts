import { describe, expect, it } from 'vitest'
import {
    applyStyleChangeToChapters,
    createStyleChangeRerenderPlan,
    filterPendingReadyForStyleChange,
    mergeShadowQueueForStyleChange,
} from '@/components/Reader/scrollChapterRerender'
import type { LoadedChapterState } from '@/components/Reader/scrollChapterLoad'

function createChapter(
    spineIndex: number,
    status: LoadedChapterState['status'],
    charCount: number,
): LoadedChapterState {
    return {
        spineIndex,
        id: `ch-${spineIndex}`,
        htmlContent: '<p>body</p>',
        htmlFragments: ['<p>body</p>'],
        externalStyles: [],
        segmentMetas: charCount > 0 ? [
            {
                index: 0,
                charCount,
                estimatedHeight: 120,
                realHeight: null,
                offsetY: 0,
                measured: false,
                htmlContent: '<p>segment-0</p>',
                hasMedia: false,
            },
            {
                index: 1,
                charCount,
                estimatedHeight: 120,
                realHeight: null,
                offsetY: 120,
                measured: false,
                htmlContent: '<p>segment-1</p>',
                hasMedia: false,
            },
            {
                index: 2,
                charCount,
                estimatedHeight: 120,
                realHeight: null,
                offsetY: 240,
                measured: false,
                htmlContent: '<p>segment-2</p>',
                hasMedia: false,
            },
        ] : undefined,
        vectorStyleKey: 'style-a',
        domNode: null,
        height: 400,
        status,
    }
}

describe('scrollChapterRerender', () => {
    it('生成样式切换 rerender plan', () => {
        const plan = createStyleChangeRerenderPlan([
            createChapter(0, 'mounted', 600_000),
            createChapter(1, 'ready', 20_000),
            createChapter(2, 'placeholder', 600_000),
        ], 'style-b')

        expect(Array.from(plan.vectorReloadIndexes)).toEqual([0])
        expect(Array.from(plan.shadowRerenderIndexes)).toEqual([1])
        expect(plan.rerenderQueue).toHaveLength(1)
        expect(plan.rerenderQueue[0].status).toBe('shadow-rendering')
    })

    it('按 plan 更新章节状态并重排 shadowQueue', () => {
        const chapters = [
            createChapter(0, 'mounted', 600_000),
            createChapter(1, 'ready', 20_000),
        ]
        const plan = createStyleChangeRerenderPlan(chapters, 'style-b')

        const updated = applyStyleChangeToChapters(chapters, plan, 'style-b', (height) => height + 1)
        expect(updated[0]).toMatchObject({
            status: 'placeholder',
            htmlContent: '',
            vectorStyleKey: 'style-b',
            height: 401,
        })
        expect(updated[1]).toMatchObject({
            status: 'shadow-rendering',
            vectorStyleKey: 'style-b',
        })

        const queue = mergeShadowQueueForStyleChange([createChapter(9, 'shadow-rendering', 10)], plan)
        expect(queue.map((chapter) => chapter.spineIndex)).toEqual([9, 1])
    })

    it('按 plan 过滤 pendingReady 项', () => {
        const plan = createStyleChangeRerenderPlan([
            createChapter(0, 'mounted', 600_000),
            createChapter(1, 'ready', 20_000),
        ], 'style-b')

        expect(filterPendingReadyForStyleChange([
            { spineIndex: 0 },
            { spineIndex: 2 },
        ], plan)).toEqual([{ spineIndex: 2 }])
    })
})
