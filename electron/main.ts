import { app, BrowserWindow, ipcMain, dialog, Tray, Menu, nativeImage, shell, session, safeStorage, net } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'
import { execFile } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, '..')
const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
const OPEN_DEVTOOLS = process.env['VITRA_OPEN_DEVTOOLS'] !== '0'
const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

let win: BrowserWindow | null
let tray: Tray | null = null

const THEME_BG_COLORS: Record<string, string> = {
    light: '#ffffff',
    dark: '#1a1a2e',
    sepia: '#f4ecd8',
    green: '#c7edcc',
}

function isValidHexColor(value: string): boolean {
    return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(value.trim())
}

// ─── Security Validators ────────────────────────────────────

const NETWORK_REQUEST_TIMEOUT_MS = 15_000
const ALLOW_INSECURE_WEBDAV = process.env['VITRA_ALLOW_INSECURE_WEBDAV'] === '1'
const TRANSLATE_ALLOWED_ORIGINS = new Set([
    'https://api.openai.com',
    'https://api-free.deepl.com',
    'https://api.deepl.com',
    'http://127.0.0.1:11434',
    'http://localhost:11434',
    'http://[::1]:11434',
    'http://127.0.0.1:1188',
    'http://localhost:1188',
    'http://[::1]:1188',
])
const TRANSLATE_HEADER_NAMES = new Set([
    'accept',
    'authorization',
    'content-type',
    'openai-organization',
    'openai-project',
    'api-key',
    'x-api-key',
])
const HEADER_NAME_PATTERN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/

function parseHttpUrl(url: string): URL | null {
    try {
        const parsed = new URL(url)
        if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null
        return parsed
    } catch {
        return null
    }
}

function normalizeOrigin(value: string): string | null {
    const parsed = parseHttpUrl(value.trim())
    return parsed?.origin ?? null
}

function getConfiguredTranslateAllowedOrigins(): Set<string> {
    const origins = new Set(TRANSLATE_ALLOWED_ORIGINS)
    const raw = process.env['VITRA_TRANSLATE_ALLOWED_ORIGINS'] || ''
    raw.split(',').map(normalizeOrigin).forEach((origin) => {
        if (origin) origins.add(origin)
    })
    return origins
}

function isLoopbackHost(hostname: string): boolean {
    const normalized = hostname.toLowerCase()
    return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1' || normalized === '[::1]'
}

function isAllowedTranslateUrl(parsed: URL): boolean {
    if (parsed.protocol === 'https:') return true
    if (parsed.protocol === 'http:' && isLoopbackHost(parsed.hostname)) return true
    return getConfiguredTranslateAllowedOrigins().has(parsed.origin)
}

export function assertAllowedUrl(url: unknown, scope: 'translate' | 'webdav'): { ok: true; parsed: URL } | { ok: false; error: string } {
    if (!url || typeof url !== 'string') {
        return { ok: false, error: `${scope} blocked: missing request url` }
    }

    const parsed = parseHttpUrl(url)
    if (!parsed) {
        return { ok: false, error: `${scope} blocked: disallowed url protocol "${url}"` }
    }

    if (scope === 'translate') {
        if (!isAllowedTranslateUrl(parsed)) {
            return { ok: false, error: `translate blocked: disallowed origin "${parsed.origin}"` }
        }
        return { ok: true, parsed }
    }

    if (parsed.protocol === 'https:') return { ok: true, parsed }
    if (ALLOW_INSECURE_WEBDAV) {
        console.warn(`[webdav] insecure HTTP WebDAV request allowed by VITRA_ALLOW_INSECURE_WEBDAV=1: ${parsed.origin}`)
        return { ok: true, parsed }
    }
    return { ok: false, error: `webdav blocked: insecure http url "${url}"` }
}

export function filterTranslateHeaders(headers: unknown): { ok: true; headers: Record<string, string> } | { ok: false; error: string } {
    if (!headers || typeof headers !== 'object') return { ok: true, headers: {} }
    const filtered: Record<string, string> = {}
    for (const [rawKey, rawValue] of Object.entries(headers as Record<string, unknown>)) {
        const key = rawKey.trim()
        const normalizedKey = key.toLowerCase()
        if (!HEADER_NAME_PATTERN.test(key) || !TRANSLATE_HEADER_NAMES.has(normalizedKey)) {
            return { ok: false, error: `translate blocked: disallowed header "${rawKey}"` }
        }
        if (typeof rawValue !== 'string' || /[\r\n]/.test(rawValue)) {
            return { ok: false, error: `translate blocked: invalid header value for "${rawKey}"` }
        }
        filtered[key] = rawValue
    }
    return { ok: true, headers: filtered }
}

function bindNetworkRequestTimeout(
    request: ReturnType<typeof net.request>,
    resolve: (value: unknown) => void,
    scope: string,
): (value: unknown) => void {
    let settled = false
    const timeoutId = globalThis.setTimeout(() => {
        finish({ success: false, error: `${scope} timeout after ${NETWORK_REQUEST_TIMEOUT_MS}ms` })
        request.abort()
    }, NETWORK_REQUEST_TIMEOUT_MS)
    const finish = (value: unknown) => {
        if (settled) return
        settled = true
        globalThis.clearTimeout(timeoutId)
        resolve(value)
    }
    request.on('error', (error) => finish({ success: false, error: error.message }))
    return finish
}

const ALLOWED_BOOK_EXTENSIONS = new Set([
    '.epub', '.pdf', '.txt', '.mobi', '.azw', '.azw3',
    '.htm', '.html', '.xhtml', '.xml', '.md', '.fb2',
    '.docx', '.djvu', '.cbz', '.cbt', '.cbr', '.cb7',
])

function isAllowedFilePath(filePath: string): boolean {
    if (!filePath || typeof filePath !== 'string') return false
    if (!path.isAbsolute(filePath)) return false
    const normalized = path.resolve(filePath)
    const ext = path.extname(normalized).toLowerCase()
    return ALLOWED_BOOK_EXTENSIONS.has(ext)
}

function isAllowedExternalUrl(url: string): boolean {
    try {
        const parsed = new URL(url)
        return parsed.protocol === 'https:'
    } catch {
        return false
    }
}

const DEFAULT_WINDOW_BACKGROUND = THEME_BG_COLORS.light || '#ffffff'

function resolveWindowBackground(themeId?: string, customBgColor?: string | null): string {
    if (typeof customBgColor === 'string' && isValidHexColor(customBgColor)) {
        return customBgColor
    }

    const themeColor = typeof themeId === 'string' ? THEME_BG_COLORS[themeId] : undefined
    return themeColor || DEFAULT_WINDOW_BACKGROUND
}

function createFallbackVitraIcon() {
    const svg = `
<svg width="64" height="64" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="2" y="2" width="44" height="44" rx="12" fill="#0B9BA1"/>
  <path d="M14 11L20.5 37H25L31.5 11H27L22.75 30.8L18.5 11H14Z" fill="white"/>
</svg>`
    return nativeImage.createFromDataURL(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`)
}

function loadVitraIcon() {
    const icoCandidates = [
        path.join(process.env.APP_ROOT || path.join(__dirname, '..'), '6010d-l3wuw-001.ico'),
    ]
    for (const iconPath of icoCandidates) {
        if (!fs.existsSync(iconPath)) continue
        const image = nativeImage.createFromPath(iconPath)
        if (!image.isEmpty()) return image
    }

    const candidates = [
        path.join(process.env.APP_ROOT || path.join(__dirname, '..'), 'src', 'assets', 'icons', 'vitra-logo.svg'),
        path.join(process.env.APP_ROOT || path.join(__dirname, '..'), 'dist', 'assets', 'vitra-logo.svg'),
    ]
    for (const iconPath of candidates) {
        if (!fs.existsSync(iconPath)) continue
        const svg = fs.readFileSync(iconPath, 'utf8')
        const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
        const image = nativeImage.createFromDataURL(dataUrl)
        if (!image.isEmpty()) return image
    }
    const fallback = createFallbackVitraIcon()
    return fallback.isEmpty() ? undefined : fallback
}

function loadTrayIcon() {
    const icoCandidates = [
        path.join(process.env.APP_ROOT || path.join(__dirname, '..'), '1w2ze-5r6yb-001.ico'),
    ]
    for (const iconPath of icoCandidates) {
        if (!fs.existsSync(iconPath)) continue
        const image = nativeImage.createFromPath(iconPath)
        if (!image.isEmpty()) return image
    }

    const primary = loadVitraIcon()
    if (primary && !primary.isEmpty()) return primary

    const pngCandidates = [
        path.join(process.env.APP_ROOT || path.join(__dirname, '..'), 'public', 'tray.png'),
        path.join(process.env.APP_ROOT || path.join(__dirname, '..'), 'src', 'assets', 'tray.png'),
        path.join(process.env.APP_ROOT || path.join(__dirname, '..'), 'extracted', 'build-app', 'images', 'app-logo.png'),
    ]
    for (const iconPath of pngCandidates) {
        if (!fs.existsSync(iconPath)) continue
        const image = nativeImage.createFromPath(iconPath)
        if (!image.isEmpty()) return image
    }
    return createFallbackVitraIcon()
}

function createWindow() {
    const icon = loadVitraIcon()
    win = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        titleBarStyle: 'default',
        autoHideMenuBar: true,
        icon,
        backgroundColor: resolveWindowBackground('light'),
        show: false, // Don't show until ready
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    })
    const currentWindow = win
    const emitWindowFullscreenState = () => {
        if (currentWindow.isDestroyed()) return
        currentWindow.webContents.send('window:fullscreen-changed', currentWindow.isFullScreen())
    }
    currentWindow.on('enter-full-screen', emitWindowFullscreenState)
    currentWindow.on('leave-full-screen', emitWindowFullscreenState)

    // ─── Security: Content Security Policy ────────────────
    // 阻止 inline script 执行（XSS 纵深防御），允许 EPUB 所需的 inline style / blob / data 图片
    const devOrigin = VITE_DEV_SERVER_URL ? (() => { try { return new URL(VITE_DEV_SERVER_URL).origin } catch { return '' } })() : ''
    const scriptSrc = VITE_DEV_SERVER_URL
        ? `'self' ${devOrigin} 'unsafe-eval' 'unsafe-inline'`   // dev: Vite HMR eval + React Fast Refresh inline preamble
        : `'self'`
    const cspValue = [
        `default-src 'self'`,
        `script-src ${scriptSrc}`,
        `style-src 'self' 'unsafe-inline'`,
        `img-src 'self' blob: data: vitra-res:`,
        `font-src 'self' data: blob:`,
        `media-src 'self' blob: data:`,
        `connect-src 'self' ${devOrigin} https: http:`,
        `worker-src 'self' blob:`,
        `frame-src 'self' blob: data:`,
        `object-src 'none'`,
    ].join('; ')

    win.webContents.session.webRequest.onHeadersReceived((details, callback) => {
        callback({
            responseHeaders: {
                ...details.responseHeaders,
                'Content-Security-Policy': [cspValue],
            },
        })
    })

    // Show window when ready to prevent white screen
    win.once('ready-to-show', () => {
        win?.setMenuBarVisibility(false)
        win?.show()
    })

    // 开发模式默认打开 DevTools，便于排查渲染与阅读器问题；设置 VITRA_OPEN_DEVTOOLS=0 可关闭。
    if (VITE_DEV_SERVER_URL) {
        win.loadURL(VITE_DEV_SERVER_URL)
        if (OPEN_DEVTOOLS) {
            win.webContents.openDevTools({ mode: 'detach' })
        }
    } else {
        win.loadFile(path.join(RENDERER_DIST, 'index.html'))
    }

    // ─── Security: restrict navigation ──────────────────────
    const allowedOrigins = new Set<string>()
    if (VITE_DEV_SERVER_URL) {
        try { allowedOrigins.add(new URL(VITE_DEV_SERVER_URL).origin) } catch { /* noop */ }
    }
    // Production: file:// pages have origin 'null' or 'file://', handled by matching protocol
    win.webContents.on('will-navigate', (event, navigationUrl) => {
        try {
            const parsed = new URL(navigationUrl)
            // Allow dev server origin
            if (allowedOrigins.has(parsed.origin)) return
            // Allow file:// in production builds
            if (parsed.protocol === 'file:') return
        } catch { /* block malformed URLs */ }
        event.preventDefault()
    })

    // Block all new window creation (target="_blank", window.open, etc.)
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
}

function createTray() {
    if (tray) return
    const trayBase = loadTrayIcon()
    if (trayBase.isEmpty()) return
    const trayIcon = trayBase.resize({ width: 16, height: 16 })
    if (trayIcon.isEmpty()) return
    tray = new Tray(trayIcon)
    console.log('[tray] created')
    tray.setToolTip('Vitra Reader')
    tray.setContextMenu(Menu.buildFromTemplate([
        {
            label: '退出',
            click: () => app.quit(),
        },
    ]))
    tray.on('double-click', () => {
        if (!win || win.isDestroyed()) {
            createWindow()
            return
        }
        if (win.isMinimized()) win.restore()
        win.show()
        win.focus()
    })
}

// ─── IPC Handlers ───────────────────────────────────────────

// Open file dialog to import .epub files
ipcMain.handle('dialog:openEpub', async () => {
    const result = await dialog.showOpenDialog({
        filters: [{ name: '电子书文件', extensions: [
            'epub', 'pdf', 'txt', 'mobi', 'azw', 'azw3',
            'htm', 'html', 'xml', 'xhtml', 'md', 'fb2',
            'docx', 'cbz', 'cbt', 'cbr', 'cb7',
        ] }],
        properties: ['openFile', 'multiSelections'],
    })
    if (result.canceled) return []

    const files = await Promise.all(
        result.filePaths.map(async (filePath) => {
            const stat = await fs.promises.stat(filePath)
            return {
                name: path.basename(filePath),
                path: filePath,
                size: stat.size,
            }
        })
    )
    return files
})

// Read a file from disk (restricted to allowed book extensions)
ipcMain.handle('fs:readFile', async (_event, filePath: string) => {
    if (!isAllowedFilePath(filePath)) {
        throw new Error(`fs:readFile blocked: disallowed path "${filePath}"`)
    }
    return fs.promises.readFile(filePath)
})

ipcMain.on('window:setTheme', (_event, payload: { themeId?: string; customBgColor?: string | null; customTextColor?: string | null } | string) => {
    if (!win || win.isDestroyed()) return
    const normalized = typeof payload === 'string' ? { themeId: payload } : payload
    const backgroundColor = resolveWindowBackground(normalized?.themeId, normalized?.customBgColor)
    win.setBackgroundColor(backgroundColor)
})

ipcMain.handle('window:getFullscreen', (event) => {
    const targetWindow = BrowserWindow.fromWebContents(event.sender) ?? win
    return Boolean(targetWindow && !targetWindow.isDestroyed() && targetWindow.isFullScreen())
})

ipcMain.handle('window:setFullscreen', (event, enabled: boolean) => {
    if (typeof enabled !== 'boolean') {
        throw new Error('window:setFullscreen expects boolean payload')
    }
    const targetWindow = BrowserWindow.fromWebContents(event.sender) ?? win
    if (!targetWindow || targetWindow.isDestroyed()) return false
    targetWindow.setFullScreen(enabled)
    return enabled
})

ipcMain.handle('system:listFonts', async () => {
    if (process.platform !== 'win32') return []

    // Common Chinese font name mappings (Registry name -> Display name)
    const chineseFontMap: Record<string, string> = {
        'Microsoft YaHei': '微软雅黑',
        'Microsoft YaHei UI': '微软雅黑 UI',
        'SimSun': '宋体',
        'SimHei': '黑体',
        'KaiTi': '楷体',
        'FangSong': '仿宋',
        'NSimSun': '新宋体',
        'Microsoft JhengHei': '微软正黑体',
        'Microsoft JhengHei UI': '微软正黑体 UI',
        'DengXian': '等线',
        'FangSong_GB2312': '仿宋_GB2312',
        'KaiTi_GB2312': '楷体_GB2312',
    }

    const queryRegistryFonts = (registryPath: string) => {
        return new Promise<string[]>((resolve) => {
            execFile(
                'powershell',
                [
                    '-NoProfile',
                    '-Command',
                    `[Console]::OutputEncoding=[System.Text.Encoding]::UTF8;` +
                    `$ErrorActionPreference='SilentlyContinue';` +
                    `$p='${registryPath.replace(/\\/g, '\\\\')}';` +
                    `$psPath=$p -replace '^HKLM','HKLM:' -replace '^HKCU','HKCU:';` +
                    `$i=Get-ItemProperty -Path $psPath;` +
                    `if(-not $i){'[]';exit};` +
                    `$skip=@('PSPath','PSParentPath','PSChildName','PSDrive','PSProvider');` +
                    `$names=$i.PSObject.Properties | Where-Object { $skip -notcontains $_.Name } | ForEach-Object { $_.Name };` +
                    `$names | ConvertTo-Json -Compress`,
                ],
                { windowsHide: true, maxBuffer: 1024 * 1024 * 10, encoding: 'utf8' },
                (_error, stdout) => {
                    if (!stdout || !stdout.trim()) {
                        resolve([])
                        return
                    }
                    let rawNames: unknown = []
                    try {
                        rawNames = JSON.parse(stdout.trim())
                    } catch {
                        resolve([])
                        return
                    }
                    const namesArray = Array.isArray(rawNames) ? rawNames : [rawNames]
                    const fonts = namesArray
                        .map((value) => String(value || ''))
                        .map((name) => {
                            return name
                                .replace(/\s*\(TrueType\)\s*/gi, '')
                                .replace(/\s*\(OpenType\)\s*/gi, '')
                                .replace(/\s*&\s*.+$/gi, '')
                                .replace(/^@/, '')
                                .trim()
                        })
                        .filter((name) => name.length >= 2)
                    resolve(fonts)
                }
            )
        })
    }

    const [machineFonts, userFonts] = await Promise.all([
        queryRegistryFonts('HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts'),
        queryRegistryFonts('HKCU\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts'),
    ])

    const merged = [...machineFonts, ...userFonts]
        .map((name) => chineseFontMap[name] || name)
        .filter((name) => name.length >= 2)

    const unique = Array.from(new Set(merged)).sort((a, b) => {
        const aIsChinese = /[\u4e00-\u9fa5]/.test(a)
        const bIsChinese = /[\u4e00-\u9fa5]/.test(b)
        if (aIsChinese && !bIsChinese) return -1
        if (!aIsChinese && bIsChinese) return 1
        return a.localeCompare(b, 'zh-CN')
    })

    return unique
})

ipcMain.handle('system:getProcessMemoryInfo', async () => {
    try {
        const mainMemory = await process.getProcessMemoryInfo()
        const processMetrics = app.getAppMetrics().map((metric) => ({
            pid: metric.pid,
            type: metric.type,
            memory: metric.memory
                ? {
                    workingSetSize: metric.memory.workingSetSize,
                    peakWorkingSetSize: metric.memory.peakWorkingSetSize,
                    privateBytes: metric.memory.privateBytes,
                }
                : null,
        }))

        return {
            success: true,
            timestamp: Date.now(),
            mainMemory,
            processMetrics,
        }
    } catch (error: unknown) {
        return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
            timestamp: Date.now(),
        }
    }
})

function readAutoStartOnLoginState(): { supported: boolean; enabled: boolean } {
    const supported = process.platform === 'win32' || process.platform === 'darwin'
    if (!supported) {
        return { supported: false, enabled: false }
    }
    const loginSettings = app.getLoginItemSettings()
    return {
        supported: true,
        enabled: Boolean(loginSettings.openAtLogin),
    }
}

ipcMain.handle('system:getAutoStartOnLogin', async () => {
    return readAutoStartOnLoginState()
})

ipcMain.handle('system:setAutoStartOnLogin', async (_event, enabled: boolean) => {
    if (typeof enabled !== 'boolean') {
        throw new Error('system:setAutoStartOnLogin expects boolean payload')
    }

    const current = readAutoStartOnLoginState()
    if (!current.supported) return current

    app.setLoginItemSettings({
        openAtLogin: enabled,
        openAsHidden: false,
    })

    return readAutoStartOnLoginState()
})

// ─── WebDAV Sync ────────────────────────────────────────────


function firstHeaderValue(value: string | string[] | undefined): string | undefined {
    if (Array.isArray(value)) return value[0]
    return value
}

ipcMain.handle('webdav:upload', async (_, { url, username, password, data, ifMatch, ifNoneMatch }) => {
    const allowed = assertAllowedUrl(url, 'webdav')
    if (!allowed.ok) {
        return { success: false, error: `webdav:upload ${allowed.error}` }
    }
    return new Promise((resolve) => {
        const request = net.request({
            method: 'PUT',
            url: allowed.parsed.toString(),
        })
        const finish = bindNetworkRequestTimeout(request, resolve, 'webdav:upload')
        request.setHeader('Authorization', 'Basic ' + Buffer.from(String(username || '') + ':' + String(password || '')).toString('base64'))
        request.setHeader('Content-Type', 'application/json')
        if (typeof ifMatch === 'string' && ifMatch) {
            request.setHeader('If-Match', ifMatch)
        }
        if (typeof ifNoneMatch === 'string' && ifNoneMatch) {
            request.setHeader('If-None-Match', ifNoneMatch)
        }

        request.on('response', (response) => {
            const statusCode = response.statusCode || 0
            const etag = firstHeaderValue(response.headers['etag'])
            const lastModified = firstHeaderValue(response.headers['last-modified'])

            if (statusCode >= 200 && statusCode < 300) {
                finish({ success: true, statusCode, etag, lastModified })
            } else {
                finish({ success: false, statusCode, etag, lastModified, error: `Status ${statusCode}` })
            }
        })
        request.write(typeof data === 'string' ? data : String(data ?? ''))
        request.end()
    })
})

ipcMain.handle('webdav:download', async (_, { url, username, password }) => {
    const allowed = assertAllowedUrl(url, 'webdav')
    if (!allowed.ok) {
        return { success: false, error: `webdav:download ${allowed.error}` }
    }
    return new Promise((resolve) => {
        const request = net.request({ method: 'GET', url: allowed.parsed.toString() })
        const finish = bindNetworkRequestTimeout(request, resolve, 'webdav:download')
        request.setHeader('Authorization', 'Basic ' + Buffer.from(String(username || '') + ':' + String(password || '')).toString('base64'))

        request.on('response', (response) => {
            const statusCode = response.statusCode || 0
            const etag = firstHeaderValue(response.headers['etag'])
            const lastModified = firstHeaderValue(response.headers['last-modified'])

            if (statusCode !== 200) {
                finish({ success: false, statusCode, etag, lastModified, error: `Status ${statusCode}` })
                return
            }
            let body = ''
            response.on('data', (chunk) => body += chunk.toString())
            response.on('end', () => finish({ success: true, statusCode, data: body, etag, lastModified }))
        })
        request.end()
    })
})

ipcMain.handle('webdav:head', async (_, { url, username, password }) => {
    const allowed = assertAllowedUrl(url, 'webdav')
    if (!allowed.ok) {
        return { success: false, error: `webdav:head ${allowed.error}` }
    }
    return new Promise((resolve) => {
        const request = net.request({ method: 'HEAD', url: allowed.parsed.toString() })
        const finish = bindNetworkRequestTimeout(request, resolve, 'webdav:head')
        request.setHeader('Authorization', 'Basic ' + Buffer.from(String(username || '') + ':' + String(password || '')).toString('base64'))

        request.on('response', (response) => {
            const statusCode = response.statusCode || 0
            const etag = firstHeaderValue(response.headers['etag'])
            const lastModified = firstHeaderValue(response.headers['last-modified'])

            if (statusCode === 404) {
                finish({ success: true, statusCode, exists: false, etag, lastModified })
                return
            }

            if (statusCode >= 200 && statusCode < 400) {
                finish({ success: true, statusCode, exists: true, etag, lastModified })
                return
            }

            finish({ success: false, statusCode, etag, lastModified, error: `Status ${statusCode}` })
        })

        request.end()
    })
})

ipcMain.handle('webdav:test', async (_, { url, username, password }) => {
    const allowed = assertAllowedUrl(url, 'webdav')
    if (!allowed.ok) {
        return { success: false, error: `webdav:test ${allowed.error}` }
    }
    return new Promise((resolve) => {
        const request = net.request({ method: 'OPTIONS', url: allowed.parsed.toString() })
        const finish = bindNetworkRequestTimeout(request, resolve, 'webdav:test')
        request.setHeader('Authorization', 'Basic ' + Buffer.from(String(username || '') + ':' + String(password || '')).toString('base64'))

        request.on('response', (response) => {
            const code = response.statusCode || 0
            if ((code >= 200 && code < 400) || code === 401 || code === 403) {
                finish({ success: true })
            } else {
                finish({ success: false, error: `Status ${code}` })
            }
        })
        request.end()
    })
})

ipcMain.handle('translate:request', async (_, payload: {
    url: string
    method?: 'GET' | 'POST'
    headers?: Record<string, string>
    body?: string
}) => {
    return new Promise((resolve) => {
        try {
            const method = payload?.method === 'GET' ? 'GET' : 'POST'
            const allowed = assertAllowedUrl(payload?.url, 'translate')
            if (!allowed.ok) {
                resolve({ success: false, error: `translate:request ${allowed.error}` })
                return
            }

            const headers = filterTranslateHeaders(payload?.headers)
            if (!headers.ok) {
                resolve({ success: false, error: headers.error })
                return
            }

            const request = net.request({ method, url: allowed.parsed.toString() })
            const finish = bindNetworkRequestTimeout(request, resolve, 'translate:request')
            Object.entries(headers.headers).forEach(([key, value]) => {
                request.setHeader(key, value)
            })

            request.on('response', (response) => {
                let body = ''
                response.on('data', (chunk) => {
                    body += chunk.toString()
                })
                response.on('end', () => {
                    const status = response.statusCode || 0
                    if (status >= 200 && status < 300) {
                        finish({ success: true, status, data: body })
                    } else {
                        finish({
                            success: false,
                            status,
                            data: body,
                            error: `Status ${status}`,
                        })
                    }
                })
            })

            if (payload?.body && method !== 'GET') {
                request.write(payload.body)
            }
            request.end()
        } catch (error: unknown) {
            resolve({ success: false, error: error instanceof Error ? error.message : String(error) })
        }
    })
})
ipcMain.handle('shell:openExternal', async (_event, url: string) => {
    if (!url || typeof url !== 'string' || !isAllowedExternalUrl(url)) {
        throw new Error(`shell:openExternal blocked: disallowed url "${url}"`)
    }
    return shell.openExternal(url)
})

// ─── Safe Storage (credential encryption) ───────────────────

const SAFE_STORAGE_PREFIX = 'v1:'        // OS-level safeStorage 加密
const OBFUSCATION_PREFIX = 'ob1:'        // safeStorage 不可用时的 base64 混淆

ipcMain.handle('safeStorage:encrypt', (_event, plaintext: string) => {
    if (!plaintext || typeof plaintext !== 'string') return ''
    if (safeStorage.isEncryptionAvailable()) {
        const encrypted = safeStorage.encryptString(plaintext)
        return SAFE_STORAGE_PREFIX + encrypted.toString('base64')
    }
    // safeStorage 不可用：base64 混淆（非安全加密，但防肉眼明文）
    return OBFUSCATION_PREFIX + Buffer.from(plaintext, 'utf8').toString('base64')
})

ipcMain.handle('safeStorage:decrypt', (_event, stored: string) => {
    if (!stored || typeof stored !== 'string') return ''

    if (stored.startsWith(SAFE_STORAGE_PREFIX)) {
        const cipherBase64 = stored.slice(SAFE_STORAGE_PREFIX.length)
        if (!safeStorage.isEncryptionAvailable()) return ''
        try {
            return safeStorage.decryptString(Buffer.from(cipherBase64, 'base64'))
        } catch {
            return ''
        }
    }

    if (stored.startsWith(OBFUSCATION_PREFIX)) {
        const b64 = stored.slice(OBFUSCATION_PREFIX.length)
        try {
            return Buffer.from(b64, 'base64').toString('utf8')
        } catch {
            return ''
        }
    }

    // 无前缀 = 旧版明文数据（迁移兼容），原样返回
    return stored
})

ipcMain.handle('safeStorage:isAvailable', () => {
    return safeStorage.isEncryptionAvailable()
})

// ─── App Lifecycle ──────────────────────────────────────────

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
        win = null
        tray = null
    }
})

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
    }
})

app.whenReady().then(() => {
    Menu.setApplicationMenu(null)

    // Deny all permission requests (camera, microphone, geolocation, etc.)
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
        callback(false)
    })

    createWindow()
    createTray()
})
