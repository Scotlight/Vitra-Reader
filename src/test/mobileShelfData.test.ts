import { describe, it, expect } from 'vitest'
import type { BookMeta } from '@/services/storageService'
import {
    buildShelfChips,
    filterShelfBooks,
    type LibraryProgressMap,
    type ShelfChip,
} from '@/components/Library/mobileShelf/mobileShelfData'

describe('mobileShelfData', () => {
    const mockBook = (overrides: Partial<BookMeta> = {}): BookMeta => ({
        id: 'book1',
        title: 'Test Book',
        author: 'Test Author',
        format: 'epub',
        fileSize: 1024,
        addedAt: Date.now(),
        lastReadAt: undefined,
        ...overrides,
    })

    describe('buildShelfChips', () => {
        it('空库时返回 [全部, 未读]', () => {
            const chips = buildShelfChips([])
            expect(chips).toEqual([{ kind: 'all' }, { kind: 'unread' }])
        })

        it('有分组时返回 [全部, ...分组, 未读]', () => {
            const groups = [
                { id: 'g1', name: '技术' },
                { id: 'g2', name: '文学' },
            ]
            const chips = buildShelfChips(groups)
            expect(chips).toEqual([
                { kind: 'all' },
                { kind: 'group', groupId: 'g1', name: '技术' },
                { kind: 'group', groupId: 'g2', name: '文学' },
                { kind: 'unread' },
            ])
        })

        it('保持分组原顺序', () => {
            const groups = [
                { id: 'g3', name: 'C' },
                { id: 'g1', name: 'A' },
                { id: 'g2', name: 'B' },
            ]
            const chips = buildShelfChips(groups)
            expect(chips[1]).toEqual({ kind: 'group', groupId: 'g3', name: 'C' })
            expect(chips[2]).toEqual({ kind: 'group', groupId: 'g1', name: 'A' })
            expect(chips[3]).toEqual({ kind: 'group', groupId: 'g2', name: 'B' })
        })
    })

    describe('filterShelfBooks', () => {
        const book1 = mockBook({ id: 'b1', title: 'Book 1', lastReadAt: 1000 })
        const book2 = mockBook({ id: 'b2', title: 'Book 2', lastReadAt: 3000 })
        const book3 = mockBook({ id: 'b3', title: 'Book 3', lastReadAt: 2000 })
        const trashedBook = mockBook({ id: 'b4', title: 'Trashed', lastReadAt: 4000 })

        const books = [book1, book2, book3, trashedBook]
        const progressMap: LibraryProgressMap = { b1: 50, b2: 0, b3: 100 }
        const trashSet = new Set(['b4'])
        const groupBookMap = { g1: ['b2', 'b1'], g2: ['b3'] }

        it('空库时任何 chip 都返回空数组', () => {
            const chipAll: ShelfChip = { kind: 'all' }
            const result = filterShelfBooks([], chipAll, progressMap, trashSet, {})
            expect(result).toEqual([])
        })

        it('全部 chip：排除回收站，按 lastReadAt 降序', () => {
            const chipAll: ShelfChip = { kind: 'all' }
            const result = filterShelfBooks(books, chipAll, progressMap, trashSet, groupBookMap)
            expect(result.map((b) => b.id)).toEqual(['b2', 'b3', 'b1'])
        })

        it('回收站书在任何 chip 下都不出现', () => {
            const chipAll: ShelfChip = { kind: 'all' }
            const result = filterShelfBooks(books, chipAll, progressMap, trashSet, groupBookMap)
            expect(result.some((b) => b.id === 'b4')).toBe(false)
        })

        it('未读 chip：progress === 0 或 undefined', () => {
            const chipUnread: ShelfChip = { kind: 'unread' }
            const result = filterShelfBooks(books, chipUnread, progressMap, trashSet, groupBookMap)
            // b2 progress=0, trashedBook 在回收站不算
            expect(result.map((b) => b.id)).toEqual(['b2'])
        })

        it('未读 chip：progress === 1 不算未读', () => {
            const progressWithOne: LibraryProgressMap = { b1: 1, b2: 0, b3: 50 }
            const chipUnread: ShelfChip = { kind: 'unread' }
            const result = filterShelfBooks(books, chipUnread, progressWithOne, trashSet, groupBookMap)
            expect(result.map((b) => b.id)).toEqual(['b2'])
        })

        it('未读 chip：progress === 100 不算未读', () => {
            const chipUnread: ShelfChip = { kind: 'unread' }
            const result = filterShelfBooks(books, chipUnread, progressMap, trashSet, groupBookMap)
            expect(result.some((b) => b.id === 'b3')).toBe(false)
        })

        it('未读 chip：progressMap 里没键算未读', () => {
            const newBook = mockBook({ id: 'b5', title: 'New' })
            const booksWithNew = [...books, newBook]
            const chipUnread: ShelfChip = { kind: 'unread' }
            const result = filterShelfBooks(booksWithNew, chipUnread, progressMap, trashSet, groupBookMap)
            expect(result.some((b) => b.id === 'b5')).toBe(true)
        })

        it('分组 chip：保持 groupBookMap 顺序，不重排', () => {
            const chipGroup: ShelfChip = { kind: 'group', groupId: 'g1', name: '技术' }
            const result = filterShelfBooks(books, chipGroup, progressMap, trashSet, groupBookMap)
            // groupBookMap g1 = ['b2', 'b1']，不按 lastReadAt 排
            expect(result.map((b) => b.id)).toEqual(['b2', 'b1'])
        })

        it('分组内的书同时出现在"全部"里', () => {
            const chipAll: ShelfChip = { kind: 'all' }
            const resultAll = filterShelfBooks(books, chipAll, progressMap, trashSet, groupBookMap)
            expect(resultAll.some((b) => b.id === 'b2')).toBe(true)

            const chipGroup: ShelfChip = { kind: 'group', groupId: 'g1', name: '技术' }
            const resultGroup = filterShelfBooks(books, chipGroup, progressMap, trashSet, groupBookMap)
            expect(resultGroup.some((b) => b.id === 'b2')).toBe(true)
        })

        it('不存在的分组 ID 返回空数组', () => {
            const chipGroup: ShelfChip = { kind: 'group', groupId: 'nonexistent', name: 'X' }
            const result = filterShelfBooks(books, chipGroup, progressMap, trashSet, groupBookMap)
            expect(result).toEqual([])
        })

        it('分组内某本书已删除时跳过', () => {
            const groupMapWithDeleted = { g1: ['b2', 'deleted-id', 'b1'] }
            const chipGroup: ShelfChip = { kind: 'group', groupId: 'g1', name: '技术' }
            const result = filterShelfBooks(books, chipGroup, progressMap, trashSet, groupMapWithDeleted)
            expect(result.map((b) => b.id)).toEqual(['b2', 'b1'])
        })
    })
})
