import Dexie, { type Table } from 'dexie'

// ─── Data Models ────────────────────────────────────────────

export interface BookMeta {
    id: string
    title: string
    author: string
    cover?: string            // Base64 cover image
    publisher?: string
    language?: string
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
    title: string
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

// ─── Database ───────────────────────────────────────────────

class ReaderDatabase extends Dexie {
    books!: Table<BookMeta>
    bookFiles!: Table<BookFile>
    progress!: Table<ReadingProgress>
    bookmarks!: Table<Bookmark>
    highlights!: Table<Highlight>
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
    }
}

export const db = new ReaderDatabase()
