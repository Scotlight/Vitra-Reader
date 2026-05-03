import { describe, expect, it } from 'vitest'
import {
    beginChapterLoad,
    getPredictivePrefetchCandidates,
    hasActiveChapterLoad,
    isScrollPipelineIdle,
    markScrollPipelineIdle,
    markScrollPipelineRenderingOffscreen,
    releaseChapterLoadLock,
    resetScrollPipelineRuntime,
    resolveChapterLoadDirection,
} from '@/components/Reader/scrollReader/scrollPipelineRuntime'
import { ScrollPipelineState, type PipelineState } from '@/components/Reader/scrollReader/scrollReaderTypes'

function createRefs() {
    return {
        pipelineRef: { current: ScrollPipelineState.IDLE as PipelineState },
        loadingLockRef: { current: new Set<number>() },
    }
}

describe('scrollPipelineRuntime', () => {
    it('维护 pipeline 状态与章节加载锁', () => {
        const refs = createRefs()

        expect(isScrollPipelineIdle(refs)).toBe(true)
        beginChapterLoad(refs, 2)

        expect(refs.pipelineRef.current).toBe(ScrollPipelineState.PRE_FETCHING)
        expect(hasActiveChapterLoad(refs, 2)).toBe(true)

        markScrollPipelineRenderingOffscreen(refs)
        expect(refs.pipelineRef.current).toBe(ScrollPipelineState.RENDERING_OFFSCREEN)

        releaseChapterLoadLock(refs, 2)
        expect(hasActiveChapterLoad(refs, 2)).toBe(false)

        markScrollPipelineIdle(refs)
        expect(isScrollPipelineIdle(refs)).toBe(true)
    })

    it('重置运行时会清空锁并恢复 idle', () => {
        const refs = createRefs()

        beginChapterLoad(refs, 1)
        beginChapterLoad(refs, 3)
        resetScrollPipelineRuntime(refs)

        expect(refs.loadingLockRef.current.size).toBe(0)
        expect(refs.pipelineRef.current).toBe(ScrollPipelineState.IDLE)
    })

    it('计算当前章节相邻预取候选并裁剪边界', () => {
        expect(getPredictivePrefetchCandidates(0, 0)).toEqual([])
        expect(getPredictivePrefetchCandidates(0, 3)).toEqual([0, 1])
        expect(getPredictivePrefetchCandidates(1, 3)).toEqual([0, 1, 2])
        expect(getPredictivePrefetchCandidates(2, 3)).toEqual([1, 2])
    })

    it('按目标章节相对位置解析加载方向', () => {
        expect(resolveChapterLoadDirection(1, 2)).toBe('prev')
        expect(resolveChapterLoadDirection(3, 2)).toBe('next')
        expect(resolveChapterLoadDirection(2, 2)).toBe('initial')
    })
})
