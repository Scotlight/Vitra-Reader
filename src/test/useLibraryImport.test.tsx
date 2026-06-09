import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useLibraryImport } from '@/components/Library/libraryView/useLibraryImport'

function installElectronApi(api: Partial<Window['electronAPI']>): void {
    Object.defineProperty(window, 'electronAPI', {
        configurable: true,
        value: api,
    })
}

describe('useLibraryImport', () => {
    afterEach(() => {
        cleanup()
        vi.clearAllMocks()
        Object.defineProperty(window, 'electronAPI', {
            configurable: true,
            value: undefined,
        })
    })

    it('没有 Electron API 时显示运行环境提示', async () => {
        const showInfoDialog = vi.fn()
        const { result } = renderHook(() => useLibraryImport({
            importBook: vi.fn(),
            loadBooks: vi.fn(),
            showInfoDialog,
        }))

        await act(async () => {
            await result.current()
        })

        expect(showInfoDialog).toHaveBeenCalledWith('当前未检测到 Electron API。请通过 Electron 应用窗口运行，而不是浏览器直接访问。')
    })

    it('批量导入后统一刷新书库', async () => {
        installElectronApi({
            openEpub: vi.fn(async () => [{ name: 'a.epub', path: 'D:/books/a.epub', size: 4 }]),
            readFile: vi.fn(async () => new Uint8Array(4)),
        })
        const importBook = vi.fn(async () => undefined)
        const loadBooks = vi.fn(async () => undefined)
        const { result } = renderHook(() => useLibraryImport({
            importBook,
            loadBooks,
            showInfoDialog: vi.fn(),
        }))

        await act(async () => {
            await result.current()
        })

        expect(importBook).toHaveBeenCalledWith({
            name: 'a.epub',
            path: 'D:/books/a.epub',
            data: expect.any(Uint8Array),
        }, { skipRefresh: true })
        expect(loadBooks).toHaveBeenCalledTimes(1)
    })
})
