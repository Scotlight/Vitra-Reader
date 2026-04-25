import {
    db,
    type BookMeta,
    type BookFile,
    type ReadingProgress,
    type Bookmark,
    type Highlight,
    type ReadingStatsDaily,
} from '../services/storageService'
import { loadReadingStatsRowsForSync } from '../services/readingStatsService'
import type { SyncMode } from './useSyncStore'

const SENSITIVE_SETTINGS_KEYS = new Set([
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

function validateSyncArray<T>(arr: unknown, requiredKey: string): T[] | undefined {
    if (!Array.isArray(arr)) return undefined
    return arr.filter(
        (item) => item != null && typeof item === 'object' && requiredKey in item,
    ) as T[]
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

    if (clearFirst) {
        if (applyData) {
            await Promise.all([
                db.books.clear(),
                db.progress.clear(),
                db.readingStatsDaily.clear(),
                db.bookmarks.clear(),
                db.highlights.clear(),
            ])
        }
        if (applyFiles) {
            await db.bookFiles.clear()
        }
    }

    const books = validateSyncArray<{ id: string }>(payload.books, 'id')
    const progress = validateSyncArray<{ bookId: string }>(payload.progress, 'bookId')
    const readingStatsDaily = validateSyncArray<{ id: string }>(payload.readingStatsDaily, 'id')
    const bookmarks = validateSyncArray<{ id: string }>(payload.bookmarks, 'id')
    const highlights = validateSyncArray<{ id: string }>(payload.highlights, 'id')
    const settings = validateSyncArray<{ key: string; value: unknown }>(payload.settings, 'key')
    const syncableSettings = settings?.filter((entry) => isSyncableSettingKey(entry.key))
    const bookFiles = validateSyncArray<{ id: string; dataBase64: string }>(payload.bookFiles, 'id')

    if (applyData && books) await db.books.bulkPut(books as BookMeta[])
    if (applyData && progress) await db.progress.bulkPut(progress as ReadingProgress[])
    if (applyData && readingStatsDaily) await db.readingStatsDaily.bulkPut(readingStatsDaily as ReadingStatsDaily[])
    if (applyData && bookmarks) await db.bookmarks.bulkPut(bookmarks as Bookmark[])
    if (applyData && highlights) await db.highlights.bulkPut(highlights as Highlight[])
    if (applyData && syncableSettings && syncableSettings.length > 0) {
        await db.settings.bulkPut(syncableSettings as { key: string; value: unknown }[])
    }
    if (applyFiles && bookFiles) {
        const decodedFiles = bookFiles
            .filter((item) => typeof item.dataBase64 === 'string')
            .map((item) => ({
                id: item.id,
                data: base64ToArrayBuffer(item.dataBase64),
            }))
        await db.bookFiles.bulkPut(decodedFiles as BookFile[])
    }
}
