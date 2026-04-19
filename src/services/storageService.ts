import Dexie, { type Table } from 'dexie'
import type { BookFormat } from '../engine/core/contentProvider'

// Dexie schema 版本约定：当前最高版本 6；下次修改 schema 必须从 7 开始，并同步更新本注释中的最高版本号。

// ─── Data Models ────────────────────────────────────────────

export interface BookMeta {
    id: string
    title: string
    author: string
    description?: string
    cover?: string            // Base64 cover image
    originalTitle?: string
    originalAuthor?: string
    originalDescription?: string
    originalCover?: string
    publisher?: string
    language?: string
    format?: BookFormat
    fileSize: number
    addedAt: number
    lastReadAt?: number
}

export interface BookFile {
    id: string
    data: ArrayBuffer
}

export interface ReadingProgress {
    bookId: string
    location: string          // epub.js CFI string
    percentage: number
    currentChapter: string
    updatedAt: number
}

export interface Bookmark {
    id: string
    bookId: string
    location: string
    title: string       // 选中的文本（引用内容）
    note: string        // 用户写的笔记
    createdAt: number
}

export interface Highlight {
    id: string
    bookId: string
    cfiRange: string
    color: string
    text: string
    createdAt: number
}

export interface TranslationCacheEntry {
    key: string
    provider: string
    sourceLang: string
    targetLang: string
    sourceText: string
    translatedText: string
    createdAt: number
    lastAccessAt: number
    expiresAt: number
}

export interface ReadingStatsDaily {
    id: string               // `${dateKey}::${bookId}`
    dateKey: string          // YYYY-MM-DD（本地日期）
    bookId: string
    activeMs: number
    updatedAt: number
}

// ─── Database ───────────────────────────────────────────────

class ReaderDatabase extends Dexie {
    books!: Table<BookMeta>
    bookFiles!: Table<BookFile>
    progress!: Table<ReadingProgress>
    bookmarks!: Table<Bookmark>
    highlights!: Table<Highlight>
    translationCache!: Table<TranslationCacheEntry>
    readingStatsDaily!: Table<ReadingStatsDaily>
    settings!: Table<{ key: string; value: unknown }>

    constructor() {
        super('EPubReaderDB')
        this.version(2).stores({
            books: 'id, title, author, addedAt, lastReadAt',
            bookFiles: 'id',
            progress: 'bookId',
            bookmarks: 'id, bookId, createdAt',
            highlights: 'id, bookId, cfiRange, createdAt',
            settings: 'key',
        })
        this.version(3).stores({
            books: 'id, title, author, addedAt, lastReadAt',
            bookFiles: 'id',
            progress: 'bookId',
            bookmarks: 'id, bookId, createdAt',
            highlights: 'id, bookId, cfiRange, createdAt',
            settings: 'key',
        }).upgrade(tx => {
            return tx.table('books').toCollection().modify(book => {
                if (!book.format) book.format = 'epub'
            })
        })
        this.version(4).stores({
            books: 'id, title, author, addedAt, lastReadAt',
            bookFiles: 'id',
            progress: 'bookId',
            bookmarks: 'id, bookId, createdAt',
            highlights: 'id, bookId, cfiRange, createdAt',
            translationCache: 'key, provider, createdAt, lastAccessAt, expiresAt',
            settings: 'key',
        })
        this.version(5).stores({
            books: 'id, title, author, addedAt, lastReadAt',
            bookFiles: 'id',
            progress: 'bookId',
            bookmarks: 'id, bookId, createdAt',
            highlights: 'id, bookId, cfiRange, createdAt',
            translationCache: 'key, provider, createdAt, lastAccessAt, expiresAt',
            settings: 'key',
        }).upgrade(tx => {
            return tx.table('books').toCollection().modify((book: Record<string, unknown>) => {
                if (!book.originalTitle) book.originalTitle = book.title || ''
                if (!book.originalAuthor) book.originalAuthor = book.author || '未知作者'
                if (book.originalDescription === undefined) book.originalDescription = book.description || ''
                if (book.originalCover === undefined) book.originalCover = book.cover || ''
            })
        })
        this.version(6).stores({
            books: 'id, title, author, addedAt, lastReadAt',
            bookFiles: 'id',
            progress: 'bookId',
            bookmarks: 'id, bookId, createdAt',
            highlights: 'id, bookId, cfiRange, createdAt',
            translationCache: 'key, provider, createdAt, lastAccessAt, expiresAt',
            readingStatsDaily: 'id, dateKey, bookId, updatedAt',
            settings: 'key',
        })
    }
}

export const db = new ReaderDatabase()

/** 按需获取单本书封面，不触发全量加载 */
export async function getBookCover(bookId: string): Promise<string | undefined> {
    const book = await db.books.get(bookId)
    return book?.cover || undefined
}
