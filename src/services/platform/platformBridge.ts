export interface PickedBookFile {
    name: string
    path: string
    data: () => Promise<Uint8Array | ArrayBuffer>
}

export interface PlatformCapabilities {
    isDesktop: boolean
    canWebdavSync: boolean
    canSafeStorage: boolean
}

export type PlatformWebdavAction = 'test' | 'upload' | 'download' | 'head'

export interface PlatformWebdavPayload {
    url: string
    username: string
    password: string
    data?: string
    ifMatch?: string
    ifNoneMatch?: string
}

export interface PlatformWebdavResult {
    success: boolean
    data?: string
    error?: string
    statusCode?: number
    etag?: string
    lastModified?: string
    exists?: boolean
}

export interface PlatformHttpRequest {
    url: string
    method?: 'GET' | 'POST'
    headers?: Record<string, string>
    body?: string
}

export interface PlatformHttpResult {
    success: boolean
    status?: number
    data?: string
    error?: string
}

export interface WindowFullscreenBridge {
    get: () => Promise<boolean>
    set: (enabled: boolean) => Promise<boolean>
    onChange: (callback: (fullscreen: boolean) => void) => () => void
}

export const WEBDAV_DESKTOP_ONLY_ERROR = 'WebDAV 同步仅桌面版支持'
export const SAFE_STORAGE_DESKTOP_ONLY_ERROR = 'safeStorage 仅桌面版支持'

const BOOK_FILE_ACCEPT = [
    '.epub', '.pdf', '.txt', '.mobi', '.azw', '.azw3',
    '.htm', '.html', '.xml', '.xhtml', '.md', '.fb2',
    '.docx', '.cbz', '.cbt', '.cbr', '.cb7',
].join(',')

function getElectronApi(): Window['electronAPI'] | undefined {
    return window.electronAPI ?? undefined
}

export function getPlatformCapabilities(): PlatformCapabilities {
    const api = getElectronApi()
    return {
        isDesktop: !!api,
        canWebdavSync: typeof api?.webdavSync === 'function',
        canSafeStorage: typeof api?.safeStorageEncrypt === 'function',
    }
}

function pickBookFilesViaInput(): Promise<PickedBookFile[]> {
    return new Promise((resolve) => {
        const input = document.createElement('input')
        input.type = 'file'
        input.multiple = true
        input.accept = BOOK_FILE_ACCEPT
        input.style.display = 'none'

        let settled = false
        let focusFallbackTimer: number | null = null

        const finish = (files: PickedBookFile[]) => {
            if (settled) return
            settled = true
            if (focusFallbackTimer !== null) window.clearTimeout(focusFallbackTimer)
            window.removeEventListener('focus', handleWindowFocus)
            input.remove()
            resolve(files)
        }

        const handleWindowFocus = () => {
            if (focusFallbackTimer !== null) window.clearTimeout(focusFallbackTimer)
            focusFallbackTimer = window.setTimeout(() => finish([]), 1000)
        }

        input.addEventListener('change', () => {
            const picked = Array.from(input.files ?? []).map((file) => ({
                name: file.name,
                path: '',
                data: () => file.arrayBuffer(),
            }))
            finish(picked)
        })
        input.addEventListener('cancel', () => finish([]))
        window.addEventListener('focus', handleWindowFocus)

        document.body.appendChild(input)
        input.click()
    })
}

export async function pickBookFiles(): Promise<PickedBookFile[]> {
    const api = getElectronApi()
    if (api?.openEpub && api.readFile) {
        const files = await api.openEpub()
        return files.map((file) => ({
            name: file.name,
            path: file.path,
            data: () => api.readFile(file.path),
        }))
    }
    return pickBookFilesViaInput()
}

export function openExternalUrl(url: string): void {
    const api = getElectronApi()
    if (api?.openExternal) {
        void api.openExternal(url)
        return
    }
    window.open(url, '_blank', 'noopener,noreferrer')
}

export function listSystemFonts(): Promise<string[]> {
    const api = getElectronApi()
    if (api?.listSystemFonts) return api.listSystemFonts()
    return Promise.resolve([])
}

export async function webdavSync(
    action: PlatformWebdavAction,
    payload: PlatformWebdavPayload,
): Promise<PlatformWebdavResult> {
    const api = getElectronApi()
    if (api?.webdavSync) return api.webdavSync(action, payload)
    return { success: false, error: WEBDAV_DESKTOP_ONLY_ERROR }
}

export async function httpRequest(payload: PlatformHttpRequest): Promise<PlatformHttpResult> {
    const api = getElectronApi()
    if (api?.translateRequest) return api.translateRequest(payload)
    const response = await fetch(payload.url, {
        method: payload.method || 'POST',
        headers: payload.headers,
        body: payload.body,
    })
    const data = await response.text()
    if (!response.ok) return { success: false, status: response.status, data, error: `HTTP ${response.status}` }
    return { success: true, status: response.status, data }
}

export async function safeStorageIsAvailable(): Promise<boolean> {
    const api = getElectronApi()
    if (!api?.safeStorageEncrypt || !api.safeStorageIsAvailable) return false
    try {
        return await api.safeStorageIsAvailable()
    } catch {
        return false
    }
}

export function safeStorageEncrypt(plaintext: string): Promise<string> {
    const api = getElectronApi()
    if (!api?.safeStorageEncrypt) return Promise.reject(new Error(SAFE_STORAGE_DESKTOP_ONLY_ERROR))
    return api.safeStorageEncrypt(plaintext)
}

export function safeStorageDecrypt(cipherBase64: string): Promise<string> {
    const api = getElectronApi()
    if (!api?.safeStorageDecrypt) return Promise.reject(new Error(SAFE_STORAGE_DESKTOP_ONLY_ERROR))
    return api.safeStorageDecrypt(cipherBase64)
}

export function getWindowFullscreenBridge(): WindowFullscreenBridge | null {
    const api = getElectronApi()
    if (!api?.getWindowFullscreen || !api.setWindowFullscreen || !api.onWindowFullscreenChange) return null
    return {
        get: () => api.getWindowFullscreen(),
        set: (enabled) => api.setWindowFullscreen(enabled),
        onChange: (callback) => api.onWindowFullscreenChange(callback),
    }
}

export async function requestPersistentStorage(): Promise<boolean> {
    if (!navigator.storage?.persist) return false
    try {
        return await navigator.storage.persist()
    } catch {
        return false
    }
}
