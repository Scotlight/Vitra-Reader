import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useLibraryBookActions } from '@/components/Library/libraryView/useLibraryBookActions'

function createOptions(overrides: Partial<Parameters<typeof useLibraryBookActions>[0]> = {}) {
    return {
        activeGroupId: null,
        activeNav: 'all' as const,
        books: [{ id: 'book-1', title: 'Book', author: 'Author', fileSize: 1, addedAt: 1 }],
        favoriteBookIds: ['book-1'],
        homeItemKeys: ['book:book-1', 'book:book-2'],
        persistFavorites: vi.fn(async () => undefined),
        persistTrash: vi.fn(async () => undefined),
        removeBook: vi.fn(async () => undefined),
        reorderActiveGroupBooks: vi.fn(async () => undefined),
        reorderHomeItems: vi.fn(async () => undefined),
        setBlankContextMenu: vi.fn(),
        setContextMenu: vi.fn(),
        setShowBookPropertiesModal: vi.fn(),
        showConfirmDialog: vi.fn(),
        showInfoDialog: vi.fn(),
        showMixedHome: true,
        trashBookIds: ['book-1'],
        ...overrides,
    }
}

describe('useLibraryBookActions', () => {
    afterEach(() => {
        cleanup()
        vi.clearAllMocks()
    })

    it('混合首页排序会携带当前 home key 顺序', () => {
        const options = createOptions()
        const { result } = renderHook(() => useLibraryBookActions(options))

        act(() => {
            result.current.handleGridReorder('book:book-2', 'book:book-1')
        })

        expect(options.reorderHomeItems).toHaveBeenCalledWith('book:book-2', 'book:book-1', [
            'book:book-1',
            'book:book-2',
        ])
        expect(options.reorderActiveGroupBooks).not.toHaveBeenCalled()
    })

    it('永久删除确认后同步清理收藏和回收站元数据', async () => {
        const options = createOptions()
        options.showConfirmDialog = vi.fn((_message, onConfirm) => {
            void onConfirm()
        })
        const { result } = renderHook(() => useLibraryBookActions(options))

        await act(async () => {
            result.current.handlePermanentDeleteBook('book-1')
        })

        expect(options.removeBook).toHaveBeenCalledWith('book-1')
        expect(options.persistFavorites).toHaveBeenCalledWith([])
        expect(options.persistTrash).toHaveBeenCalledWith([])
    })

    it('打开不存在图书属性时显示提示而不是打开弹窗', () => {
        const options = createOptions({ books: [] })
        const { result } = renderHook(() => useLibraryBookActions(options))

        act(() => {
            result.current.openBookPropertiesModal('missing')
        })

        expect(options.showInfoDialog).toHaveBeenCalledWith('未找到该图书')
        expect(options.setShowBookPropertiesModal).not.toHaveBeenCalled()
    })
})
