import { app, BrowserWindow, ipcMain, dialog, Tray, Menu, nativeImage } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'
import { execFile } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, '..')
const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

let win: BrowserWindow | null
let tray: Tray | null = null

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
        backgroundColor: '#ffffff',
        show: false, // Don't show until ready
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    })

    // Show window when ready to prevent white screen
    win.once('ready-to-show', () => {
        win?.setMenuBarVisibility(false)
        win?.show()
    })

    // Open DevTools in development
    if (VITE_DEV_SERVER_URL) {
        win.loadURL(VITE_DEV_SERVER_URL)
        win.webContents.openDevTools({ mode: 'detach' })
    } else {
        win.loadFile(path.join(RENDERER_DIST, 'index.html'))
    }
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
        filters: [{ name: 'EPUB Files', extensions: ['epub'] }],
        properties: ['openFile', 'multiSelections'],
    })
    if (result.canceled) return []

    const files = await Promise.all(
        result.filePaths.map(async (filePath) => ({
            name: path.basename(filePath),
            path: filePath,
            data: await fs.promises.readFile(filePath),
        }))
    )
    return files
})

// Read a file from disk
ipcMain.handle('fs:readFile', async (_event, filePath: string) => {
    return fs.promises.readFile(filePath)
})

ipcMain.on('window:setTheme', (_event, payload: { themeId?: string; customBgColor?: string | null; customTextColor?: string | null } | string) => {
    void payload
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

// ─── WebDAV Sync ────────────────────────────────────────────

import { net } from 'electron'

ipcMain.handle('webdav:upload', async (_, { url, username, password, data }) => {
    return new Promise((resolve) => {
        const request = net.request({
            method: 'PUT',
            url: url,
        })
        request.setHeader('Authorization', 'Basic ' + Buffer.from(username + ':' + password).toString('base64'))
        request.setHeader('Content-Type', 'application/json')

        request.on('response', (response) => {
            if (response.statusCode >= 200 && response.statusCode < 300) {
                resolve({ success: true })
            } else {
                resolve({ success: false, error: `Status ${response.statusCode}` })
            }
        })
        request.on('error', (error) => resolve({ success: false, error: error.message }))
        request.write(data)
        request.end()
    })
})

ipcMain.handle('webdav:download', async (_, { url, username, password }) => {
    return new Promise((resolve) => {
        const request = net.request({ method: 'GET', url })
        request.setHeader('Authorization', 'Basic ' + Buffer.from(username + ':' + password).toString('base64'))

        request.on('response', (response) => {
            if (response.statusCode !== 200) {
                resolve({ success: false, error: `Status ${response.statusCode}` })
                return
            }
            let body = ''
            response.on('data', (chunk) => body += chunk.toString())
            response.on('end', () => resolve({ success: true, data: body }))
        })
        request.on('error', (error) => resolve({ success: false, error: error.message }))
        request.end()
    })
})

ipcMain.handle('webdav:test', async (_, { url, username, password }) => {
    return new Promise((resolve) => {
        const request = net.request({ method: 'OPTIONS', url })
        request.setHeader('Authorization', 'Basic ' + Buffer.from(username + ':' + password).toString('base64'))

        request.on('response', (response) => {
            const code = response.statusCode
            if ((code >= 200 && code < 400) || code === 401 || code === 403) {
                resolve({ success: true })
            } else {
                resolve({ success: false, error: `Status ${code}` })
            }
        })
        request.on('error', (error) => resolve({ success: false, error: error.message }))
        request.end()
    })
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
    createWindow()
    createTray()
})
