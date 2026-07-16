import type {
    BookFile,
    BookMeta,
    Bookmark,
    Highlight,
    ReadingProgress,
    ReadingStatsDaily,
} from '@/services/storageService'
import {
    BOOK_SHELF_LABEL,
    isBookShelfLabel,
    normalizeShelfLabel,
} from '@/services/storageService'
import { base64ToArrayBuffer } from './syncPayloadSerialization'
import type { SyncPayloadShape } from './syncStorePayload'

const SENSITIVE_SETTINGS_KEYS = new Set([
    'translate:config',
    'translateConfig',
    'sync:webdavUrl', 'sync:webdavUser', 'sync:webdavPath',
    'sync:remoteEtag', 'sync:syncMode', 'sync:restoreMode', 'sync:replaceBeforeRestore',
    'sync:lastSyncTime',
    'webdavUrl', 'webdavUser', 'webdavPass', 'webdavPath',
    'webdavRemoteEtag', 'webdavSyncMode', 'webdavRestoreMode', 'webdavReplaceBeforeRestore',
    'lastSyncTime',
])
const UNSYNCABLE_SETTINGS_KEY_PREFIXES = ['vcache-', 'tcache:', 'readerFonts:']

export type SettingRow = { key: string; value: unknown }
type SerializedBookFile = { id: string; dataBase64: string }

export interface DownloadedPayloadStaging {
    books?: BookMeta[]
    progress?: ReadingProgress[]
    readingStatsDaily?: ReadingStatsDaily[]
    bookmarks?: Bookmark[]
    highlights?: Highlight[]
    settings?: SettingRow[]
    bookFiles?: BookFile[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return value != null && typeof value === 'object'
}

function hasString(record: Record<string, unknown>, key: string): boolean {
    return typeof record[key] === 'string'
}

function hasNumber(record: Record<string, unknown>, key: string): boolean {
    return typeof record[key] === 'number' && Number.isFinite(record[key])
}

function validateSyncArray<T>(
    value: unknown,
    label: string,
    validateItem: (item: unknown) => item is T,
    required: boolean,
): T[] | undefined {
    if (value === undefined) {
        if (required) throw new Error(`备份数据缺少 ${label}`)
        return undefined
    }
    if (!Array.isArray(value)) throw new Error(`备份数据 ${label} 必须是数组`)

    const invalidIndex = value.findIndex((item) => !validateItem(item))
    if (invalidIndex >= 0) throw new Error(`备份数据 ${label}[${invalidIndex}] 字段无效`)
    return value
}

function isBookMeta(value: unknown): value is BookMeta {
    if (!isRecord(value)) return false
    // 旧备份可能没有 shelfLabel 字段：基础字段通过后在 normalize 阶段补默认值。
    if (!(hasString(value, 'id')
        && hasString(value, 'title')
        && hasString(value, 'author')
        && hasNumber(value, 'fileSize')
        && hasNumber(value, 'addedAt'))) {
        return false
    }
    if (value.shelfLabel !== undefined && !isBookShelfLabel(value.shelfLabel)) return false
    if (value.shelfLabelUpdatedAt !== undefined && !hasNumber(value, 'shelfLabelUpdatedAt')) return false
    if (value.metadataUpdatedAt !== undefined && !hasNumber(value, 'metadataUpdatedAt')) return false
    return true
}

/** 旧 WebDAV 包缺标签字段时补齐，保证 bulkPut 不写入半残 BookMeta。 */
function normalizeBookMeta(book: BookMeta): BookMeta {
    const addedAt = Number.isFinite(book.addedAt) ? book.addedAt : Date.now()
    return {
        ...book,
        shelfLabel: normalizeShelfLabel(book.shelfLabel, BOOK_SHELF_LABEL.TO_READ),
        shelfLabelUpdatedAt: Number.isFinite(book.shelfLabelUpdatedAt)
            ? book.shelfLabelUpdatedAt
            : (Number.isFinite(book.lastReadAt) ? Number(book.lastReadAt) : addedAt),
        metadataUpdatedAt: Number.isFinite(book.metadataUpdatedAt)
            ? book.metadataUpdatedAt
            : addedAt,
    }
}

function isReadingProgress(value: unknown): value is ReadingProgress {
    if (!isRecord(value)) return false
    return hasString(value, 'bookId')
        && hasString(value, 'location')
        && hasString(value, 'currentChapter')
        && hasNumber(value, 'percentage')
        && hasNumber(value, 'updatedAt')
}

function isReadingStatsDaily(value: unknown): value is ReadingStatsDaily {
    if (!isRecord(value)) return false
    return hasString(value, 'id')
        && hasString(value, 'dateKey')
        && hasString(value, 'bookId')
        && hasNumber(value, 'activeMs')
        && hasNumber(value, 'updatedAt')
}

function isBookmark(value: unknown): value is Bookmark {
    if (!isRecord(value)) return false
    return hasString(value, 'id')
        && hasString(value, 'bookId')
        && hasString(value, 'location')
        && hasString(value, 'title')
        && hasString(value, 'note')
        && hasNumber(value, 'createdAt')
}

function isHighlight(value: unknown): value is Highlight {
    if (!isRecord(value)) return false
    return hasString(value, 'id')
        && hasString(value, 'bookId')
        && hasString(value, 'cfiRange')
        && hasString(value, 'color')
        && hasString(value, 'text')
        && hasNumber(value, 'createdAt')
}

function isSettingRow(value: unknown): value is SettingRow {
    return isRecord(value) && typeof value.key === 'string'
}

function isSerializedBookFile(value: unknown): value is SerializedBookFile {
    return isRecord(value) && hasString(value, 'id') && hasString(value, 'dataBase64')
}

export function isSyncableSettingKey(key: unknown): key is string {
    if (typeof key !== 'string') return false
    if (SENSITIVE_SETTINGS_KEYS.has(key)) return false
    return !UNSYNCABLE_SETTINGS_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))
}

export function stageDownloadedPayload(
    payload: SyncPayloadShape,
    applyData: boolean,
    applyFiles: boolean,
    clearFirst: boolean,
): DownloadedPayloadStaging {
    const staging: DownloadedPayloadStaging = {}

    if (applyData) {
        const books = validateSyncArray(payload.books, 'books', isBookMeta, clearFirst)
        staging.books = books?.map(normalizeBookMeta)
        staging.progress = validateSyncArray(payload.progress, 'progress', isReadingProgress, clearFirst)
        staging.readingStatsDaily = validateSyncArray(
            payload.readingStatsDaily,
            'readingStatsDaily',
            isReadingStatsDaily,
            clearFirst,
        )
        staging.bookmarks = validateSyncArray(payload.bookmarks, 'bookmarks', isBookmark, clearFirst)
        staging.highlights = validateSyncArray(payload.highlights, 'highlights', isHighlight, clearFirst)
        const settings = validateSyncArray(payload.settings, 'settings', isSettingRow, false)
        staging.settings = settings?.filter((entry) => isSyncableSettingKey(entry.key))
    }

    if (applyFiles) {
        const bookFiles = validateSyncArray(payload.bookFiles, 'bookFiles', isSerializedBookFile, clearFirst)
        staging.bookFiles = bookFiles?.map((item) => ({
            id: item.id,
            data: base64ToArrayBuffer(item.dataBase64),
        }))
    }

    return staging
}
