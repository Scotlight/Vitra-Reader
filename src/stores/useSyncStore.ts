import { create } from 'zustand'
import { db } from '../services/storageService'

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

function base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index)
    }
    return bytes.buffer
}

type WebdavAction = 'test' | 'upload' | 'download'

async function webdavSyncWithRetry(
    action: WebdavAction,
    payload: { url: string; username: string; password: string; data?: string },
    retries = 2
) {
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

interface SyncState {
    webdavUrl: string
    webdavPath: string
    webdavUser: string
    webdavPass: string
    syncMode: SyncMode
    restoreMode: RestoreMode
    replaceBeforeRestore: boolean
    lastSyncTime: number | null
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
    isSyncing: false,
    isRestoring: false,
    isTesting: false,
    syncStatus: '',

    autoSync: async (reason) => {
        const { webdavUrl, webdavUser, webdavPass, webdavPath, isSyncing, isRestoring, syncMode } = get()
        if (!webdavUrl || !webdavUser || !webdavPass) return
        if (isSyncing || isRestoring) return

        try {
            if (reason === 'startup') {
                const downloadRes = await webdavSyncWithRetry('download', {
                    url: buildBackupUrl(webdavUrl, webdavPath),
                    username: webdavUser,
                    password: webdavPass,
                })
                if (!downloadRes.success || !downloadRes.data) return

                const payload = JSON.parse(downloadRes.data) as {
                    mode?: SyncMode
                    timestamp?: number
                    books?: Array<{ id: string; [key: string]: unknown }>
                    progress?: Array<{ bookId: string; [key: string]: unknown }>
                    bookmarks?: Array<{ id: string; [key: string]: unknown }>
                    highlights?: Array<{ id: string; [key: string]: unknown }>
                    settings?: Array<{ key: string; value: unknown }>
                    bookFiles?: Array<{ id: string; dataBase64: string }>
                }

                const localLast = get().lastSyncTime || 0
                const remoteLast = payload.timestamp || 0
                if (remoteLast <= localLast) return

                const resolvedMode: SyncMode = payload.mode || 'data'
                const applyData = resolvedMode === 'data' || resolvedMode === 'full'
                const applyFiles = resolvedMode === 'files' || resolvedMode === 'full'

                if (applyData && payload.books) await db.books.bulkPut(payload.books as any)
                if (applyData && payload.progress) await db.progress.bulkPut(payload.progress as any)
                if (applyData && payload.bookmarks) await db.bookmarks.bulkPut(payload.bookmarks as any)
                if (applyData && payload.highlights) await db.highlights.bulkPut(payload.highlights as any)
                if (applyData && payload.settings) await db.settings.bulkPut(payload.settings as any)
                if (applyFiles && payload.bookFiles) {
                    const decodedFiles = payload.bookFiles.map((item) => ({
                        id: item.id,
                        data: base64ToArrayBuffer(item.dataBase64),
                    }))
                    await db.bookFiles.bulkPut(decodedFiles as any)
                }

                set({ syncMode: resolvedMode, lastSyncTime: remoteLast, syncStatus: '已自动拉取最新云端数据' })
                await db.settings.put({ key: 'lastSyncTime', value: remoteLast })
                return
            }

            // interval / exit: upload local to cloud
            const now = Date.now()
            const payload: Record<string, unknown> = {
                mode: syncMode,
                timestamp: now,
            }

            if (syncMode === 'data' || syncMode === 'full') {
                const [books, progress, bookmarks, highlights, settings] = await Promise.all([
                    db.books.toArray(),
                    db.progress.toArray(),
                    db.bookmarks.toArray(),
                    db.highlights.toArray(),
                    db.settings.toArray(),
                ])
                payload.books = books
                payload.progress = progress
                payload.bookmarks = bookmarks
                payload.highlights = highlights
                payload.settings = settings
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

            const uploadRes = await webdavSyncWithRetry('upload', {
                url: buildBackupUrl(webdavUrl, webdavPath),
                username: webdavUser,
                password: webdavPass,
                data: JSON.stringify(payload),
            })
            if (!uploadRes.success) return
            set({ lastSyncTime: now, syncStatus: reason === 'interval' ? '自动同步完成' : '退出前同步完成' })
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
        if (config.webdavPass !== undefined) await db.settings.put({ key: 'webdavPass', value: config.webdavPass })
        if (config.syncMode !== undefined) await db.settings.put({ key: 'webdavSyncMode', value: config.syncMode })
        if (config.restoreMode !== undefined) await db.settings.put({ key: 'webdavRestoreMode', value: config.restoreMode })
        if (config.replaceBeforeRestore !== undefined) await db.settings.put({ key: 'webdavReplaceBeforeRestore', value: config.replaceBeforeRestore })
    },

    loadConfig: async () => {
        const url = await db.settings.get('webdavUrl')
        const remotePath = await db.settings.get('webdavPath')
        const user = await db.settings.get('webdavUser')
        const pass = await db.settings.get('webdavPass')
        const syncMode = await db.settings.get('webdavSyncMode')
        const restoreMode = await db.settings.get('webdavRestoreMode')
        const replaceBeforeRestore = await db.settings.get('webdavReplaceBeforeRestore')
        const time = await db.settings.get('lastSyncTime')

        set({
            webdavUrl: (url?.value as string) || '',
            webdavPath: normalizeFolderPath((remotePath?.value as string) || 'VitraReader'),
            webdavUser: (user?.value as string) || '',
            webdavPass: (pass?.value as string) || '',
            syncMode: ((syncMode?.value as SyncMode) || 'data'),
            restoreMode: ((restoreMode?.value as RestoreMode) || 'auto'),
            replaceBeforeRestore: (replaceBeforeRestore?.value as boolean) ?? true,
            lastSyncTime: (time?.value as number) || null
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
        } catch (error: any) {
            set({ syncStatus: `连接失败: ${error?.message || error}` })
        } finally {
            set({ isTesting: false })
        }
    },

    syncData: async () => {
        const { webdavUrl, webdavPath, webdavUser, webdavPass, syncMode } = get()
        if (!webdavUrl || !webdavUser || !webdavPass) {
            set({ syncStatus: 'Missing configuration' })
            return
        }

        set({ isSyncing: true, syncStatus: 'Preparing...' })

        try {
            const now = Date.now()
            const payload: Record<string, unknown> = {
                mode: syncMode,
                timestamp: now,
            }

            if (syncMode === 'data' || syncMode === 'full') {
                const [books, progress, bookmarks, highlights, settings] = await Promise.all([
                    db.books.toArray(),
                    db.progress.toArray(),
                    db.bookmarks.toArray(),
                    db.highlights.toArray(),
                    db.settings.toArray(),
                ])
                payload.books = books
                payload.progress = progress
                payload.bookmarks = bookmarks
                payload.highlights = highlights
                payload.settings = settings
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

            const backupData = JSON.stringify(payload)

            // 2. Upload
            set({ syncStatus: `Uploading (${syncMode})...` })
            const uploadRes = await webdavSyncWithRetry('upload', {
                url: buildBackupUrl(webdavUrl, webdavPath),
                username: webdavUser,
                password: webdavPass,
                data: backupData
            })

            if (!uploadRes.success) throw new Error(uploadRes.error)

            set({ syncStatus: 'Sync Complete', lastSyncTime: now })
            await db.settings.put({ key: 'lastSyncTime', value: now })

        } catch (e: any) {
            console.error('Sync failed:', e)
            set({ syncStatus: `Error: ${e.message || e}` })
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

            const payload = JSON.parse(downloadRes.data) as {
                mode?: SyncMode
                books?: Array<{ id: string; [key: string]: unknown }>
                progress?: Array<{ bookId: string; [key: string]: unknown }>
                bookmarks?: Array<{ id: string; [key: string]: unknown }>
                highlights?: Array<{ id: string; [key: string]: unknown }>
                settings?: Array<{ key: string; value: unknown }>
                bookFiles?: Array<{ id: string; dataBase64: string }>
            }

            const resolvedMode: SyncMode = restoreMode === 'auto' ? (payload.mode || 'data') : restoreMode
            const applyData = resolvedMode === 'data' || resolvedMode === 'full'
            const applyFiles = resolvedMode === 'files' || resolvedMode === 'full'

            if (replaceBeforeRestore) {
                if (applyData) {
                    await Promise.all([
                        db.books.clear(),
                        db.progress.clear(),
                        db.bookmarks.clear(),
                        db.highlights.clear(),
                    ])
                }
                if (applyFiles) {
                    await db.bookFiles.clear()
                }
            }

            if (applyData && payload.books) await db.books.bulkPut(payload.books as any)
            if (applyData && payload.progress) await db.progress.bulkPut(payload.progress as any)
            if (applyData && payload.bookmarks) await db.bookmarks.bulkPut(payload.bookmarks as any)
            if (applyData && payload.highlights) await db.highlights.bulkPut(payload.highlights as any)
            if (applyData && payload.settings) await db.settings.bulkPut(payload.settings as any)
            if (applyFiles && payload.bookFiles) {
                const decodedFiles = payload.bookFiles.map((item) => ({
                    id: item.id,
                    data: base64ToArrayBuffer(item.dataBase64),
                }))
                await db.bookFiles.bulkPut(decodedFiles as any)
            }

            await db.settings.put({ key: 'webdavSyncMode', value: resolvedMode })
            set({ syncMode: resolvedMode, syncStatus: `恢复完成（${resolvedMode}）` })
        } catch (error: any) {
            console.error('Restore failed:', error)
            set({ syncStatus: `恢复失败: ${error?.message || error}` })
        } finally {
            set({ isRestoring: false })
        }
    },
}))
