import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useLibraryImport } from '@/components/Library/libraryView/useLibraryImport'

function installElectronApi(api: Partial<Window['electronAPI']> | undefined): void {
    Object.defineProperty(window, 'electronAPI', {
        configurable: true,
        value: api,
    })
}

function findPickerInput(): HTMLInputElement | null {
    return document.body.querySelector('input[type="file"]')
}

function selectWebFiles(input: HTMLInputElement | null, files: File[]): void {
    Object.defineProperty(input, 'files', { configurable: true, value: files })
    input?.dispatchEvent(new Event('change'))
}

describe('useLibraryImport', () => {
    afterEach(() => {
        cleanup()
        vi.clearAllMocks()
        installElectronApi(undefined)
        document.body.innerHTML = ''
    })

    it('没有 Electron API 时走浏览器文件选择导入', async () => {
        const importBook = vi.fn(async () => undefined)
        const loadBooks = vi.fn(async () => undefined)
        const showInfoDialog = vi.fn()
        const { result } = renderHook(() => useLibraryImport({
            importBook,
            loadBooks,
            showInfoDialog,
        }))

        let invocation: Promise<void> = Promise.resolve()
        act(() => {
            invocation = result.current()
        })

        const input = findPickerInput()
        expect(input).not.toBeNull()

        await act(async () => {
            selectWebFiles(input, [new File([new Uint8Array([1, 2, 3])], 'b.epub')])
            await invocation
        })

        expect(importBook).toHaveBeenCalledWith({
            name: 'b.epub',
            path: '',
            data: expect.any(ArrayBuffer),
        }, { skipRefresh: true })
        expect(loadBooks).toHaveBeenCalledTimes(1)
        expect(showInfoDialog).not.toHaveBeenCalled()
    })

    it('浏览器导入单个文件失败时计数并提示', async () => {
        const importBook = vi.fn(async () => { throw new Error('parse failed') })
        const loadBooks = vi.fn(async () => undefined)
        const showInfoDialog = vi.fn()
        const { result } = renderHook(() => useLibraryImport({
            importBook,
            loadBooks,
            showInfoDialog,
        }))

        let invocation: Promise<void> = Promise.resolve()
        act(() => {
            invocation = result.current()
        })

        await act(async () => {
            selectWebFiles(findPickerInput(), [new File([new Uint8Array([9])], 'bad.epub')])
            await invocation
        })

        expect(loadBooks).toHaveBeenCalledTimes(1)
        expect(showInfoDialog).toHaveBeenCalledWith('导入完成：成功 0 本，失败 1 本。请查看控制台错误日志。')
    })

    it('浏览器取消选择时不导入不刷新', async () => {
        const importBook = vi.fn(async () => undefined)
        const loadBooks = vi.fn(async () => undefined)
        const { result } = renderHook(() => useLibraryImport({
            importBook,
            loadBooks,
            showInfoDialog: vi.fn(),
        }))

        let invocation: Promise<void> = Promise.resolve()
        act(() => {
            invocation = result.current()
        })

        await act(async () => {
            findPickerInput()?.dispatchEvent(new Event('cancel'))
            await invocation
        })

        expect(importBook).not.toHaveBeenCalled()
        expect(loadBooks).not.toHaveBeenCalled()
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

    it('文件选择对话框打开失败时提示导入失败', async () => {
        installElectronApi({
            openEpub: vi.fn(async () => { throw new Error('dialog crashed') }),
            readFile: vi.fn(),
        })
        const showInfoDialog = vi.fn()
        const { result } = renderHook(() => useLibraryImport({
            importBook: vi.fn(),
            loadBooks: vi.fn(),
            showInfoDialog,
        }))

        await act(async () => {
            await result.current()
        })

        expect(showInfoDialog).toHaveBeenCalledWith('导入失败：未能读取本地文件。请重试。')
    })
})
