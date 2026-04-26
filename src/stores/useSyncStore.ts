import { create } from 'zustand'
import { db } from '@/services/storageService'
import {
    applyDownloadedPayload,
    buildUploadPayload,
    logSyncPayloadStats,
    type SyncPayloadShape,
} from './syncStorePayload'
import {
    K_URL, K_PATH, K_USER, K_SYNC_MODE, K_RESTORE_MODE,
    K_REPLACE_BEFORE_RESTORE, K_LAST_SYNC_TIME, K_REMOTE_ETAG,
    dbGet, normalizeFolderPath, buildBackupUrl, safeJsonParse, normalizeEtag,
    webdavSyncWithRetry, checkEtagAndUpload,
} from './syncStoreWebdav'

/** 同步状态提示自动清除的延迟（ms） */
const SYNC_STATUS_CLEAR_DELAY_MS = 3000

export type SyncMode = 'full' | 'data' | 'files'
export type RestoreMode = 'auto' | SyncMode

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
                    url: backupUrl, username: webdavUser, password: webdavPass,
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
                if (downloadedEtag) await db.settings.put({ key: K_REMOTE_ETAG, value: downloadedEtag })

                set({ syncMode: resolvedMode, lastSyncTime: remoteLast, remoteEtag: downloadedEtag, syncStatus: '已自动拉取最新云端数据' })
                await db.settings.put({ key: K_LAST_SYNC_TIME, value: remoteLast })
                return
            }

            const now = Date.now()
            const payload = await buildUploadPayload(syncMode, now)
            const payloadJson = JSON.stringify(payload)
            logSyncPayloadStats('auto', payload, payloadJson)
            const result = await checkEtagAndUpload(backupUrl, webdavUser, webdavPass, payloadJson, remoteEtag)

            if (!result.success) {
                if (result.conflicted) set({ syncStatus: '检测到云端更新，自动同步已跳过（避免覆盖）' })
                return
            }

            if (result.etag) await db.settings.put({ key: K_REMOTE_ETAG, value: result.etag })
            set({ lastSyncTime: now, remoteEtag: result.etag, syncStatus: reason === 'interval' ? '自动同步完成' : '退出前同步完成' })
            await db.settings.put({ key: K_LAST_SYNC_TIME, value: now })
        } catch (error) {
            console.error('Auto sync failed:', error)
        }
    },

    setConfig: async (config) => {
        set(config)
        if (config.webdavUrl !== undefined) await db.settings.put({ key: K_URL, value: config.webdavUrl })
        if (config.webdavPath !== undefined) await db.settings.put({ key: K_PATH, value: config.webdavPath })
        if (config.webdavUser !== undefined) await db.settings.put({ key: K_USER, value: config.webdavUser })
        if (config.webdavPass !== undefined) await db.settings.delete('webdavPass')
        if (config.syncMode !== undefined) await db.settings.put({ key: K_SYNC_MODE, value: config.syncMode })
        if (config.restoreMode !== undefined) await db.settings.put({ key: K_RESTORE_MODE, value: config.restoreMode })
        if (config.replaceBeforeRestore !== undefined) await db.settings.put({ key: K_REPLACE_BEFORE_RESTORE, value: config.replaceBeforeRestore })
    },

    loadConfig: async () => {
        const [url, remotePath, user, syncMode, restoreMode, replaceBeforeRestore, time, remoteEtag] = await Promise.all([
            dbGet(K_URL), dbGet(K_PATH), dbGet(K_USER), dbGet(K_SYNC_MODE),
            dbGet(K_RESTORE_MODE), dbGet(K_REPLACE_BEFORE_RESTORE), dbGet(K_LAST_SYNC_TIME), dbGet(K_REMOTE_ETAG),
        ])
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
            remoteEtag: normalizeEtag(remoteEtag?.value as string | null | undefined),
        })
    },

    testConnection: async () => {
        const { webdavUrl, webdavUser, webdavPass, webdavPath } = get()
        if (!webdavUrl || !webdavUser || !webdavPass) {
            set({ syncStatus: '请先填写服务器地址、用户名、密码' }); return
        }
        set({ isTesting: true, syncStatus: '测试连接中...' })
        try {
            const targetUrl = `${webdavUrl.replace(/\/$/, '')}/${normalizeFolderPath(webdavPath)}`
            const testRes = await webdavSyncWithRetry('test', { url: targetUrl, username: webdavUser, password: webdavPass })
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
        if (!webdavUrl || !webdavUser || !webdavPass) { set({ syncStatus: 'Missing configuration' }); return }
        set({ isSyncing: true, syncStatus: 'Preparing...' })
        try {
            const now = Date.now()
            const backupUrl = buildBackupUrl(webdavUrl, webdavPath)
            const payload = await buildUploadPayload(syncMode, now)
            const payloadJson = JSON.stringify(payload)
            logSyncPayloadStats('manual', payload, payloadJson)
            set({ syncStatus: `Uploading (${syncMode})...` })
            const result = await checkEtagAndUpload(backupUrl, webdavUser, webdavPass, payloadJson, remoteEtag)
            if (!result.success) {
                if (result.conflicted) throw new Error('同步冲突：云端文件已被更新，请先恢复后再同步')
                throw new Error(result.error)
            }
            if (result.etag) await db.settings.put({ key: K_REMOTE_ETAG, value: result.etag })
            set({ syncStatus: 'Sync Complete', lastSyncTime: now, remoteEtag: result.etag })
            await db.settings.put({ key: K_LAST_SYNC_TIME, value: now })
        } catch (e: unknown) {
            console.error('Sync failed:', e)
            set({ syncStatus: `Error: ${e instanceof Error ? e.message : String(e)}` })
        } finally {
            set({ isSyncing: false })
            setTimeout(() => set({ syncStatus: '' }), SYNC_STATUS_CLEAR_DELAY_MS)
        }
    },

    restoreData: async () => {
        const { webdavUrl, webdavPath, webdavUser, webdavPass, restoreMode, replaceBeforeRestore } = get()
        if (!webdavUrl || !webdavUser || !webdavPass) { set({ syncStatus: '请先填写服务器地址、用户名、密码' }); return }
        set({ isRestoring: true, syncStatus: '下载备份中...' })
        try {
            const downloadRes = await webdavSyncWithRetry('download', {
                url: buildBackupUrl(webdavUrl, webdavPath), username: webdavUser, password: webdavPass,
            })
            if (!downloadRes.success || !downloadRes.data) throw new Error(downloadRes.error || '备份文件不存在或不可读')
            const downloadedEtag = normalizeEtag(downloadRes.etag)
            if (downloadedEtag) await db.settings.put({ key: K_REMOTE_ETAG, value: downloadedEtag })
            const raw = safeJsonParse(downloadRes.data)
            if (!raw || typeof raw !== 'object') throw new Error('备份数据格式无效')
            const payload = raw as SyncPayloadShape
            const resolvedMode: SyncMode = restoreMode === 'auto' ? (payload.mode || 'data') : restoreMode
            await applyDownloadedPayload(payload, resolvedMode, replaceBeforeRestore)
            await db.settings.put({ key: K_SYNC_MODE, value: resolvedMode })
            set({ syncMode: resolvedMode, remoteEtag: downloadedEtag, syncStatus: `恢复完成（${resolvedMode}）` })
        } catch (error: unknown) {
            console.error('Restore failed:', error)
            set({ syncStatus: `恢复失败: ${error instanceof Error ? error.message : String(error)}` })
        } finally {
            set({ isRestoring: false })
        }
    },
}))
