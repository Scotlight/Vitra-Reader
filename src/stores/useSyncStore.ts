import { create } from 'zustand'
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

export type SyncMode = 'full' | 'data' | 'files'
export type RestoreMode = 'auto' | SyncMode

const BACKUP_FILENAME = 'vitra-reader-backup.json'

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

function normalizeFolderPath(folderPath: string): string {
    const sanitized = folderPath.trim().replace(/^\/+|\/+$/g, '')
    return sanitized || 'VitraReader'
}

function buildBackupUrl(baseUrl: string, folderPath: string): string {
    const root = baseUrl.replace(/\/$/, '')
    const folder = normalizeFolderPath(folderPath)
    return `${root}/${folder}/${BACKUP_FILENAME}`
}

// btoa/atob 用于纯二进制（0-255）ArrayBuffer 编码，不涉及 Unicode 文本，无兼容问题
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

/** 安全解析 JSON，失败返回 null */
function safeJsonParse(data: string): unknown {
    try {
        return JSON.parse(data)
    } catch {
        return null
    }
}

/** 校验同步数组字段：必须是数组且每项含指定 key */
function validateSyncArray<T>(arr: unknown, requiredKey: string): T[] | undefined {
    if (!Array.isArray(arr)) return undefined
    return arr.filter(
        (item) => item != null && typeof item === 'object' && requiredKey in item,
    ) as T[]
}

/** 敏感 settings key — 不应通过 WebDAV 同步传输 */
const SENSITIVE_SETTINGS_KEYS = new Set([
    'translateConfig',
    'webdavUrl', 'webdavUser', 'webdavPass', 'webdavPath',
    'webdavRemoteEtag', 'webdavSyncMode', 'webdavRestoreMode', 'webdavReplaceBeforeRestore',
    'lastSyncTime',
])

type WebdavAction = 'test' | 'upload' | 'download' | 'head'

interface WebdavPayload {
    url: string
    username: string
    password: string
    data?: string
    ifMatch?: string
    ifNoneMatch?: string
}

interface WebdavResult {
    success: boolean
    data?: string
    error?: string
    statusCode?: number
    etag?: string
    lastModified?: string
    exists?: boolean
}

function normalizeEtag(value: string | null | undefined): string | null {
    if (!value) return null
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
}

async function webdavSyncWithRetry(
    action: WebdavAction,
    payload: WebdavPayload,
    retries = 2
): Promise<WebdavResult> {
    let lastError: string | null = null
    for (let attempt = 0; attempt <= retries; attempt += 1) {
        const result = await window.electronAPI.webdavSync(action, payload)
        if (result.success) return result
        lastError = result.error || `WebDAV ${action} failed`
        if (attempt < retries) {
            const backoffMs = 500 * (attempt + 1)
            await new Promise((resolve) => setTimeout(resolve, backoffMs))
        }
    }
    return { success: false, error: lastError || `WebDAV ${action} failed` }
}

// ── 内部辅助函数（消除 autoSync / syncData / restoreData 间的重复逻辑）──

interface SyncPayloadShape {
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

/** 构建上传 payload — 根据 syncMode 从 DB 读取数据 */
async function buildUploadPayload(syncMode: SyncMode, timestamp: number): Promise<Record<string, unknown>> {
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
            db.settings.toArray(),
        ])
        payload.books = books
        payload.progress = progress
        payload.readingStatsDaily = readingStatsDaily
        payload.bookmarks = bookmarks
        payload.highlights = highlights
        payload.settings = settings.filter((s: { key: string }) => !SENSITIVE_SETTINGS_KEYS.has(s.key))
    }

    if (syncMode === 'files' || syncMode === 'full') {
        const [books, bookFiles] = await Promise.all([
            db.books.toArray(),
            db.bookFiles.toArray(),
        ])
        payload.books = payload.books || books
        payload.bookFiles = bookFiles.map((item) => ({
            id: item.id,
            dataBase64: arrayBufferToBase64(item.data),
        }))
    }

    return payload
}

/** ETag 冲突检测 + 上传 — 返回上传结果（成功/冲突/错误） */
async function checkEtagAndUpload(
    backupUrl: string,
    webdavUser: string,
    webdavPass: string,
    data: string,
    remoteEtag: string | null,
): Promise<{ success: boolean; etag: string | null; conflicted: boolean; error?: string }> {
    let ifMatch: string | undefined
    let ifNoneMatch: string | undefined
    let headEtag: string | null = null

    const headRes = await webdavSyncWithRetry('head', {
        url: backupUrl, username: webdavUser, password: webdavPass,
    }, 1)

    if (headRes.success) {
        if (headRes.exists === false || headRes.statusCode === 404) {
            ifNoneMatch = '*'
        } else {
            headEtag = normalizeEtag(headRes.etag)
            if (headEtag) {
                ifMatch = headEtag
                if (remoteEtag && remoteEtag !== headEtag) {
                    return { success: false, etag: null, conflicted: true }
                }
            }
        }
    }

    const uploadRes = await webdavSyncWithRetry('upload', {
        url: backupUrl, username: webdavUser, password: webdavPass,
        data, ifMatch, ifNoneMatch,
    })

    if (!uploadRes.success) {
        return {
            success: false,
            etag: null,
            conflicted: uploadRes.statusCode === 412,
            error: uploadRes.error,
        }
    }

    const nextEtag = normalizeEtag(uploadRes.etag) || headEtag || remoteEtag
    return { success: true, etag: nextEtag, conflicted: false }
}

/** 解析并应用下载的备份数据到本地 DB */
async function applyDownloadedPayload(
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
    const bookFiles = validateSyncArray<{ id: string; dataBase64: string }>(payload.bookFiles, 'id')

    if (applyData && books) await db.books.bulkPut(books as BookMeta[])
    if (applyData && progress) await db.progress.bulkPut(progress as ReadingProgress[])
    if (applyData && readingStatsDaily) await db.readingStatsDaily.bulkPut(readingStatsDaily as ReadingStatsDaily[])
    if (applyData && bookmarks) await db.bookmarks.bulkPut(bookmarks as Bookmark[])
    if (applyData && highlights) await db.highlights.bulkPut(highlights as Highlight[])
    if (applyData && settings) await db.settings.bulkPut(settings as { key: string; value: unknown }[])
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

interface SyncState {
    webdavUrl: string
    webdavPath: string
    webdavUser: string
    webdavPass: string
    syncMode: SyncMode
    restoreMode: RestoreMode
    replaceBeforeRestore: boolean
    lastSyncTime: number | null
    remoteEtag: string | null
    isSyncing: boolean
    isRestoring: boolean
    isTesting: boolean
    syncStatus: string
    setConfig: (config: Partial<SyncState>) => void
    loadConfig: () => Promise<void>
    testConnection: () => Promise<void>
    syncData: () => Promise<void>
    restoreData: () => Promise<void>
    autoSync: (reason: 'startup' | 'interval' | 'exit') => Promise<void>
}

export const useSyncStore = create<SyncState>((set, get) => ({
    webdavUrl: '',
    webdavPath: 'VitraReader',
    webdavUser: '',
    webdavPass: '',
    syncMode: 'data',
    restoreMode: 'auto',
    replaceBeforeRestore: true,
    lastSyncTime: null,
    remoteEtag: null,
    isSyncing: false,
    isRestoring: false,
    isTesting: false,
    syncStatus: '',

    autoSync: async (reason) => {
        const { webdavUrl, webdavUser, webdavPass, webdavPath, isSyncing, isRestoring, syncMode, remoteEtag } = get()
        if (!webdavUrl || !webdavUser || !webdavPass) return
        if (isSyncing || isRestoring) return

        const backupUrl = buildBackupUrl(webdavUrl, webdavPath)

        try {
            if (reason === 'startup') {
                const downloadRes = await webdavSyncWithRetry('download', {
                    url: backupUrl,
                    username: webdavUser,
                    password: webdavPass,
                })
                if (!downloadRes.success || !downloadRes.data) return

                const raw = safeJsonParse(downloadRes.data)
                if (!raw || typeof raw !== 'object') return
                const payload = raw as SyncPayloadShape

                const localLast = get().lastSyncTime || 0
                const remoteLast = payload.timestamp || 0
                if (remoteLast <= localLast) return

                const resolvedMode: SyncMode = payload.mode || 'data'
                await applyDownloadedPayload(payload, resolvedMode, false)

                const downloadedEtag = normalizeEtag(downloadRes.etag)
                if (downloadedEtag) {
                    await db.settings.put({ key: 'webdavRemoteEtag', value: downloadedEtag })
                }

                set({
                    syncMode: resolvedMode,
                    lastSyncTime: remoteLast,
                    remoteEtag: downloadedEtag,
                    syncStatus: '已自动拉取最新云端数据',
                })
                await db.settings.put({ key: 'lastSyncTime', value: remoteLast })
                return
            }

            // interval / exit: upload local to cloud
            const now = Date.now()
            const payload = await buildUploadPayload(syncMode, now)
            const result = await checkEtagAndUpload(backupUrl, webdavUser, webdavPass, JSON.stringify(payload), remoteEtag)

            if (!result.success) {
                if (result.conflicted) {
                    set({ syncStatus: '检测到云端更新，自动同步已跳过（避免覆盖）' })
                }
                return
            }

            if (result.etag) {
                await db.settings.put({ key: 'webdavRemoteEtag', value: result.etag })
            }

            set({
                lastSyncTime: now,
                remoteEtag: result.etag,
                syncStatus: reason === 'interval' ? '自动同步完成' : '退出前同步完成',
            })
            await db.settings.put({ key: 'lastSyncTime', value: now })
        } catch (error) {
            console.error('Auto sync failed:', error)
        }
    },

    setConfig: async (config) => {
        set(config)
        // Persist to DB settings
        if (config.webdavUrl !== undefined) await db.settings.put({ key: 'webdavUrl', value: config.webdavUrl })
        if (config.webdavPath !== undefined) await db.settings.put({ key: 'webdavPath', value: config.webdavPath })
        if (config.webdavUser !== undefined) await db.settings.put({ key: 'webdavUser', value: config.webdavUser })
        if (config.webdavPass !== undefined) await db.settings.delete('webdavPass')
        if (config.syncMode !== undefined) await db.settings.put({ key: 'webdavSyncMode', value: config.syncMode })
        if (config.restoreMode !== undefined) await db.settings.put({ key: 'webdavRestoreMode', value: config.restoreMode })
        if (config.replaceBeforeRestore !== undefined) await db.settings.put({ key: 'webdavReplaceBeforeRestore', value: config.replaceBeforeRestore })
    },

    loadConfig: async () => {
        const url = await db.settings.get('webdavUrl')
        const remotePath = await db.settings.get('webdavPath')
        const user = await db.settings.get('webdavUser')
        const syncMode = await db.settings.get('webdavSyncMode')
        const restoreMode = await db.settings.get('webdavRestoreMode')
        const replaceBeforeRestore = await db.settings.get('webdavReplaceBeforeRestore')
        const time = await db.settings.get('lastSyncTime')
        const remoteEtag = await db.settings.get('webdavRemoteEtag')

        // Password is session-only for security; remove legacy persisted value if present.
        await db.settings.delete('webdavPass')

        set({
            webdavUrl: (url?.value as string) || '',
            webdavPath: normalizeFolderPath((remotePath?.value as string) || 'VitraReader'),
            webdavUser: (user?.value as string) || '',
            webdavPass: '',
            syncMode: ((syncMode?.value as SyncMode) || 'data'),
            restoreMode: ((restoreMode?.value as RestoreMode) || 'auto'),
            replaceBeforeRestore: (replaceBeforeRestore?.value as boolean) ?? true,
            lastSyncTime: (time?.value as number) || null,
            remoteEtag: normalizeEtag(remoteEtag?.value as string | null | undefined)
        })
    },

    testConnection: async () => {
        const { webdavUrl, webdavUser, webdavPass, webdavPath } = get()
        if (!webdavUrl || !webdavUser || !webdavPass) {
            set({ syncStatus: '请先填写服务器地址、用户名、密码' })
            return
        }

        set({ isTesting: true, syncStatus: '测试连接中...' })
        try {
            const targetUrl = `${webdavUrl.replace(/\/$/, '')}/${normalizeFolderPath(webdavPath)}`
            const testRes = await webdavSyncWithRetry('test', {
                url: targetUrl,
                username: webdavUser,
                password: webdavPass,
            })

            if (!testRes.success) throw new Error(testRes.error || '连接失败')
            set({ syncStatus: '连接成功，可进行绑定和同步' })
        } catch (error: unknown) {
            set({ syncStatus: `连接失败: ${error instanceof Error ? error.message : String(error)}` })
        } finally {
            set({ isTesting: false })
        }
    },

    syncData: async () => {
        const { webdavUrl, webdavPath, webdavUser, webdavPass, syncMode, remoteEtag } = get()
        if (!webdavUrl || !webdavUser || !webdavPass) {
            set({ syncStatus: 'Missing configuration' })
            return
        }

        set({ isSyncing: true, syncStatus: 'Preparing...' })

        try {
            const now = Date.now()
            const backupUrl = buildBackupUrl(webdavUrl, webdavPath)
            const payload = await buildUploadPayload(syncMode, now)

            set({ syncStatus: `Uploading (${syncMode})...` })
            const result = await checkEtagAndUpload(backupUrl, webdavUser, webdavPass, JSON.stringify(payload), remoteEtag)

            if (!result.success) {
                if (result.conflicted) {
                    throw new Error('同步冲突：云端文件已被更新，请先恢复后再同步')
                }
                throw new Error(result.error)
            }

            if (result.etag) {
                await db.settings.put({ key: 'webdavRemoteEtag', value: result.etag })
            }

            set({ syncStatus: 'Sync Complete', lastSyncTime: now, remoteEtag: result.etag })
            await db.settings.put({ key: 'lastSyncTime', value: now })

        } catch (e: unknown) {
            console.error('Sync failed:', e)
            set({ syncStatus: `Error: ${e instanceof Error ? e.message : String(e)}` })
        } finally {
            set({ isSyncing: false })
            setTimeout(() => set({ syncStatus: '' }), 3000)
        }
    },

    restoreData: async () => {
        const { webdavUrl, webdavPath, webdavUser, webdavPass, restoreMode, replaceBeforeRestore } = get()
        if (!webdavUrl || !webdavUser || !webdavPass) {
            set({ syncStatus: '请先填写服务器地址、用户名、密码' })
            return
        }

        set({ isRestoring: true, syncStatus: '下载备份中...' })
        try {
            const downloadRes = await webdavSyncWithRetry('download', {
                url: buildBackupUrl(webdavUrl, webdavPath),
                username: webdavUser,
                password: webdavPass,
            })
            if (!downloadRes.success || !downloadRes.data) throw new Error(downloadRes.error || '备份文件不存在或不可读')

            const downloadedEtag = normalizeEtag(downloadRes.etag)
            if (downloadedEtag) {
                await db.settings.put({ key: 'webdavRemoteEtag', value: downloadedEtag })
            }

            const raw = safeJsonParse(downloadRes.data)
            if (!raw || typeof raw !== 'object') throw new Error('备份数据格式无效')
            const payload = raw as SyncPayloadShape

            const resolvedMode: SyncMode = restoreMode === 'auto' ? (payload.mode || 'data') : restoreMode
            await applyDownloadedPayload(payload, resolvedMode, replaceBeforeRestore)

            await db.settings.put({ key: 'webdavSyncMode', value: resolvedMode })
            set({ syncMode: resolvedMode, remoteEtag: downloadedEtag, syncStatus: `恢复完成（${resolvedMode}）` })
        } catch (error: unknown) {
            console.error('Restore failed:', error)
            set({ syncStatus: `恢复失败: ${error instanceof Error ? error.message : String(error)}` })
        } finally {
            set({ isRestoring: false })
        }
    },
}))
