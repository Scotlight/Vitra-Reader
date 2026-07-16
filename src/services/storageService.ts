import Dexie, { type Table } from 'dexie'
import type { BookFormat } from '@/engine/core/contentProvider'
import {
    BOOK_SHELF_LABEL,
    LEGACY_FAVORITE_BOOK_IDS_KEY,
    LEGACY_FAVORITE_BOOK_IDS_LEGACY_KEY,
    normalizeShelfLabel,
    resolveMigratedShelfLabel,
    type BookShelfLabel,
} from './bookShelfLabel'

// Dexie schema 版本约定：当前最高版本 8；下次修改 schema 必须从 9 开始，并同步更新本注释中的最高版本号。

const LEGACY_READER_FONT_INDEX_KEY = 'readerFonts:index:v1'
const LEGACY_READER_FONT_DATA_KEY_PREFIX = 'readerFonts:data:v1:'

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
    /** 固定书架标签，互斥单选 */
    shelfLabel: BookShelfLabel
    /** 标签独立合并用时间戳 */
    shelfLabelUpdatedAt: number
    /** 书名/作者/简介/封面等人工编辑时间 */
    metadataUpdatedAt: number
}

export type { BookShelfLabel }
export {
    BOOK_SHELF_LABEL,
    BOOK_SHELF_LABEL_DISPLAY,
    BOOK_SHELF_LABEL_VALUES,
    isBookShelfLabel,
    normalizeShelfLabel,
    resolveMigratedShelfLabel,
    LEGACY_FAVORITE_BOOK_IDS_KEY,
} from './bookShelfLabel'

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

export interface ReaderFontRecord {
    id: string
    displayName: string
    family: string
    category: 'sans' | 'serif' | 'handwriting'
    format: string
    sizeBytes: number
    source: 'catalog' | 'import'
    catalogId?: string
    installedAt: number
    data: ArrayBuffer
}

interface SettingRow {
    key: string
    value: unknown
}

export function extractLegacyReaderFontRecords(rows: readonly SettingRow[]): ReaderFontRecord[] {
    return rows.flatMap((row) => {
        if (!row.key.startsWith(LEGACY_READER_FONT_DATA_KEY_PREFIX)) return []
        const font = row.value as Partial<ReaderFontRecord> | undefined
        if (!font
            || typeof font.id !== 'string'
            || typeof font.displayName !== 'string'
            || typeof font.family !== 'string'
            || !Number.isFinite(font.installedAt)
            || !(font.data instanceof ArrayBuffer)) {
            return []
        }
        return [font as ReaderFontRecord]
    })
}

export interface ShelfLabelMigrationBook {
    id: string
    shelfLabel?: unknown
    shelfLabelUpdatedAt?: unknown
    metadataUpdatedAt?: unknown
    addedAt?: unknown
    lastReadAt?: unknown
}

export interface ShelfLabelMigrationProgress {
    bookId: string
    percentage?: number
}

/**
 * 纯函数：给旧 BookMeta 补齐 shelfLabel 相关字段。
 * 已有合法标签则只补时间戳，不覆盖用户已写值（幂等）。
 */
export function applyShelfLabelMigrationToBook(
    book: ShelfLabelMigrationBook,
    options: {
        favoriteIds: ReadonlySet<string>
        progressByBookId: ReadonlyMap<string, number>
        now: number
    },
): {
    shelfLabel: BookShelfLabel
    shelfLabelUpdatedAt: number
    metadataUpdatedAt: number
} {
    const existingLabel = normalizeShelfLabel(book.shelfLabel, BOOK_SHELF_LABEL.TO_READ)
    const hasExistingLabel = book.shelfLabel !== undefined && book.shelfLabel !== null
    const shelfLabel = hasExistingLabel
        ? existingLabel
        : resolveMigratedShelfLabel({
            isFavorite: options.favoriteIds.has(book.id),
            percentage: options.progressByBookId.get(book.id) ?? 0,
        })

    const shelfLabelUpdatedAt = Number.isFinite(book.shelfLabelUpdatedAt)
        ? Number(book.shelfLabelUpdatedAt)
        : (Number.isFinite(book.lastReadAt) ? Number(book.lastReadAt) : options.now)

    const metadataUpdatedAt = Number.isFinite(book.metadataUpdatedAt)
        ? Number(book.metadataUpdatedAt)
        : (Number.isFinite(book.addedAt) ? Number(book.addedAt) : options.now)

    return { shelfLabel, shelfLabelUpdatedAt, metadataUpdatedAt }
}

function parseFavoriteIds(value: unknown): string[] {
    if (!Array.isArray(value)) return []
    return value.map((item) => String(item)).filter(Boolean)
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
    readerFonts!: Table<ReaderFontRecord, string>
    settings!: Table<{ key: string; value: unknown }, string>

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
        this.version(7).stores({
            books: 'id, title, author, addedAt, lastReadAt',
            bookFiles: 'id',
            progress: 'bookId',
            bookmarks: 'id, bookId, createdAt',
            highlights: 'id, bookId, cfiRange, createdAt',
            translationCache: 'key, provider, createdAt, lastAccessAt, expiresAt',
            readingStatsDaily: 'id, dateKey, bookId, updatedAt',
            readerFonts: 'id, installedAt',
            settings: 'key',
        })
        // v8：固定书架标签 + 元数据时间戳；索引 shelfLabel 供侧栏筛选。
        // 旧收藏键保留只读兼容一个发布周期，不在 upgrade 中删除。
        this.version(8).stores({
            books: 'id, title, author, addedAt, lastReadAt, shelfLabel',
            bookFiles: 'id',
            progress: 'bookId',
            bookmarks: 'id, bookId, createdAt',
            highlights: 'id, bookId, cfiRange, createdAt',
            translationCache: 'key, provider, createdAt, lastAccessAt, expiresAt',
            readingStatsDaily: 'id, dateKey, bookId, updatedAt',
            readerFonts: 'id, installedAt',
            settings: 'key',
        }).upgrade(async (tx) => {
            const settingsTable = tx.table('settings')
            const progressTable = tx.table('progress')
            const booksTable = tx.table('books')

            const [favoriteRow, legacyFavoriteRow, progressRows] = await Promise.all([
                settingsTable.get(LEGACY_FAVORITE_BOOK_IDS_KEY),
                settingsTable.get(LEGACY_FAVORITE_BOOK_IDS_LEGACY_KEY),
                progressTable.toArray(),
            ])

            // 优先读新键，回退旧键；不删旧键，方便一个版本内回滚排查。
            const favoriteIds = new Set(parseFavoriteIds(
                favoriteRow?.value ?? legacyFavoriteRow?.value,
            ))
            const progressByBookId = new Map<string, number>(
                (progressRows as ShelfLabelMigrationProgress[]).map((row) => [
                    row.bookId,
                    typeof row.percentage === 'number' ? row.percentage : 0,
                ]),
            )
            const now = Date.now()

            await booksTable.toCollection().modify((book: ShelfLabelMigrationBook) => {
                const migrated = applyShelfLabelMigrationToBook(book, {
                    favoriteIds,
                    progressByBookId,
                    now,
                })
                book.shelfLabel = migrated.shelfLabel
                book.shelfLabelUpdatedAt = migrated.shelfLabelUpdatedAt
                book.metadataUpdatedAt = migrated.metadataUpdatedAt
            })
        })
    }
}

export const db = new ReaderDatabase()

interface LegacyReaderFontSettingsTable {
    where(index: 'key'): { startsWith(prefix: string): { primaryKeys(): Promise<string[]> } }
    get(key: string): Promise<SettingRow | undefined>
    delete(key: string): Promise<void>
}

interface ReaderFontMigrationTargetTable {
    put(record: ReaderFontRecord): Promise<unknown>
}

export async function runLegacyReaderFontMigration(
    settingsTable: LegacyReaderFontSettingsTable,
    readerFontsTable: ReaderFontMigrationTargetTable,
): Promise<void> {
    const legacyKeys = await settingsTable
        .where('key')
        .startsWith(LEGACY_READER_FONT_DATA_KEY_PREFIX)
        .primaryKeys()
    let migrated = 0
    let discarded = 0

    for (const key of legacyKeys) {
        try {
            const row = await settingsTable.get(key)
            const [font] = row ? extractLegacyReaderFontRecords([row]) : []
            if (!font) {
                await settingsTable.delete(key)
                discarded += 1
                continue
            }
            await readerFontsTable.put(font)
            await settingsTable.delete(key)
            migrated += 1
        } catch (error) {
            console.warn(`[Storage] 迁移旧版阅读器字体 ${key} 失败，保留旧记录待重试`, error)
        }
    }

    if (discarded > 0) console.warn(`[Storage] 已丢弃 ${discarded} 条无效旧版阅读器字体记录`)
    if (migrated > 0) console.info(`[Storage] 已迁移 ${migrated} 条旧版阅读器字体记录`)
    await settingsTable.delete(LEGACY_READER_FONT_INDEX_KEY)
}

let legacyReaderFontMigration: Promise<void> | null = null

export function migrateLegacyReaderFonts(): Promise<void> {
    legacyReaderFontMigration ??= runLegacyReaderFontMigration(db.settings, db.readerFonts).catch((error) => {
        legacyReaderFontMigration = null
        console.warn('[Storage] 旧版阅读器字体迁移失败，稍后重试', error)
    })
    return legacyReaderFontMigration
}

/** 按需获取单本书封面，不触发全量加载 */
export async function getBookCover(bookId: string): Promise<string | undefined> {
    const book = await db.books.get(bookId)
    return book?.cover || undefined
}

/** 更新固定书架标签；时间戳独立推进，便于后续字段级同步合并。 */
export async function updateBookShelfLabel(bookId: string, shelfLabel: BookShelfLabel): Promise<void> {
    const now = Date.now()
    await db.books.update(bookId, {
        shelfLabel: normalizeShelfLabel(shelfLabel),
        shelfLabelUpdatedAt: now,
    })
}
