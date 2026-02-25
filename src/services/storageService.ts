import Dexie, { type Table } from 'dexie'
import type { BookFormat } from './contentProvider'

// ─── Data Models ────────────────────────────────────────────

export interface BookMeta {
    id: string
    title: string
    author: string
    description?: string
    cover?: string            // Base64 cover image
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

// ─── Database ───────────────────────────────────────────────

class ReaderDatabase extends Dexie {
    books!: Table<BookMeta>
    bookFiles!: Table<BookFile>
    progress!: Table<ReadingProgress>
    bookmarks!: Table<Bookmark>
    highlights!: Table<Highlight>
    translationCache!: Table<TranslationCacheEntry>
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
    }
}

export const db = new ReaderDatabase()
