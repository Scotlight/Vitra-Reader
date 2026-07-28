import { describe, expect, it } from 'vitest'
import type { BookMeta } from '@/services/storageService'
import { pickContinueReading, pickRecentlyAdded } from '@/components/Library/mobileHome/mobileHomeData'

function makeBook(id: string, overrides: Partial<BookMeta> = {}): BookMeta {
    return {
        id,
        title: `书 ${id}`,
        author: '作者',
        fileSize: 1024,
        addedAt: 1000,
        ...overrides,
    }
}

describe('pickContinueReading', () => {
    it('空书库返回 null', () => {
        expect(pickContinueReading([], {}, new Set())).toBeNull()
    })

    it('只剩回收站的书时返回 null', () => {
        const books = [makeBook('a'), makeBook('b')]
        expect(pickContinueReading(books, { a: 40 }, new Set(['a', 'b']))).toBeNull()
    })

    it('在读的书里取 lastReadAt 最新的一本，而不是进度最高的', () => {
        const books = [
            makeBook('old-but-far', { lastReadAt: 100 }),
            makeBook('recent', { lastReadAt: 900 }),
        ]
        const pick = pickContinueReading(books, { 'old-but-far': 90, recent: 5 }, new Set())

        expect(pick?.book.id).toBe('recent')
        expect(pick?.progress).toBe(5)
    })

    it('全部未读时退回最近添加的一本，progress 为真实值 0', () => {
        const books = [
            makeBook('early', { addedAt: 100 }),
            makeBook('late', { addedAt: 900 }),
        ]
        const pick = pickContinueReading(books, {}, new Set())

        expect(pick?.book.id).toBe('late')
        expect(pick?.progress).toBe(0)
    })

    it('全部读完时不把 100% 的书当在读，退回最近添加', () => {
        const books = [
            makeBook('done-early', { addedAt: 100, lastReadAt: 900 }),
            makeBook('done-late', { addedAt: 900, lastReadAt: 100 }),
        ]
        const pick = pickContinueReading(books, { 'done-early': 100, 'done-late': 100 }, new Set())

        // 走的是 addedAt 分支，所以 lastReadAt 更新的 done-early 不该胜出
        expect(pick?.book.id).toBe('done-late')
        expect(pick?.progress).toBe(100)
    })

    it('在读的书被排除后回退到剩余书的最近添加', () => {
        const books = [
            makeBook('trashed-reading', { lastReadAt: 900 }),
            makeBook('kept', { addedAt: 500 }),
        ]
        const pick = pickContinueReading(books, { 'trashed-reading': 50 }, new Set(['trashed-reading']))

        expect(pick?.book.id).toBe('kept')
    })

    it('lastReadAt 缺失的在读书不会压掉有 lastReadAt 的', () => {
        const books = [
            makeBook('no-timestamp'),
            makeBook('has-timestamp', { lastReadAt: 1 }),
        ]
        const pick = pickContinueReading(books, { 'no-timestamp': 30, 'has-timestamp': 30 }, new Set())

        expect(pick?.book.id).toBe('has-timestamp')
    })
})

describe('pickRecentlyAdded', () => {
    it('按 addedAt 倒序并截断到 limit', () => {
        const books = [
            makeBook('a', { addedAt: 300 }),
            makeBook('b', { addedAt: 100 }),
            makeBook('c', { addedAt: 200 }),
        ]
        expect(pickRecentlyAdded(books, new Set(), 2).map((book) => book.id)).toEqual(['a', 'c'])
    })

    it('排除回收站的书', () => {
        const books = [
            makeBook('a', { addedAt: 300 }),
            makeBook('b', { addedAt: 200 }),
        ]
        expect(pickRecentlyAdded(books, new Set(['a']), 6).map((book) => book.id)).toEqual(['b'])
    })

    it('limit 为 0 或负数时返回空数组', () => {
        const books = [makeBook('a')]
        expect(pickRecentlyAdded(books, new Set(), 0)).toEqual([])
        expect(pickRecentlyAdded(books, new Set(), -1)).toEqual([])
    })

    it('不修改传入的数组', () => {
        const books = [
            makeBook('a', { addedAt: 100 }),
            makeBook('b', { addedAt: 900 }),
        ]
        pickRecentlyAdded(books, new Set(), 6)

        expect(books.map((book) => book.id)).toEqual(['a', 'b'])
    })
})
