import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SyncPayloadShape } from '@/stores/syncStorePayload'

const storageMocks = vi.hoisted(() => {
    const createTable = () => ({
        clear: vi.fn(),
        bulkPut: vi.fn(),
        toArray: vi.fn(),
        toCollection: vi.fn(),
    })

    return {
        books: createTable(),
        bookFiles: createTable(),
        progress: createTable(),
        readingStatsDaily: createTable(),
        bookmarks: createTable(),
        highlights: createTable(),
        settings: {
            ...createTable(),
            bulkGet: vi.fn(),
        },
        transaction: vi.fn(),
    }
})

vi.mock('@/services/storageService', () => ({
    db: storageMocks,
}))

vi.mock('@/services/readingStatsService', () => ({
    loadReadingStatsRowsForSync: vi.fn(),
}))

import { applyDownloadedPayload } from '@/stores/syncStorePayload'

function resetTableMocks(table: {
    clear: ReturnType<typeof vi.fn>
    bulkPut: ReturnType<typeof vi.fn>
    toArray: ReturnType<typeof vi.fn>
    toCollection: ReturnType<typeof vi.fn>
}): void {
    table.clear.mockReset().mockResolvedValue(undefined)
    table.bulkPut.mockReset().mockResolvedValue(undefined)
    table.toArray.mockReset().mockResolvedValue([])
    table.toCollection.mockReset()
}

function validPayload(): SyncPayloadShape {
    return {
        mode: 'full',
        books: [{
            id: 'book-1',
            title: 'Book',
            author: 'Author',
            fileSize: 128,
            addedAt: 1,
        }],
        progress: [{
            bookId: 'book-1',
            location: 'cfi',
            percentage: 0.5,
            currentChapter: 'Chapter 1',
            updatedAt: 2,
        }],
        readingStatsDaily: [{
            id: '2026-06-06::book-1',
            dateKey: '2026-06-06',
            bookId: 'book-1',
            activeMs: 3000,
            updatedAt: 3,
        }],
        bookmarks: [{
            id: 'bookmark-1',
            bookId: 'book-1',
            location: 'cfi',
            title: 'Quote',
            note: 'Note',
            createdAt: 4,
        }],
        highlights: [{
            id: 'highlight-1',
            bookId: 'book-1',
            cfiRange: 'range',
            color: '#ffee00',
            text: 'Text',
            createdAt: 5,
        }],
        settings: [
            { key: 'reader:theme', value: 'dark' },
            { key: 'sync:webdavUser', value: 'secret-user' },
            { key: 'readerFonts:data:v1:legacy-font', value: { data: 'legacy-font-data' } },
        ],
        bookFiles: [{
            id: 'book-1',
            dataBase64: btoa('file-data'),
        }],
    }
}

describe('syncStorePayload restore', () => {
    beforeEach(() => {
        resetTableMocks(storageMocks.books)
        resetTableMocks(storageMocks.bookFiles)
        resetTableMocks(storageMocks.progress)
        resetTableMocks(storageMocks.readingStatsDaily)
        resetTableMocks(storageMocks.bookmarks)
        resetTableMocks(storageMocks.highlights)
        resetTableMocks(storageMocks.settings)
        storageMocks.settings.bulkGet.mockReset().mockResolvedValue([])
        storageMocks.transaction.mockReset().mockImplementation(async (...args: unknown[]) => {
            const callback = args[args.length - 1]
            if (typeof callback !== 'function') throw new Error('missing transaction callback')
            await callback()
        })
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('损坏 payload 在 clearFirst=true 时不会清库', async () => {
        const payload = validPayload()
        payload.books = [{
            id: 'book-1',
            author: 'Author',
            fileSize: 128,
            addedAt: 1,
        }]

        await expect(applyDownloadedPayload(payload, 'full', true))
            .rejects.toThrow('备份数据 books[0] 字段无效')

        expect(storageMocks.transaction).not.toHaveBeenCalled()
        expect(storageMocks.books.clear).not.toHaveBeenCalled()
        expect(storageMocks.bookFiles.clear).not.toHaveBeenCalled()
        expect(storageMocks.books.bulkPut).not.toHaveBeenCalled()
    })

    it('合法 payload 在事务中先清库再写入校验后的数据', async () => {
        const payload = validPayload()

        await applyDownloadedPayload(payload, 'full', true)

        expect(storageMocks.transaction).toHaveBeenCalledTimes(1)
        expect(storageMocks.books.clear).toHaveBeenCalledTimes(1)
        expect(storageMocks.progress.clear).toHaveBeenCalledTimes(1)
        expect(storageMocks.readingStatsDaily.clear).toHaveBeenCalledTimes(1)
        expect(storageMocks.bookmarks.clear).toHaveBeenCalledTimes(1)
        expect(storageMocks.highlights.clear).toHaveBeenCalledTimes(1)
        expect(storageMocks.bookFiles.clear).toHaveBeenCalledTimes(1)
        expect(storageMocks.books.bulkPut).toHaveBeenCalledWith(payload.books)
        expect(storageMocks.settings.bulkPut).toHaveBeenCalledWith([
            { key: 'reader:theme', value: 'dark' },
        ])
        expect(storageMocks.bookFiles.bulkPut).toHaveBeenCalledWith([
            { id: 'book-1', data: expect.any(ArrayBuffer) },
        ])
    })

    it('事务中写入失败时向调用方抛出错误', async () => {
        const error = new Error('bulk put failed')
        storageMocks.bookmarks.bulkPut.mockRejectedValueOnce(error)

        await expect(applyDownloadedPayload(validPayload(), 'full', true)).rejects.toThrow(error)

        expect(storageMocks.transaction).toHaveBeenCalledTimes(1)
        expect(storageMocks.bookmarks.bulkPut).toHaveBeenCalledTimes(1)
    })
})
