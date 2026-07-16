import { describe, expect, it } from 'vitest'
import {
    applyShelfLabelMigrationToBook,
    BOOK_SHELF_LABEL,
    resolveMigratedShelfLabel,
} from '@/services/storageService'

describe('shelf label migration', () => {
    it('迁移优先级：收藏优先于进度', () => {
        expect(resolveMigratedShelfLabel({ isFavorite: true, percentage: 1 })).toBe(BOOK_SHELF_LABEL.GOOD)
        expect(resolveMigratedShelfLabel({ isFavorite: false, percentage: 1 })).toBe(BOOK_SHELF_LABEL.READ)
        expect(resolveMigratedShelfLabel({ isFavorite: false, percentage: 0.3 })).toBe(BOOK_SHELF_LABEL.READING)
        expect(resolveMigratedShelfLabel({ isFavorite: false, percentage: 0 })).toBe(BOOK_SHELF_LABEL.TO_READ)
    })

    it('已有合法标签时不覆盖，只补时间戳', () => {
        const result = applyShelfLabelMigrationToBook(
            {
                id: 'book-1',
                shelfLabel: BOOK_SHELF_LABEL.READING,
                addedAt: 100,
                lastReadAt: 200,
            },
            {
                favoriteIds: new Set(['book-1']),
                progressByBookId: new Map([['book-1', 1]]),
                now: 999,
            },
        )

        expect(result.shelfLabel).toBe(BOOK_SHELF_LABEL.READING)
        expect(result.shelfLabelUpdatedAt).toBe(200)
        expect(result.metadataUpdatedAt).toBe(100)
    })

    it('缺标签时按收藏/进度推断，并幂等保留已有时间戳', () => {
        const first = applyShelfLabelMigrationToBook(
            { id: 'book-2', addedAt: 50 },
            {
                favoriteIds: new Set(),
                progressByBookId: new Map([['book-2', 0.4]]),
                now: 777,
            },
        )
        expect(first.shelfLabel).toBe(BOOK_SHELF_LABEL.READING)
        expect(first.shelfLabelUpdatedAt).toBe(777)
        expect(first.metadataUpdatedAt).toBe(50)

        const second = applyShelfLabelMigrationToBook(
            {
                id: 'book-2',
                shelfLabel: first.shelfLabel,
                shelfLabelUpdatedAt: first.shelfLabelUpdatedAt,
                metadataUpdatedAt: first.metadataUpdatedAt,
                addedAt: 50,
            },
            {
                favoriteIds: new Set(['book-2']),
                progressByBookId: new Map([['book-2', 1]]),
                now: 888,
            },
        )
        expect(second.shelfLabel).toBe(BOOK_SHELF_LABEL.READING)
        expect(second.shelfLabelUpdatedAt).toBe(first.shelfLabelUpdatedAt)
        expect(second.metadataUpdatedAt).toBe(first.metadataUpdatedAt)
    })
})
