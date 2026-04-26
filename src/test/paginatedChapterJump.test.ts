import { describe, expect, it } from 'vitest'
import { resolveNextPaginatedTarget, resolvePrevPaginatedTarget } from '@/components/Reader/paginatedChapterJump'

describe('paginatedChapterJump', () => {
    it('正常翻到下一页并跳过空白页', () => {
        expect(resolveNextPaginatedTarget({
            currentPage: 0,
            currentSpineIndex: 1,
            isPageLikelyBlank: (pageIndex) => pageIndex === 1,
            totalPages: 4,
            totalSpines: 5,
        })).toEqual({ kind: 'page', page: 2 })
    })

    it('到达章节末尾时跳到下一章', () => {
        expect(resolveNextPaginatedTarget({
            currentPage: 2,
            currentSpineIndex: 1,
            isPageLikelyBlank: () => false,
            totalPages: 3,
            totalSpines: 5,
        })).toEqual({ kind: 'chapter', spineIndex: 2, goToLastPage: false })
    })

    it('正常翻到上一页并跳过空白页', () => {
        expect(resolvePrevPaginatedTarget({
            currentPage: 3,
            currentSpineIndex: 2,
            isPageLikelyBlank: (pageIndex) => pageIndex === 2,
        })).toEqual({ kind: 'page', page: 1 })
    })

    it('到达章节开头时跳到上一章末页', () => {
        expect(resolvePrevPaginatedTarget({
            currentPage: 0,
            currentSpineIndex: 2,
            isPageLikelyBlank: () => false,
        })).toEqual({ kind: 'chapter', spineIndex: 1, goToLastPage: true })
    })
})
