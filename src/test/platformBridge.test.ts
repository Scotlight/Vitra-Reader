import { afterEach, describe, expect, it, vi } from 'vitest'
import {
    SAFE_STORAGE_DESKTOP_ONLY_ERROR,
    WEBDAV_DESKTOP_ONLY_ERROR,
    getPlatformCapabilities,
    getWindowFullscreenBridge,
    httpRequest,
    listSystemFonts,
    openExternalUrl,
    pickBookFiles,
    requestPersistentStorage,
    safeStorageDecrypt,
    safeStorageEncrypt,
    safeStorageIsAvailable,
    webdavSync,
} from '@/services/platform/platformBridge'

function installElectronApi(api: Partial<Window['electronAPI']> | undefined): void {
    Object.defineProperty(window, 'electronAPI', {
        configurable: true,
        value: api,
    })
}

function findPickerInput(): HTMLInputElement | null {
    return document.body.querySelector('input[type="file"]')
}

describe('platformBridge', () => {
    afterEach(() => {
        installElectronApi(undefined)
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
        vi.clearAllMocks()
        document.body.innerHTML = ''
    })

    describe('getPlatformCapabilities', () => {
        it('无 electronAPI 时全部能力为 false', () => {
            expect(getPlatformCapabilities()).toEqual({
                isDesktop: false,
                canWebdavSync: false,
                canSafeStorage: false,
            })
        })

        it('有 electronAPI 时按方法存在性上报能力', () => {
            installElectronApi({
                webdavSync: vi.fn(),
                safeStorageEncrypt: vi.fn(),
            })
            expect(getPlatformCapabilities()).toEqual({
                isDesktop: true,
                canWebdavSync: true,
                canSafeStorage: true,
            })
        })
    })

    describe('pickBookFiles', () => {
        it('桌面端走 openEpub + readFile', async () => {
            const readFile = vi.fn(async () => new Uint8Array([7, 8, 9]))
            installElectronApi({
                openEpub: vi.fn(async () => [{ name: 'a.epub', path: 'D:/books/a.epub', size: 3 }]),
                readFile,
            })

            const files = await pickBookFiles()

            expect(files).toHaveLength(1)
            expect(files[0]?.name).toBe('a.epub')
            expect(files[0]?.path).toBe('D:/books/a.epub')
            const data = await files[0]?.data()
            expect(data).toEqual(new Uint8Array([7, 8, 9]))
            expect(readFile).toHaveBeenCalledWith('D:/books/a.epub')
        })

        it('桌面端取消选择返回空数组', async () => {
            installElectronApi({
                openEpub: vi.fn(async () => []),
                readFile: vi.fn(),
            })
            await expect(pickBookFiles()).resolves.toEqual([])
        })

        it('Web 端通过 input[type=file] 选择并读取内容', async () => {
            const pending = pickBookFiles()
            const input = findPickerInput()
            expect(input).not.toBeNull()
            expect(input?.multiple).toBe(true)
            expect(input?.accept).toContain('.epub')
            expect(input?.accept).toContain('.cb7')

            const file = new File([new Uint8Array([1, 2, 3])], 'b.epub')
            Object.defineProperty(input, 'files', { configurable: true, value: [file] })
            input?.dispatchEvent(new Event('change'))

            const files = await pending
            expect(files).toHaveLength(1)
            expect(files[0]?.name).toBe('b.epub')
            expect(files[0]?.path).toBe('')
            const data = await files[0]?.data()
            expect(new Uint8Array(data as ArrayBuffer)).toEqual(new Uint8Array([1, 2, 3]))
            expect(findPickerInput()).toBeNull()
        })

        it('Web 端取消选择返回空数组并清理 input', async () => {
            const pending = pickBookFiles()
            const input = findPickerInput()
            input?.dispatchEvent(new Event('cancel'))

            await expect(pending).resolves.toEqual([])
            expect(findPickerInput()).toBeNull()
        })

        it('Web 端旧引擎无 cancel 事件时经窗口 focus 兜底返回空数组', async () => {
            vi.useFakeTimers()
            try {
                const pending = pickBookFiles()
                expect(findPickerInput()).not.toBeNull()

                window.dispatchEvent(new Event('focus'))
                await vi.advanceTimersByTimeAsync(1100)

                await expect(pending).resolves.toEqual([])
                expect(findPickerInput()).toBeNull()
            } finally {
                vi.useRealTimers()
            }
        })

        it('focus 兜底窗口期内 change 先到时以所选文件为准', async () => {
            vi.useFakeTimers()
            try {
                const pending = pickBookFiles()
                const input = findPickerInput()

                window.dispatchEvent(new Event('focus'))
                Object.defineProperty(input, 'files', {
                    configurable: true,
                    value: [new File([new Uint8Array([5])], 'c.epub')],
                })
                input?.dispatchEvent(new Event('change'))
                await vi.advanceTimersByTimeAsync(1100)

                const files = await pending
                expect(files).toHaveLength(1)
                expect(files[0]?.name).toBe('c.epub')
                expect(findPickerInput()).toBeNull()
            } finally {
                vi.useRealTimers()
            }
        })
    })

    describe('openExternalUrl', () => {
        it('桌面端走 openExternal', () => {
            const openExternal = vi.fn(async () => undefined)
            installElectronApi({ openExternal })
            const windowOpen = vi.spyOn(window, 'open').mockReturnValue(null)

            openExternalUrl('https://example.com')

            expect(openExternal).toHaveBeenCalledWith('https://example.com')
            expect(windowOpen).not.toHaveBeenCalled()
        })

        it('Web 端走 window.open 并带 noopener', () => {
            const windowOpen = vi.spyOn(window, 'open').mockReturnValue(null)

            openExternalUrl('https://example.com')

            expect(windowOpen).toHaveBeenCalledWith('https://example.com', '_blank', 'noopener,noreferrer')
        })
    })

    describe('listSystemFonts', () => {
        it('桌面端透传 IPC 结果', async () => {
            installElectronApi({ listSystemFonts: vi.fn(async () => ['Arial', 'SimSun']) })
            await expect(listSystemFonts()).resolves.toEqual(['Arial', 'SimSun'])
        })

        it('Web 端返回空数组', async () => {
            await expect(listSystemFonts()).resolves.toEqual([])
        })
    })

    describe('webdavSync', () => {
        it('桌面端透传方法与配置', async () => {
            const ipc = vi.fn(async () => ({ success: true, etag: 'v1' }))
            installElectronApi({ webdavSync: ipc })

            const result = await webdavSync('upload', { url: 'https://dav', username: 'u', password: 'p', data: 'x' })

            expect(result).toEqual({ success: true, etag: 'v1' })
            expect(ipc).toHaveBeenCalledWith('upload', { url: 'https://dav', username: 'u', password: 'p', data: 'x' })
        })

        it('Web 端返回结构化失败不抛异常', async () => {
            await expect(webdavSync('test', { url: 'https://dav', username: 'u', password: 'p' }))
                .resolves.toEqual({ success: false, error: WEBDAV_DESKTOP_ONLY_ERROR })
        })
    })

    describe('httpRequest', () => {
        it('桌面端走 translateRequest IPC', async () => {
            const translateRequest = vi.fn(async () => ({ success: true, status: 200, data: 'ok' }))
            installElectronApi({ translateRequest })

            const result = await httpRequest({ url: 'https://api', method: 'POST', body: '{}' })

            expect(result).toEqual({ success: true, status: 200, data: 'ok' })
            expect(translateRequest).toHaveBeenCalledWith({ url: 'https://api', method: 'POST', body: '{}' })
        })

        it('Web 端走 fetch 并映射成功结果', async () => {
            vi.stubGlobal('fetch', vi.fn(async () => new Response('payload', { status: 200 })))

            const result = await httpRequest({ url: 'https://api', method: 'GET' })

            expect(result).toEqual({ success: true, status: 200, data: 'payload' })
        })

        it('Web 端 fetch 非 2xx 映射为失败', async () => {
            vi.stubGlobal('fetch', vi.fn(async () => new Response('boom', { status: 500 })))

            const result = await httpRequest({ url: 'https://api' })

            expect(result).toEqual({ success: false, status: 500, data: 'boom', error: 'HTTP 500' })
        })
    })

    describe('safeStorage', () => {
        it('Web 端 isAvailable 恒为 false', async () => {
            await expect(safeStorageIsAvailable()).resolves.toBe(false)
        })

        it('桌面端 isAvailable 透传且异常兜底 false', async () => {
            installElectronApi({
                safeStorageEncrypt: vi.fn(),
                safeStorageIsAvailable: vi.fn(async () => true),
            })
            await expect(safeStorageIsAvailable()).resolves.toBe(true)

            installElectronApi({
                safeStorageEncrypt: vi.fn(),
                safeStorageIsAvailable: vi.fn(async () => { throw new Error('ipc down') }),
            })
            await expect(safeStorageIsAvailable()).resolves.toBe(false)
        })

        it('Web 端 encrypt/decrypt 拒绝并给出桌面限定错误', async () => {
            await expect(safeStorageEncrypt('secret')).rejects.toThrow(SAFE_STORAGE_DESKTOP_ONLY_ERROR)
            await expect(safeStorageDecrypt('cipher')).rejects.toThrow(SAFE_STORAGE_DESKTOP_ONLY_ERROR)
        })

        it('桌面端 encrypt/decrypt 透传', async () => {
            installElectronApi({
                safeStorageEncrypt: vi.fn(async (v: string) => `enc:${v}`),
                safeStorageDecrypt: vi.fn(async (v: string) => `dec:${v}`),
            })
            await expect(safeStorageEncrypt('secret')).resolves.toBe('enc:secret')
            await expect(safeStorageDecrypt('cipher')).resolves.toBe('dec:cipher')
        })
    })

    describe('getWindowFullscreenBridge', () => {
        it('Web 端返回 null', () => {
            expect(getWindowFullscreenBridge()).toBeNull()
        })

        it('桌面端 get/set/onChange 透传', async () => {
            const cleanup = vi.fn()
            const onWindowFullscreenChange = vi.fn(() => cleanup)
            installElectronApi({
                getWindowFullscreen: vi.fn(async () => true),
                setWindowFullscreen: vi.fn(async (enabled: boolean) => enabled),
                onWindowFullscreenChange,
            })

            const bridge = getWindowFullscreenBridge()
            expect(bridge).not.toBeNull()
            await expect(bridge?.get()).resolves.toBe(true)
            await expect(bridge?.set(false)).resolves.toBe(false)

            const listener = vi.fn()
            const remove = bridge?.onChange(listener)
            expect(onWindowFullscreenChange).toHaveBeenCalledWith(listener)
            remove?.()
            expect(cleanup).toHaveBeenCalled()
        })
    })

    describe('requestPersistentStorage', () => {
        const originalStorage = Object.getOwnPropertyDescriptor(Navigator.prototype, 'storage')
            ?? Object.getOwnPropertyDescriptor(navigator, 'storage')

        function installStorage(storage: unknown): void {
            Object.defineProperty(navigator, 'storage', { configurable: true, value: storage })
        }

        afterEach(() => {
            if (originalStorage) {
                Object.defineProperty(navigator, 'storage', originalStorage)
            } else {
                delete (navigator as unknown as Record<string, unknown>).storage
            }
        })

        it('无 storage.persist 能力时返回 false', async () => {
            installStorage(undefined)
            await expect(requestPersistentStorage()).resolves.toBe(false)
        })

        it('有能力时透传 persist 结果', async () => {
            const persist = vi.fn(async () => true)
            installStorage({ persist })
            await expect(requestPersistentStorage()).resolves.toBe(true)
            expect(persist).toHaveBeenCalledTimes(1)
        })

        it('persist 拒绝时兜底 false', async () => {
            installStorage({ persist: vi.fn(async () => { throw new Error('denied') }) })
            await expect(requestPersistentStorage()).resolves.toBe(false)
        })
    })
})
