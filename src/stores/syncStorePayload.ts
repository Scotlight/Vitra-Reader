import { db, type BookMeta } from '@/services/storageService'
import { loadReadingStatsRowsForSync } from '@/services/readingStatsService'
import type { SyncMode } from './useSyncStore'
import { arrayBufferToBase64, getArrayLength } from './syncPayloadSerialization'
import { isSyncableSettingKey, stageDownloadedPayload, type SettingRow } from './syncPayloadValidation'

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
