import { useEffect, useState } from 'react'
import type { LibraryActiveNav, LibrarySortMode } from './useLibraryDerivedData'

export interface LibraryDialogState {
    open: boolean
    title: string
    message: string
    type: 'info' | 'confirm'
    confirmText: string
    cancelText: string
    onConfirm: (() => Promise<void> | void) | null
}

export interface LibraryContextMenuState {
    visible: boolean
    x: number
    y: number
    bookId: string | null
}

export interface LibraryBlankContextMenuState {
    visible: boolean
    x: number
    y: number
}

export function useLibraryViewState() {
    const [keyword, setKeyword] = useState('')
    const [showSettings, setShowSettings] = useState(false)
    const [activeNav, setActiveNav] = useState<LibraryActiveNav>('all')
    const [sortMode, setSortMode] = useState<LibrarySortMode>('lastRead')
    const [dialogState, setDialogState] = useState<LibraryDialogState>({
        open: false,
        title: '提示',
        message: '',
        type: 'info',
        confirmText: '确定',
        cancelText: '取消',
        onConfirm: null,
    })
    const [contextMenu, setContextMenu] = useState<LibraryContextMenuState>({
        visible: false,
        x: 0,
        y: 0,
        bookId: null,
    })
    const [blankContextMenu, setBlankContextMenu] = useState<LibraryBlankContextMenuState>({
        visible: false,
        x: 0,
        y: 0,
    })
    const [showBookPropertiesModal, setShowBookPropertiesModal] = useState<string | null>(null)
    const [scrollContainer, setScrollContainer] = useState<HTMLDivElement | null>(null)

    useEffect(() => {
        const closeMenu = () => {
            setContextMenu({ visible: false, x: 0, y: 0, bookId: null })
            setBlankContextMenu({ visible: false, x: 0, y: 0 })
        }
        document.addEventListener('click', closeMenu)
        return () => {
            document.removeEventListener('click', closeMenu)
        }
    }, [])

    const showInfoDialog = (message: string, title = '提示') => {
        setDialogState({
            open: true,
            title,
            message,
            type: 'info',
            confirmText: '确定',
            cancelText: '取消',
            onConfirm: null,
        })
    }

    const showConfirmDialog = (message: string, onConfirm: () => Promise<void> | void, title = '请确认') => {
        setDialogState({
            open: true,
            title,
            message,
            type: 'confirm',
            confirmText: '确定',
            cancelText: '取消',
            onConfirm,
        })
    }

    const closeDialog = () => {
        setDialogState((previous) => ({ ...previous, open: false, onConfirm: null }))
    }

    const handleDialogConfirm = async () => {
        const callback = dialogState.onConfirm
        closeDialog()
        if (!callback) return
        await callback()
    }

    const nextSortMode = () => {
        const order: LibrarySortMode[] = ['lastRead', 'addedAt', 'title', 'author']
        const index = order.indexOf(sortMode)
        setSortMode(order[(index + 1) % order.length])
    }

    return {
        keyword,
        setKeyword,
        showSettings,
        setShowSettings,
        activeNav,
        setActiveNav,
        sortMode,
        setSortMode,
        dialogState,
        setDialogState,
        contextMenu,
        setContextMenu,
        blankContextMenu,
        setBlankContextMenu,
        showBookPropertiesModal,
        setShowBookPropertiesModal,
        scrollContainer,
        setScrollContainer,
        showInfoDialog,
        showConfirmDialog,
        closeDialog,
        handleDialogConfirm,
        nextSortMode,
    }
}
