import {
    db,
    type BookMeta,
    type BookFile,
    type ReadingProgress,
    type Bookmark,
    type Highlight,
    type ReadingStatsDaily,
} from '@/services/storageService'
import { loadReadingStatsRowsForSync } from '@/services/readingStatsService'
import type { SyncMode } from './useSyncStore'

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
const UNSYNCABLE_SETTINGS_KEY_PREFIXES = ['vcache-', 'tcache:']

type SettingRow = { key: string; value: unknown }
type SerializedBookFile = { id: string; dataBase64: string }

interface DownloadedPayloadStaging {
    books?: BookMeta[]
    progress?: ReadingProgress[]
    readingStatsDaily?: ReadingStatsDaily[]
    bookmarks?: Bookmark[]
    highlights?: Highlight[]
    settings?: SettingRow[]
    bookFiles?: BookFile[]
}

export interface SyncPayloadShape {
    mode?: SyncMode
    timestamp?: number
    books?: unknown
    progress?: unknown
    readingStatsDaily?: unknown
    bookmarks?: unknown
    highlights?: unknown
    settings?: unknown
    bookFiles?: unknown
}

function arrayBufferToBase64(data: ArrayBuffer): string {
    const bytes = new Uint8Array(data)
    let binary = ''
    const chunkSize = 0x8000
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        const chunk = bytes.subarray(offset, offset + chunkSize)
        binary += String.fromCharCode(...chunk)
    }
    return btoa(binary)
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
    let binary: string
    try {
        binary = atob(base64)
    } catch {
        return new ArrayBuffer(0)
    }
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index)
    }
    return bytes.buffer
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
    return hasString(value, 'id')
        && hasString(value, 'title')
        && hasString(value, 'author')
        && hasNumber(value, 'fileSize')
        && hasNumber(value, 'addedAt')
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

function isSyncableSettingKey(key: unknown): key is string {
    if (typeof key !== 'string') return false
    if (SENSITIVE_SETTINGS_KEYS.has(key)) return false
    return !UNSYNCABLE_SETTINGS_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))
}

async function loadSyncableSettingsRows(): Promise<SettingRow[]> {
    const allKeys = await db.settings.toCollection().primaryKeys()
    const syncableKeys = allKeys.filter(isSyncableSettingKey)
    if (syncableKeys.length === 0) return []
    const rows = await db.settings.bulkGet(syncableKeys)
    return rows.filter((row): row is SettingRow => {
        return Boolean(row && typeof row.key === 'string' && isSyncableSettingKey(row.key))
    })
}

async function collectSerializedBookFiles(): Promise<SerializedBookFile[]> {
    const serialized: SerializedBookFile[] = []
    await db.bookFiles.toCollection().each((item) => {
        serialized.push({
            id: item.id,
            dataBase64: arrayBufferToBase64(item.data),
        })
    })
    return serialized
}

function getArrayLength(value: unknown): number {
    return Array.isArray(value) ? value.length : 0
}

function stageDownloadedPayload(
    payload: SyncPayloadShape,
    applyData: boolean,
    applyFiles: boolean,
    clearFirst: boolean,
): DownloadedPayloadStaging {
    const staging: DownloadedPayloadStaging = {}

    if (applyData) {
        staging.books = validateSyncArray(payload.books, 'books', isBookMeta, clearFirst)
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

export function logSyncPayloadStats(scope: 'auto' | 'manual', payload: Record<string, unknown>, payloadJson: string): void {
    const payloadSizeBytes = new Blob([payloadJson]).size
    console.info(
        `[SyncPayload:${scope}] mode=${String(payload.mode ?? '')} size=${payloadSizeBytes}B books=${getArrayLength(payload.books)} progress=${getArrayLength(payload.progress)} stats=${getArrayLength(payload.readingStatsDaily)} bookmarks=${getArrayLength(payload.bookmarks)} highlights=${getArrayLength(payload.highlights)} settings=${getArrayLength(payload.settings)} bookFiles=${getArrayLength(payload.bookFiles)}`,
    )
}

export async function buildUploadPayload(syncMode: SyncMode, timestamp: number): Promise<Record<string, unknown>> {
    const payload: Record<string, unknown> = {
        mode: syncMode,
        timestamp,
    }

    if (syncMode === 'data' || syncMode === 'full') {
        const [books, progress, readingStatsDaily, bookmarks, highlights, settings] = await Promise.all([
            db.books.toArray(),
            db.progress.toArray(),
            loadReadingStatsRowsForSync(timestamp),
            db.bookmarks.toArray(),
            db.highlights.toArray(),
            loadSyncableSettingsRows(),
        ])
        payload.books = books
        payload.progress = progress
        payload.readingStatsDaily = readingStatsDaily
        payload.bookmarks = bookmarks
        payload.highlights = highlights
        payload.settings = settings
    }

    if (syncMode === 'files' || syncMode === 'full') {
        const [books, serializedFiles] = await Promise.all([
            payload.books ? Promise.resolve(payload.books as BookMeta[]) : db.books.toArray(),
            collectSerializedBookFiles(),
        ])
        if (!payload.books) payload.books = books
        payload.bookFiles = serializedFiles
    }

    return payload
}

export async function applyDownloadedPayload(
    payload: SyncPayloadShape,
    resolvedMode: SyncMode,
    clearFirst: boolean,
): Promise<void> {
    const applyData = resolvedMode === 'data' || resolvedMode === 'full'
    const applyFiles = resolvedMode === 'files' || resolvedMode === 'full'
    const staging = stageDownloadedPayload(payload, applyData, applyFiles, clearFirst)

    await db.transaction(
        'rw',
        [
            db.books,
            db.progress,
            db.readingStatsDaily,
            db.bookmarks,
            db.highlights,
            db.settings,
            db.bookFiles,
        ],
        async () => {
            if (clearFirst && applyData) {
                await Promise.all([
                    db.books.clear(),
                    db.progress.clear(),
                    db.readingStatsDaily.clear(),
                    db.bookmarks.clear(),
                    db.highlights.clear(),
                ])
            }
            if (clearFirst && applyFiles) await db.bookFiles.clear()

            if (applyData && staging.books) await db.books.bulkPut(staging.books)
            if (applyData && staging.progress) await db.progress.bulkPut(staging.progress)
            if (applyData && staging.readingStatsDaily) await db.readingStatsDaily.bulkPut(staging.readingStatsDaily)
            if (applyData && staging.bookmarks) await db.bookmarks.bulkPut(staging.bookmarks)
            if (applyData && staging.highlights) await db.highlights.bulkPut(staging.highlights)
            if (applyData && staging.settings && staging.settings.length > 0) {
                await db.settings.bulkPut(staging.settings)
            }
            if (applyFiles && staging.bookFiles) await db.bookFiles.bulkPut(staging.bookFiles)
        },
    )
}
