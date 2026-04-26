import { describe, expect, it } from 'vitest'
import { createPaginatedProgressRecord, resolvePaginatedProgress } from '@/components/Reader/paginatedProgress'

describe('paginatedProgress', () => {
    it('计算分页进度', () => {
        expect(resolvePaginatedProgress(2, 3, 5, 10)).toEqual({
            chapterProgress: 0.5,
            progress: 0.35,
        })
    })

    it('无 spine 时返回空值', () => {
        expect(resolvePaginatedProgress(0, 0, 1, 0)).toBeNull()
    })

    it('装配分页进度持久化 payload', () => {
        expect(createPaginatedProgressRecord({
            bookId: 'book-1',
            currentChapterHref: 'chapter-3.xhtml',
            currentPage: 2,
            currentSpineIndex: 3,
            percentage: 0.35,
            updatedAt: 123456,
        })).toEqual({
            bookId: 'book-1',
            location: 'vitra:3:2',
            percentage: 0.35,
            currentChapter: 'chapter-3.xhtml',
            updatedAt: 123456,
        })
    })
})
