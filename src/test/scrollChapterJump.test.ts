import { describe, expect, it } from 'vitest'
import {
    findMountedJumpTarget,
    resolveChapterDomId,
    resolveJumpLoadDirection,
} from '../components/Reader/scrollChapterJump'

describe('scrollChapterJump', () => {
    it('根据目标和锚点方向返回跳转加载方向', () => {
        expect(resolveJumpLoadDirection(2, 5)).toBe('prev')
        expect(resolveJumpLoadDirection(8, 5)).toBe('next')
        expect(resolveJumpLoadDirection(5, 5)).toBe('initial')
    })

    it('只返回已挂载的目标章节', () => {
        const chapter = findMountedJumpTarget([
            { spineIndex: 0, status: 'placeholder' as const },
            { spineIndex: 1, status: 'mounted' as const },
        ], 1)

        expect(chapter).toEqual({ spineIndex: 1, status: 'mounted' })
        expect(findMountedJumpTarget([
            { spineIndex: 1, status: 'ready' as const },
        ], 1)).toBeUndefined()
    })

    it('生成章节 DOM id', () => {
        expect(resolveChapterDomId(12)).toBe('ch-12')
    })
})
