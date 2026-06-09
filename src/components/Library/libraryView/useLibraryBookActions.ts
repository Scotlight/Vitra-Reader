import { useCallback, type Dispatch, type MouseEvent as ReactMouseEvent, type SetStateAction } from 'react'
import type { BookMeta } from '@/services/storageService'
import type { LibraryActiveNav } from './useLibraryDerivedData'
import type { LibraryBlankContextMenuState, LibraryContextMenuState } from './useLibraryViewState'

interface UseLibraryBookActionsOptions {
    readonly activeGroupId: string | null
    readonly activeNav: LibraryActiveNav
    readonly books: BookMeta[]
    readonly favoriteBookIds: string[]
    readonly homeItemKeys: readonly string[]
    readonly persistFavorites: (ids: string[]) => Promise<void>
    readonly persistTrash: (ids: string[]) => Promise<void>
    readonly removeBook: (id: string) => Promise<void>
    readonly reorderActiveGroupBooks: (sourceKey: string, targetKey: string) => Promise<void>
    readonly reorderHomeItems: (sourceKey: string, targetKey: string, itemKeys: string[]) => Promise<void>
    readonly setBlankContextMenu: Dispatch<SetStateAction<LibraryBlankContextMenuState>>
    readonly setContextMenu: Dispatch<SetStateAction<LibraryContextMenuState>>
    readonly setShowBookPropertiesModal: Dispatch<SetStateAction<string | null>>
    readonly showConfirmDialog: (message: string, onConfirm: () => Promise<void> | void) => void
    readonly showInfoDialog: (message: string) => void
    readonly showMixedHome: boolean
    readonly trashBookIds: string[]
}

export function useLibraryBookActions({
    activeGroupId,
    activeNav,
    books,
    favoriteBookIds,
    homeItemKeys,
    persistFavorites,
    persistTrash,
    removeBook,
    reorderActiveGroupBooks,
    reorderHomeItems,
    setBlankContextMenu,
    setContextMenu,
    setShowBookPropertiesModal,
    showConfirmDialog,
    showInfoDialog,
    showMixedHome,
    trashBookIds,
}: UseLibraryBookActionsOptions) {
    const handleBookContextMenu = useCallback((event: ReactMouseEvent<HTMLElement>, bookId: string) => {
        event.preventDefault()
        event.stopPropagation()
        setBlankContextMenu({ visible: false, x: 0, y: 0 })
        setContextMenu({
            visible: true,
            x: event.clientX,
            y: event.clientY,
            bookId,
        })
    }, [setBlankContextMenu, setContextMenu])

    const handleBlankAreaContextMenu = useCallback((event: ReactMouseEvent<HTMLElement>) => {
        if (!(activeNav === 'all' && !activeGroupId)) return
        const target = event.target as HTMLElement | null
        if (target?.closest('[data-library-item="true"]')) return

        event.preventDefault()
        event.stopPropagation()
        setContextMenu({ visible: false, x: 0, y: 0, bookId: null })
        setBlankContextMenu({
            visible: true,
            x: event.clientX,
            y: event.clientY,
        })
    }, [activeGroupId, activeNav, setBlankContextMenu, setContextMenu])

    const handleGridReorder = useCallback((sourceKey: string, targetKey: string) => {
        if (showMixedHome) {
            void reorderHomeItems(sourceKey, targetKey, [...homeItemKeys])
            return
        }

        if (activeNav === 'all' && activeGroupId) {
            void reorderActiveGroupBooks(sourceKey, targetKey)
        }
    }, [
        activeGroupId,
        activeNav,
        homeItemKeys,
        reorderActiveGroupBooks,
        reorderHomeItems,
        showMixedHome,
    ])

    const handlePermanentDeleteBook = useCallback((bookId: string) => {
        showConfirmDialog('确认删除这本书吗？这会删除本地文件和阅读进度。', async () => {
            await removeBook(bookId)
            if (favoriteBookIds.includes(bookId)) {
                await persistFavorites(favoriteBookIds.filter((id) => id !== bookId))
            }
            if (trashBookIds.includes(bookId)) {
                await persistTrash(trashBookIds.filter((id) => id !== bookId))
            }
        })
    }, [
        favoriteBookIds,
        persistFavorites,
        persistTrash,
        removeBook,
        showConfirmDialog,
        trashBookIds,
    ])

    const openBookPropertiesModal = useCallback((bookId: string) => {
        const book = books.find((item) => item.id === bookId)
        if (!book) {
            showInfoDialog('未找到该图书')
            return
        }
        setShowBookPropertiesModal(bookId)
    }, [books, setShowBookPropertiesModal, showInfoDialog])

    return {
        handleBlankAreaContextMenu,
        handleBookContextMenu,
        handleGridReorder,
        handlePermanentDeleteBook,
        openBookPropertiesModal,
    }
}
