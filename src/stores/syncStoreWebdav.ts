import { db } from '../services/storageService'

export const K_URL = 'sync:webdavUrl'
export const K_PATH = 'sync:webdavPath'
export const K_USER = 'sync:webdavUser'
export const K_SYNC_MODE = 'sync:syncMode'
export const K_RESTORE_MODE = 'sync:restoreMode'
export const K_REPLACE_BEFORE_RESTORE = 'sync:replaceBeforeRestore'
export const K_LAST_SYNC_TIME = 'sync:lastSyncTime'
export const K_REMOTE_ETAG = 'sync:remoteEtag'

const LEGACY_KEYS: Record<string, string> = {
    [K_URL]: 'webdavUrl',
    [K_PATH]: 'webdavPath',
    [K_USER]: 'webdavUser',
    [K_SYNC_MODE]: 'webdavSyncMode',
    [K_RESTORE_MODE]: 'webdavRestoreMode',
    [K_REPLACE_BEFORE_RESTORE]: 'webdavReplaceBeforeRestore',
    [K_LAST_SYNC_TIME]: 'lastSyncTime',
    [K_REMOTE_ETAG]: 'webdavRemoteEtag',
}

export async function dbGet(key: string): Promise<{ key: string; value: unknown } | undefined> {
    const row = await db.settings.get(key)
    if (row !== undefined) return row
    const legacyKey = LEGACY_KEYS[key]
    if (!legacyKey) return undefined
    const legacy = await db.settings.get(legacyKey)
    if (legacy === undefined) return undefined
    await db.settings.put({ key, value: legacy.value })
    await db.settings.delete(legacyKey)
    return { key, value: legacy.value }
}

export const BACKUP_FILENAME = 'vitra-reader-backup.json'

export function normalizeFolderPath(folderPath: string): string {
    const sanitized = folderPath.trim().replace(/^\/+|\/+$/g, '')
    return sanitized || 'VitraReader'
}

export function buildBackupUrl(baseUrl: string, folderPath: string): string {
    const root = baseUrl.replace(/\/$/, '')
    const folder = normalizeFolderPath(folderPath)
    return `${root}/${folder}/${BACKUP_FILENAME}`
}

export function safeJsonParse(data: string): unknown {
    try { return JSON.parse(data) } catch { return null }
}

export function normalizeEtag(value: string | null | undefined): string | null {
    if (!value) return null
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
}

export type WebdavAction = 'test' | 'upload' | 'download' | 'head'

export interface WebdavPayload {
    url: string
    username: string
    password: string
    data?: string
    ifMatch?: string
    ifNoneMatch?: string
}

export interface WebdavResult {
    success: boolean
    data?: string
    error?: string
    statusCode?: number
    etag?: string
    lastModified?: string
    exists?: boolean
}

export async function webdavSyncWithRetry(
    action: WebdavAction,
    payload: WebdavPayload,
    retries = 2,
): Promise<WebdavResult> {
    let lastError: string | null = null
    for (let attempt = 0; attempt <= retries; attempt += 1) {
        const result = await window.electronAPI.webdavSync(action, payload)
        if (result.success) return result
        lastError = result.error || `WebDAV ${action} failed`
        if (attempt < retries) {
            await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)))
        }
    }
    return { success: false, error: lastError || `WebDAV ${action} failed` }
}

export async function checkEtagAndUpload(
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
        return { success: false, etag: null, conflicted: uploadRes.statusCode === 412, error: uploadRes.error }
    }

    const nextEtag = normalizeEtag(uploadRes.etag) || headEtag || remoteEtag
    return { success: true, etag: nextEtag, conflicted: false }
}
