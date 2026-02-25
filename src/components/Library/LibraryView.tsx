import { useEffect, useMemo, useRef, useState, type ChangeEvent, type MouseEvent as ReactMouseEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useLibraryStore } from '../../stores/useLibraryStore'
import { useSettingsStore } from '../../stores/useSettingsStore'
import { useSyncStore } from '../../stores/useSyncStore'
import { db, type Highlight, type Bookmark, type BookMeta } from '../../services/storageService'
import {
    DEFAULT_TRANSLATE_CONFIG,
    clearTranslationCache,
    getProviderLabel,
    loadTranslateConfig,
    saveTranslateConfig,
    translateText,
    type TranslateConfig,
    type TranslateProvider,
} from '../../services/translateService'
import { parseBookMetadata } from '../../services/contentProviderFactory'
import heartIcon from '../../assets/icons/heart.svg'
import noteIcon from '../../assets/icons/note.svg'
import highlightIcon from '../../assets/icons/highlight.svg'
import trashIcon from '../../assets/icons/trash.svg'
import shelfAddIcon from '../../assets/icons/shelf-add.svg'
import shelfManageIcon from '../../assets/icons/shelf-manage.svg'
import settingsIcon from '../../assets/icons/settings.svg'
import searchIcon from '../../assets/icons/search.svg'
import sortIcon from '../../assets/icons/sort.svg'
import libraryIcon from '../../assets/icons/library.svg'
import refreshIcon from '../../assets/icons/refresh.svg'
import themeIcon from '../../assets/icons/theme.svg'
import chevronDownIcon from '../../assets/icons/chevron-down.svg'
import vitraLogo from '../../assets/icons/vitra-logo.svg'
import styles from './LibraryView.module.css'

type ShelfItem = {
    id: string
    name: string
}

type BookPropertiesDraft = {
    id: string
    title: string
    author: string
    description: string
    cover: string
}

const EMPTY_BOOK_PROPERTIES_DRAFT: BookPropertiesDraft = {
    id: '',
    title: '',
    author: '',
    description: '',
    cover: '',
}

export const LibraryView = ({ onOpenBook }: { onOpenBook: (id: string, jump?: { location: string; searchText?: string }) => void }) => {
    const { books, importBook, isLoading, loadBooks, removeBook } = useLibraryStore()
    const settings = useSettingsStore()
    const [keyword, setKeyword] = useState('')
    const [showSettings, setShowSettings] = useState(false)
    const [settingsTab, setSettingsTab] = useState<'theme' | 'ui' | 'reading' | 'sync' | 'translate'>('theme')
    const [progressMap, setProgressMap] = useState<Record<string, number>>({})
    const [activeNav, setActiveNav] = useState<'all' | 'fav' | 'notes' | 'highlight' | 'trash'>('all')
    const [sortMode, setSortMode] = useState<'lastRead' | 'addedAt' | 'title' | 'author'>('lastRead')
    const [systemFonts, setSystemFonts] = useState<string[]>(['系统默认'])
    const [loadingFonts, setLoadingFonts] = useState(false)
    const [favoriteBookIds, setFavoriteBookIds] = useState<string[]>([])
    const [trashBookIds, setTrashBookIds] = useState<string[]>([])
    const [noteBookIds, setNoteBookIds] = useState<string[]>([])
    const [highlightBookIds, setHighlightBookIds] = useState<string[]>([])
    const [allHighlights, setAllHighlights] = useState<Highlight[]>([])
    const [allBookmarks, setAllBookmarks] = useState<Bookmark[]>([])
    const [shelves, setShelves] = useState<ShelfItem[]>([])
    const [shelfBookMap, setShelfBookMap] = useState<Record<string, string[]>>({})
    const [activeShelfId, setActiveShelfId] = useState<string | null>(null)
    const [expandedShelves, setExpandedShelves] = useState<Record<string, boolean>>({})
    const [showCreateShelfModal, setShowCreateShelfModal] = useState(false)
    const [newShelfName, setNewShelfName] = useState('')
    const [showManageShelfModal, setShowManageShelfModal] = useState(false)
    const [manageSourceShelfId, setManageSourceShelfId] = useState<string>('')
    const [manageTargetShelfId, setManageTargetShelfId] = useState<string>('')
    const [dialogState, setDialogState] = useState<{
        open: boolean
        title: string
        message: string
        type: 'info' | 'confirm'
        confirmText: string
        cancelText: string
        onConfirm: (() => Promise<void> | void) | null
    }>({
        open: false,
        title: '提示',
        message: '',
        type: 'info',
        confirmText: '确定',
        cancelText: '取消',
        onConfirm: null,
    })
    const [contextMenu, setContextMenu] = useState<{ visible: boolean; x: number; y: number; bookId: string | null }>({
        visible: false,
        x: 0,
        y: 0,
        bookId: null,
    })
    const syncStore = useSyncStore()
    const [translateConfig, setTranslateConfig] = useState<TranslateConfig>(DEFAULT_TRANSLATE_CONFIG)
    const [translateSaving, setTranslateSaving] = useState(false)
    const [translateTesting, setTranslateTesting] = useState(false)
    const [translateStatus, setTranslateStatus] = useState('')
    const [showBookPropertiesModal, setShowBookPropertiesModal] = useState(false)
    const [bookPropertiesDraft, setBookPropertiesDraft] = useState<BookPropertiesDraft>(EMPTY_BOOK_PROPERTIES_DRAFT)
    const [bookPropertiesSaving, setBookPropertiesSaving] = useState(false)
    const [bookPropertiesStatus, setBookPropertiesStatus] = useState('')
    const bookCoverInputRef = useRef<HTMLInputElement | null>(null)

    // Temporary color state for text color picker (only text color needs delay)
    const [tempTextColor, setTempTextColor] = useState<string | null>(null)
    const safeFontFamily = typeof settings.fontFamily === 'string' ? settings.fontFamily : 'inherit'
    const selectedFontValue =
        safeFontFamily === 'inherit'
            ? '系统默认'
            : safeFontFamily.replace(/^"([^"]+)".*$/, '$1')

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
        setDialogState((prev) => ({ ...prev, open: false, onConfirm: null }))
    }

    const handleDialogConfirm = async () => {
        const callback = dialogState.onConfirm
        closeDialog()
        if (!callback) return
        await callback()
    }

    useEffect(() => {
        void loadBooks()
    }, [loadBooks])

    useEffect(() => {
        const loadProgress = async () => {
            const allProgress = await db.progress.toArray()
            const map = allProgress.reduce<Record<string, number>>((acc, item) => {
                acc[item.bookId] = Math.round((item.percentage || 0) * 100)
                return acc
            }, {})
            setProgressMap(map)
        }
        void loadProgress()
        const handleFocus = () => {
            void loadProgress()
        }
        document.addEventListener('visibilitychange', handleFocus)
        window.addEventListener('focus', handleFocus)
        return () => {
            document.removeEventListener('visibilitychange', handleFocus)
            window.removeEventListener('focus', handleFocus)
        }
    }, [books])

    useEffect(() => {
        void syncStore.loadConfig()
    }, [])

    useEffect(() => {
        const loadTranslationConfig = async () => {
            const config = await loadTranslateConfig()
            setTranslateConfig(config)
        }
        void loadTranslationConfig()
    }, [])

    useEffect(() => {
        const loadFavorites = async () => {
            const entry = await db.settings.get('favoriteBookIds')
            const value = entry?.value
            if (Array.isArray(value)) {
                setFavoriteBookIds(value.map((item) => String(item)))
            } else {
                setFavoriteBookIds([])
            }
        }
        void loadFavorites()
    }, [])

    useEffect(() => {
        const loadTrash = async () => {
            const entry = await db.settings.get('trashBookIds')
            const value = entry?.value
            if (Array.isArray(value)) {
                setTrashBookIds(value.map((item) => String(item)))
            } else {
                setTrashBookIds([])
            }
        }
        void loadTrash()
    }, [])

    useEffect(() => {
        const loadBookUsage = async () => {
            const [bookmarks, highlights] = await Promise.all([
                db.bookmarks.toArray(),
                db.highlights.toArray(),
            ])
            setNoteBookIds(Array.from(new Set(bookmarks.map((item) => item.bookId))))
            setHighlightBookIds(Array.from(new Set(highlights.map((item) => item.bookId))))
            setAllHighlights(highlights)
            setAllBookmarks(bookmarks)
        }
        void loadBookUsage()
    }, [books])

    useEffect(() => {
        const loadShelves = async () => {
            const [shelvesEntry, mapEntry] = await Promise.all([
                db.settings.get('shelves'),
                db.settings.get('shelfBookMap'),
            ])
            const shelvesValue = shelvesEntry?.value
            const mapValue = mapEntry?.value
            if (Array.isArray(shelvesValue)) {
                const normalized = shelvesValue
                    .map((item) => {
                        const value = item as Partial<ShelfItem>
                        return {
                            id: String(value.id || ''),
                            name: String(value.name || ''),
                        }
                    })
                    .filter((item) => item.id && item.name)
                setShelves(normalized)
            } else {
                setShelves([])
            }
            if (mapValue && typeof mapValue === 'object' && !Array.isArray(mapValue)) {
                const normalized: Record<string, string[]> = {}
                Object.entries(mapValue as Record<string, unknown>).forEach(([key, value]) => {
                    if (!Array.isArray(value)) return
                    normalized[key] = value.map((bookId) => String(bookId))
                })
                setShelfBookMap(normalized)
            } else {
                setShelfBookMap({})
            }
        }
        void loadShelves()
    }, [])

    useEffect(() => {
        const closeMenu = () => {
            setContextMenu({ visible: false, x: 0, y: 0, bookId: null })
        }
        document.addEventListener('click', closeMenu)
        return () => {
            document.removeEventListener('click', closeMenu)
        }
    }, [])

    useEffect(() => {
        const loadFonts = async () => {
            if (!window.electronAPI?.listSystemFonts) return
            setLoadingFonts(true)
            try {
                const fonts = await window.electronAPI.listSystemFonts()
                if (!fonts || fonts.length === 0) {
                    setSystemFonts(['系统默认', '微软雅黑', '宋体', '楷体', '黑体', '仿宋'])
                } else {
                    setSystemFonts(['系统默认', ...fonts])
                }
            } catch {
                setSystemFonts(['系统默认', '微软雅黑', '宋体', '楷体', '黑体', '仿宋'])
            } finally {
                setLoadingFonts(false)
            }
        }
        void loadFonts()
    }, [])

    useEffect(() => {
        if (shelves.length === 0 && activeShelfId) {
            setActiveShelfId(null)
            return
        }
        if (activeShelfId && !shelves.some((shelf) => shelf.id === activeShelfId)) {
            setActiveShelfId(null)
        }
        if (shelves.length > 0) {
            if (!manageSourceShelfId || !shelves.some((item) => item.id === manageSourceShelfId)) {
                setManageSourceShelfId(shelves[0].id)
            }
            if (!manageTargetShelfId || !shelves.some((item) => item.id === manageTargetShelfId)) {
                setManageTargetShelfId(shelves[0].id)
            }
        } else {
            setManageSourceShelfId('')
            setManageTargetShelfId('')
        }

        setExpandedShelves((prev) => {
            const existingIds = new Set(shelves.map((shelf) => shelf.id))
            const next: Record<string, boolean> = {}
            shelves.forEach((shelf) => {
                next[shelf.id] = prev[shelf.id] ?? false
            })
            const changed = Object.keys(prev).some((id) => !existingIds.has(id))
            return changed ? next : { ...next }
        })
    }, [activeShelfId, shelves])

    useEffect(() => {
        const validBookIds = new Set(books.map((book) => book.id))
        let changed = false
        const nextMap: Record<string, string[]> = {}
        Object.entries(shelfBookMap).forEach(([shelfId, bookIds]) => {
            const filtered = bookIds.filter((bookId) => validBookIds.has(bookId))
            nextMap[shelfId] = filtered
            if (filtered.length !== bookIds.length) changed = true
        })
        if (!changed) return
        setShelfBookMap(nextMap)
        void db.settings.put({ key: 'shelfBookMap', value: nextMap })
    }, [books, shelfBookMap])

    const favoriteBookIdSet = useMemo(() => new Set(favoriteBookIds), [favoriteBookIds])
    const trashBookIdSet = useMemo(() => new Set(trashBookIds), [trashBookIds])
    const noteBookIdSet = useMemo(() => new Set(noteBookIds), [noteBookIds])
    const highlightBookIdSet = useMemo(() => new Set(highlightBookIds), [highlightBookIds])
    const activeShelfBookIdSet = useMemo(() => {
        if (!(activeNav === 'all' && activeShelfId)) return null
        return new Set(shelfBookMap[activeShelfId] || [])
    }, [activeNav, activeShelfId, shelfBookMap])

    const filteredBooks = useMemo(() => {
        const q = keyword.trim().toLowerCase()
        const sourceBase = !q
            ? books
            : books.filter((book) => {
            return book.title.toLowerCase().includes(q) || book.author.toLowerCase().includes(q)
        })
        const source = activeNav === 'trash'
            ? sourceBase.filter((book) => trashBookIdSet.has(book.id))
            : sourceBase.filter((book) => !trashBookIdSet.has(book.id))

        const navFiltered =
            activeNav === 'fav'
                ? source.filter((book) => favoriteBookIdSet.has(book.id))
                : activeNav === 'notes'
                    ? source.filter((book) => noteBookIdSet.has(book.id))
                    : activeNav === 'highlight'
                        ? source.filter((book) => highlightBookIdSet.has(book.id))
                        : source

        const shelfFiltered = activeNav === 'all' && activeShelfId
            ? navFiltered.filter((book) => activeShelfBookIdSet?.has(book.id))
            : navFiltered

        const sorted = [...shelfFiltered].sort((a, b) => {
            if (sortMode === 'title') return a.title.localeCompare(b.title, 'zh-CN')
            if (sortMode === 'author') return a.author.localeCompare(b.author, 'zh-CN')
            if (sortMode === 'addedAt') return (b.addedAt || 0) - (a.addedAt || 0)
            return (b.lastReadAt || 0) - (a.lastReadAt || 0)
        })
        return sorted
    }, [books, keyword, sortMode, activeNav, activeShelfId, favoriteBookIdSet, trashBookIdSet, noteBookIdSet, highlightBookIdSet, activeShelfBookIdSet])

    const visibleBooks = useMemo(() => {
        if (!(activeNav === 'all' && !activeShelfId)) return filteredBooks
        const groupedIds = new Set<string>()
        Object.values(shelfBookMap).forEach((bookIds) => {
            bookIds.forEach((bookId) => groupedIds.add(bookId))
        })
        return filteredBooks.filter((book) => !groupedIds.has(book.id))
    }, [activeNav, activeShelfId, filteredBooks, shelfBookMap])

    const bookById = useMemo(() => {
        const map = new Map<string, (typeof books)[number]>()
        books.forEach((book) => map.set(book.id, book))
        return map
    }, [books])

    const groupedHighlights = useMemo(() => {
        const map = new Map<string, Highlight[]>()
        allHighlights.forEach((h) => {
            if (!map.has(h.bookId)) map.set(h.bookId, [])
            map.get(h.bookId)!.push(h)
        })
        return Array.from(map.entries())
            .map(([bookId, items]) => ({
                bookId,
                bookTitle: bookById.get(bookId)?.title ?? '未知书籍',
                items: items.sort((a, b) => b.createdAt - a.createdAt),
            }))
            .sort((a, b) => b.items[0].createdAt - a.items[0].createdAt)
    }, [allHighlights, bookById])

    const groupedBookmarks = useMemo(() => {
        const map = new Map<string, Bookmark[]>()
        allBookmarks.forEach((b) => {
            if (!map.has(b.bookId)) map.set(b.bookId, [])
            map.get(b.bookId)!.push(b)
        })
        return Array.from(map.entries())
            .map(([bookId, items]) => ({
                bookId,
                bookTitle: bookById.get(bookId)?.title ?? '未知书籍',
                items: items.sort((a, b) => b.createdAt - a.createdAt),
            }))
            .sort((a, b) => b.items[0].createdAt - a.items[0].createdAt)
    }, [allBookmarks, bookById])

    const shelfGroups = useMemo(() => {
        return shelves
            .map((shelf) => {
                const shelfBooks = (shelfBookMap[shelf.id] || [])
                    .map((bookId) => bookById.get(bookId))
                    .filter((book): book is NonNullable<typeof book> => Boolean(book))
                    .filter((book) => !trashBookIdSet.has(book.id))
                return {
                    id: shelf.id,
                    name: shelf.name,
                    books: shelfBooks,
                }
            })
            .filter((group) => group.books.length > 0)
    }, [shelves, shelfBookMap, bookById, trashBookIdSet])

    const nextSortMode = () => {
        const order: Array<typeof sortMode> = ['lastRead', 'addedAt', 'title', 'author']
        const idx = order.indexOf(sortMode)
        setSortMode(order[(idx + 1) % order.length])
    }

    const sortModeLabel = sortMode === 'lastRead'
        ? '最近阅读'
        : sortMode === 'addedAt'
            ? '最近导入'
            : sortMode === 'title'
                ? '书名'
                : '作者'

    const toggleShelfExpanded = (shelfId: string) => {
        setExpandedShelves((prev) => ({ ...prev, [shelfId]: !prev[shelfId] }))
    }

    const persistFavorites = async (next: string[]) => {
        setFavoriteBookIds(next)
        await db.settings.put({ key: 'favoriteBookIds', value: next })
    }

    const persistTrash = async (next: string[]) => {
        setTrashBookIds(next)
        await db.settings.put({ key: 'trashBookIds', value: next })
    }

    const persistShelves = async (next: ShelfItem[]) => {
        setShelves(next)
        await db.settings.put({ key: 'shelves', value: next })
    }

    const persistShelfBookMap = async (next: Record<string, string[]>) => {
        setShelfBookMap(next)
        await db.settings.put({ key: 'shelfBookMap', value: next })
    }

    const toggleFavorite = async (bookId: string) => {
        const exists = favoriteBookIds.includes(bookId)
        const next = exists ? favoriteBookIds.filter((id) => id !== bookId) : [...favoriteBookIds, bookId]
        await persistFavorites(next)
    }

    const moveToTrash = async (bookId: string) => {
        if (trashBookIds.includes(bookId)) return
        await persistTrash([...trashBookIds, bookId])
        if (favoriteBookIds.includes(bookId)) {
            await persistFavorites(favoriteBookIds.filter((id) => id !== bookId))
        }
    }

    const restoreFromTrash = async (bookId: string) => {
        await persistTrash(trashBookIds.filter((id) => id !== bookId))
    }

    const buildDefaultShelfName = () => {
        const base = '新书架'
        let index = 1
        let nextName = base
        const existed = new Set(shelves.map((shelf) => shelf.name))
        while (existed.has(nextName)) {
            index += 1
            nextName = `${base}${index}`
        }
        return nextName
    }

    const openCreateShelfModal = () => {
        setNewShelfName(buildDefaultShelfName())
        setShowCreateShelfModal(true)
    }

    const createShelf = async () => {
        const finalName = newShelfName.trim()
        if (!finalName) {
            showInfoDialog('书架名称不能为空')
            return
        }
        if (shelves.some((shelf) => shelf.name === finalName)) {
            showInfoDialog('书架名称已存在')
            return
        }

        const newShelf: ShelfItem = { id: crypto.randomUUID(), name: finalName }
        const nextShelves = [...shelves, newShelf]
        await persistShelves(nextShelves)
        await persistShelfBookMap({ ...shelfBookMap, [newShelf.id]: [] })
        setActiveShelfId(newShelf.id)
        setShowCreateShelfModal(false)
    }

    const openManageShelfModal = () => {
        if (shelves.length === 0) {
            showInfoDialog('当前没有书架，请先新建书架。')
            return
        }
        setShowManageShelfModal(true)
    }

    const renameShelf = async (shelfId: string, nextNameRaw: string) => {
        const nextName = nextNameRaw.trim()
        if (!nextName) return
        const duplicated = shelves.some((item) => item.id !== shelfId && item.name === nextName)
        if (duplicated) {
            showInfoDialog('书架名称已存在')
            return
        }
        const nextShelves = shelves.map((item) => (item.id === shelfId ? { ...item, name: nextName } : item))
        await persistShelves(nextShelves)
    }

    const dissolveShelf = (shelfId: string) => {
        showConfirmDialog('确认解散该书架？（不会删除书籍）', async () => {
            const nextShelves = shelves.filter((item) => item.id !== shelfId)
            const nextMap = { ...shelfBookMap }
            delete nextMap[shelfId]
            await persistShelves(nextShelves)
            await persistShelfBookMap(nextMap)
            if (activeShelfId === shelfId) setActiveShelfId(null)
        })
    }

    const moveShelfBooks = async (fromShelfId: string, toShelfId: string) => {
        if (!fromShelfId || !toShelfId || fromShelfId === toShelfId) return
        const sourceIds = shelfBookMap[fromShelfId] || []
        const targetIds = shelfBookMap[toShelfId] || []
        const merged = Array.from(new Set([...targetIds, ...sourceIds]))
        await persistShelfBookMap({
            ...shelfBookMap,
            [fromShelfId]: [],
            [toShelfId]: merged,
        })
    }

    const addBookToShelf = async (bookId: string) => {
        if (shelves.length === 0) {
            showInfoDialog('请先新建书架')
            return
        }
        const shelf = activeShelfId
            ? shelves.find((item) => item.id === activeShelfId) || shelves[0]
            : shelves[0]
        const ids = shelfBookMap[shelf.id] || []
        if (ids.includes(bookId)) return
        await persistShelfBookMap({
            ...shelfBookMap,
            [shelf.id]: [...ids, bookId],
        })
    }

    const removeBookFromActiveShelf = async (bookId: string) => {
        if (!activeShelfId) return
        const ids = shelfBookMap[activeShelfId] || []
        if (!ids.includes(bookId)) return
        await persistShelfBookMap({
            ...shelfBookMap,
            [activeShelfId]: ids.filter((id) => id !== bookId),
        })
    }

    const handleBookContextMenu = (event: ReactMouseEvent<HTMLElement>, bookId: string) => {
        event.preventDefault()
        event.stopPropagation()
        setContextMenu({
            visible: true,
            x: event.clientX,
            y: event.clientY,
            bookId,
        })
    }

    const handlePermanentDeleteBook = (bookId: string) => {
        showConfirmDialog('确认删除这本书吗？这会删除本地文件和阅读进度。', async () => {
            await removeBook(bookId)
            if (favoriteBookIds.includes(bookId)) {
                await persistFavorites(favoriteBookIds.filter((id) => id !== bookId))
            }
            if (trashBookIds.includes(bookId)) {
                await persistTrash(trashBookIds.filter((id) => id !== bookId))
            }
        })
    }

    const openBookPropertiesModal = (bookId: string) => {
        const book = books.find((item) => item.id === bookId)
        if (!book) {
            showInfoDialog('未找到该图书')
            return
        }

        setBookPropertiesDraft({
            id: book.id,
            title: book.title || '',
            author: book.author || '',
            description: book.description || '',
            cover: book.cover || '',
        })
        setBookPropertiesStatus('')
        setShowBookPropertiesModal(true)
    }

    const closeBookPropertiesModal = (force = false) => {
        if (bookPropertiesSaving && !force) return
        setShowBookPropertiesModal(false)
        setBookPropertiesStatus('')
        setBookPropertiesDraft(EMPTY_BOOK_PROPERTIES_DRAFT)
        if (bookCoverInputRef.current) {
            bookCoverInputRef.current.value = ''
        }
    }

    const getDefaultBookProperties = (book: BookMeta) => {
        return {
            title: (book.originalTitle || book.title || '').trim(),
            author: (book.originalAuthor || book.author || '未知作者').trim() || '未知作者',
            description: book.originalDescription ?? book.description ?? '',
            cover: book.originalCover ?? book.cover ?? '',
        }
    }

    const handleRestoreBookProperties = async () => {
        if (!bookPropertiesDraft.id) return
        const book = books.find((item) => item.id === bookPropertiesDraft.id)
        if (!book) {
            setBookPropertiesStatus('未找到图书，无法恢复默认')
            return
        }

        setBookPropertiesStatus('恢复默认中...')

        let defaults = getDefaultBookProperties(book)
        const hasOriginalSnapshot = Boolean(
            book.originalTitle
            || book.originalAuthor
            || book.originalDescription !== undefined
            || book.originalCover !== undefined
        )

        if (!hasOriginalSnapshot) {
            try {
                const file = await db.bookFiles.get(book.id)
                if (file?.data) {
                    const format = book.format || 'epub'
                    const parsed = await parseBookMetadata(format, file.data, `${book.title || 'book'}.${format}`)
                    defaults = {
                        title: (parsed.title || defaults.title || '').trim(),
                        author: (parsed.author || defaults.author || '未知作者').trim() || '未知作者',
                        description: (parsed as any).description || '',
                        cover: (parsed as any).cover || '',
                    }
                }
            } catch {
                // fallback to current/original snapshot
            }
        }

        setBookPropertiesDraft((prev) => ({
            ...prev,
            title: defaults.title,
            author: defaults.author,
            description: defaults.description,
            cover: defaults.cover,
        }))
        setBookPropertiesStatus('已恢复默认值（点击“保存属性”生效）')
    }

    const fileToDataUrl = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => {
                if (typeof reader.result === 'string') {
                    resolve(reader.result)
                    return
                }
                reject(new Error('封面读取失败'))
            }
            reader.onerror = () => reject(new Error('封面读取失败'))
            reader.readAsDataURL(file)
        })
    }

    const handleBookCoverFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0]
        if (!file) return

        try {
            const coverDataUrl = await fileToDataUrl(file)
            setBookPropertiesDraft((prev) => ({ ...prev, cover: coverDataUrl }))
            setBookPropertiesStatus('')
        } catch (error: any) {
            setBookPropertiesStatus(`封面读取失败: ${error?.message || error}`)
        } finally {
            event.target.value = ''
        }
    }

    const handleSaveBookProperties = async () => {
        if (!bookPropertiesDraft.id) return

        const title = bookPropertiesDraft.title.trim()
        if (!title) {
            setBookPropertiesStatus('书名不能为空')
            return
        }

        const author = bookPropertiesDraft.author.trim() || '未知作者'
        const description = bookPropertiesDraft.description.trim()
        const currentBook = books.find((item) => item.id === bookPropertiesDraft.id)
        const patch: Partial<BookMeta> = {
            title,
            author,
            cover: bookPropertiesDraft.cover,
            description,
        }
        if (currentBook) {
            if (!currentBook.originalTitle) patch.originalTitle = currentBook.title || title
            if (!currentBook.originalAuthor) patch.originalAuthor = currentBook.author || author
            if (currentBook.originalDescription === undefined) patch.originalDescription = currentBook.description || ''
            if (currentBook.originalCover === undefined) patch.originalCover = currentBook.cover || ''
        }

        setBookPropertiesSaving(true)
        setBookPropertiesStatus('保存中...')
        try {
            await db.books.update(bookPropertiesDraft.id, patch)
            await loadBooks()
            closeBookPropertiesModal(true)
        } catch (error: any) {
            setBookPropertiesStatus(`保存失败: ${error?.message || error}`)
        } finally {
            setBookPropertiesSaving(false)
        }
    }

    const handleImport = async () => {
        if (!window.electronAPI) {
            showInfoDialog('当前未检测到 Electron API。请通过 Electron 应用窗口运行，而不是浏览器直接访问。')
            return
        }

        try {
            const files = await window.electronAPI.openEpub()
            if (!files.length) return

            let failed = 0
            for (const file of files) {
                try {
                    const binary = await window.electronAPI.readFile(file.path)
                    await importBook({
                        name: file.name,
                        path: file.path,
                        data: binary,
                    }, { skipRefresh: true })
                } catch (error) {
                    failed += 1
                    console.error(`Failed to import book: ${file.name}`, error)
                }
            }

            await loadBooks()

            if (failed > 0) {
                showInfoDialog(`导入完成：成功 ${files.length - failed} 本，失败 ${failed} 本。请查看控制台错误日志。`)
            }
        } catch (error) {
            console.error('Import flow failed:', error)
            showInfoDialog('导入失败：未能读取本地文件。请重试。')
        }
    }

    const handleSaveTranslateConfig = async () => {
        setTranslateSaving(true)
        setTranslateStatus('保存翻译配置中...')
        try {
            const saved = await saveTranslateConfig(translateConfig)
            setTranslateConfig(saved)
            setTranslateStatus('翻译配置已保存')
        } catch (error: any) {
            setTranslateStatus(`保存失败: ${error?.message || error}`)
        } finally {
            setTranslateSaving(false)
        }
    }

    const handleTestTranslate = async () => {
        setTranslateTesting(true)
        setTranslateStatus('测试翻译中...')
        try {
            const result = await translateText('Hello world', translateConfig)
            if (!result.ok) {
                setTranslateStatus(`测试失败: ${result.error || '未知错误'}`)
                return
            }
            setTranslateStatus(`测试成功 (${getProviderLabel(result.provider)}${result.fromCache ? '，缓存命中' : ''}): ${result.translatedText}`)
        } catch (error: any) {
            setTranslateStatus(`测试失败: ${error?.message || error}`)
        } finally {
            setTranslateTesting(false)
        }
    }

    const handleClearTranslationCache = async () => {
        try {
            await clearTranslationCache()
            setTranslateStatus('翻译缓存已清空')
        } catch (error: any) {
            setTranslateStatus(`清空缓存失败: ${error?.message || error}`)
        }
    }

    // Animation variants
    const container = {
        hidden: { opacity: 0 },
        show: {
            opacity: 1,
            transition: {
                staggerChildren: 0.05
            }
        }
    }

    const item = {
        hidden: { y: 20, opacity: 0 },
        show: { y: 0, opacity: 1 }
    }

    const Icon = ({ src, className }: { src: string; className?: string }) => (
        <img className={className} src={src} alt="" />
    )

    return (
        <div className={styles.libraryContainer}>
            <aside className={styles.sidebar}>
                <div className={styles.brand}>
                    <img className={styles.brandLogo} src={vitraLogo} alt="Vitra Reader" />
                    <span className={styles.brandText}>Vitra</span>
                </div>
                <button
                    className={`${styles.navItem} ${activeNav === 'all' ? styles.active : ''}`}
                    onClick={() => {
                        setActiveNav('all')
                        setActiveShelfId(null)
                    }}
                >
                    <Icon className={styles.navIcon} src={libraryIcon} />全部图书
                </button>
                <button className={`${styles.navItem} ${activeNav === 'fav' ? styles.active : ''}`} onClick={() => setActiveNav('fav')}><Icon className={styles.navIcon} src={heartIcon} />我的喜爱</button>
                <button className={`${styles.navItem} ${activeNav === 'notes' ? styles.active : ''}`} onClick={() => setActiveNav('notes')}><Icon className={styles.navIcon} src={noteIcon} />我的笔记</button>
                <button className={`${styles.navItem} ${activeNav === 'highlight' ? styles.active : ''}`} onClick={() => setActiveNav('highlight')}><Icon className={styles.navIcon} src={highlightIcon} />我的高亮</button>
                <button className={`${styles.navItem} ${activeNav === 'trash' ? styles.active : ''}`} onClick={() => setActiveNav('trash')}><Icon className={styles.navIcon} src={trashIcon} />我的回收</button>
                <div className={styles.shelfTitle}>我的书架</div>
                <button className={styles.navItem} onClick={openCreateShelfModal}><Icon className={styles.navIcon} src={shelfAddIcon} />新建书架</button>
                <button className={styles.navItem} onClick={openManageShelfModal}><Icon className={styles.navIcon} src={shelfManageIcon} />管理书架</button>
                <div className={styles.shelfTree}>
                    {shelves.map((shelf) => (
                        <div key={shelf.id} className={styles.shelfNode}>
                            <div className={`${styles.shelfNodeRow} ${activeShelfId === shelf.id ? styles.shelfNodeRowActive : ''}`}>
                                <button
                                    className={styles.shelfExpandBtn}
                                    onClick={() => toggleShelfExpanded(shelf.id)}
                                    title={expandedShelves[shelf.id] ? '收起' : '展开'}
                                >
                                    {expandedShelves[shelf.id] ? '▾' : '▸'}
                                </button>
                                <button
                                    className={styles.shelfItem}
                                    onClick={() => {
                                        setActiveShelfId(shelf.id)
                                        setActiveNav('all')
                                    }}
                                    title={shelf.name}
                                >
                                    {shelf.name}
                                </button>
                            </div>
                            {expandedShelves[shelf.id] && (
                                <div className={styles.shelfChildren}>
                                    {((shelfBookMap[shelf.id] || [])
                                        .map((bookId) => bookById.get(bookId))
                                        .filter((book): book is NonNullable<typeof book> => Boolean(book))
                                    ).length === 0 ? (
                                        <div className={styles.shelfChildEmpty}>空书架</div>
                                    ) : (
                                        (shelfBookMap[shelf.id] || [])
                                            .map((bookId) => bookById.get(bookId))
                                            .filter((book): book is NonNullable<typeof book> => Boolean(book))
                                            .map((book) => (
                                                <button
                                                    key={book.id}
                                                    className={styles.shelfChildBook}
                                                    title={book.title}
                                                    onClick={() => onOpenBook(book.id)}
                                                    onContextMenu={(event) => handleBookContextMenu(event, book.id)}
                                                >
                                                    {book.title}
                                                </button>
                                            ))
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
                <button className={styles.navItemBottom} onClick={() => setShowSettings((value) => !value)}>
                    <Icon className={styles.navIcon} src={settingsIcon} />设置
                </button>
            </aside>

            <section className={styles.content}>
                <header className={styles.topbar}>
                    <div className={styles.searchWrap}>
                        <input
                            className={styles.searchInput}
                            placeholder="搜索我的书库"
                            value={keyword}
                            onChange={(event) => setKeyword(event.target.value)}
                        />
                        <Icon className={styles.searchIcon} src={searchIcon} />
                    </div>

                    <div className={styles.actions}>
                        <button className={styles.iconBtn} title={`排序：${sortModeLabel}`} onClick={nextSortMode}>
                            <Icon className={styles.actionIcon} src={sortIcon} />
                            <span>{sortModeLabel}</span>
                        </button>
                        <button className={styles.iconBtn} title="刷新" onClick={() => void loadBooks()}><Icon className={styles.actionIcon} src={refreshIcon} /></button>
                        <button
                            className={styles.iconBtn}
                            title="主题切换"
                            onClick={() => settings.updateSetting('themeId', settings.themeId === 'dark' ? 'light' : 'dark')}
                        >
                            <Icon className={styles.actionIcon} src={themeIcon} />
                        </button>
                        <motion.button
                            className={styles.importBtn}
                            whileHover={{ scale: 1.03 }}
                            whileTap={{ scale: 0.97 }}
                            onClick={handleImport}
                            disabled={isLoading}
                        >
                            {isLoading ? '导入中...' : '导入图书'}
                            <Icon className={styles.importArrow} src={chevronDownIcon} />
                        </motion.button>
                    </div>
                </header>

                {showSettings && (
                    <div className={styles.settingsModalOverlay} onClick={() => setShowSettings(false)}>
                        <div className={styles.settingsPanel} onClick={(event) => event.stopPropagation()}>
                            <div className={styles.settingsHeader}>
                                <h3>主界面设置</h3>
                                <button className={styles.closeBtn} onClick={() => setShowSettings(false)}>×</button>
                            </div>
                        <div className={styles.tabRow}>
                            <button className={`${styles.tabBtn} ${settingsTab === 'theme' ? styles.tabBtnActive : ''}`} onClick={() => setSettingsTab('theme')}>主题</button>
                            <button className={`${styles.tabBtn} ${settingsTab === 'ui' ? styles.tabBtnActive : ''}`} onClick={() => setSettingsTab('ui')}>界面</button>
                            <button className={`${styles.tabBtn} ${settingsTab === 'reading' ? styles.tabBtnActive : ''}`} onClick={() => setSettingsTab('reading')}>阅读</button>
                            <button className={`${styles.tabBtn} ${settingsTab === 'sync' ? styles.tabBtnActive : ''}`} onClick={() => setSettingsTab('sync')}>同步和备份</button>
                            <button className={`${styles.tabBtn} ${settingsTab === 'translate' ? styles.tabBtnActive : ''}`} onClick={() => setSettingsTab('translate')}>翻译</button>
                        </div>

                        {settingsTab === 'theme' && (
                            <>
                                <div className={styles.themeRow}>
                                    <button
                                        className={`${styles.themeBtn} ${settings.themeId === 'light' ? styles.activeTheme : ''}`}
                                        style={{ background: '#ffffff' }}
                                        onClick={() => settings.updateSetting('themeId', 'light')}
                                        title="浅色"
                                    />
                                    <button
                                        className={`${styles.themeBtn} ${settings.themeId === 'dark' ? styles.activeTheme : ''}`}
                                        style={{ background: '#1a1a2e' }}
                                        onClick={() => settings.updateSetting('themeId', 'dark')}
                                        title="深色"
                                    />
                                    <button
                                        className={`${styles.themeBtn} ${settings.themeId === 'sepia' ? styles.activeTheme : ''}`}
                                        style={{ background: '#f4ecd8' }}
                                        onClick={() => settings.updateSetting('themeId', 'sepia')}
                                        title="护眼"
                                    />
                                    <button
                                        className={`${styles.themeBtn} ${settings.themeId === 'green' ? styles.activeTheme : ''}`}
                                        style={{ background: '#c7edcc' }}
                                        onClick={() => settings.updateSetting('themeId', 'green')}
                                        title="绿色"
                                    />
                                </div>
                                <label className={styles.settingRow}>
                                    <span>背景色</span>
                                    <input
                                        type="color"
                                        value={settings.customBgColor ?? '#ffffff'}
                                        onChange={(event) => settings.updateSetting('customBgColor', event.target.value)}
                                    />
                                </label>
                                <label className={styles.settingRow}>
                                    <span>文字色</span>
                                    <input
                                        type="color"
                                        value={tempTextColor ?? settings.customTextColor ?? '#1a1a1a'}
                                        onChange={(event) => setTempTextColor(event.target.value)}
                                        onMouseUp={(event) => {
                                            const target = event.target as HTMLInputElement
                                            settings.updateSetting('customTextColor', target.value)
                                            setTempTextColor(null)
                                        }}
                                    />
                                </label>
                                <div className={styles.rowActions}>
                                    <button className={styles.smallBtn} onClick={() => {
                                        settings.updateSetting('customBgColor', null)
                                    }}>重置背景色</button>
                                    <button className={styles.smallBtn} onClick={() => {
                                        settings.updateSetting('customTextColor', null)
                                        setTempTextColor(null)
                                    }}>重置文字色</button>
                                </div>
                            </>
                        )}

                        {settingsTab === 'ui' && (
                            <>
                                <label className={styles.settingRow}>
                                    <span>圆角</span>
                                    <input
                                        type="range"
                                        min={0}
                                        max={24}
                                        value={settings.uiRoundness}
                                        onChange={(event) => settings.updateSetting('uiRoundness', Number(event.target.value))}
                                    />
                                </label>
                                <label className={styles.settingRow}>
                                    <span>毛玻璃强度</span>
                                    <input
                                        type="range"
                                        min={0}
                                        max={40}
                                        value={settings.uiBlurStrength}
                                        onChange={(event) => settings.updateSetting('uiBlurStrength', Number(event.target.value))}
                                    />
                                </label>
                                <label className={styles.settingRow}>
                                    <span>透明度</span>
                                    <input
                                        type="range"
                                        min={0.4}
                                        max={1}
                                        step={0.05}
                                        value={settings.uiOpacity}
                                        onChange={(event) => settings.updateSetting('uiOpacity', Number(event.target.value))}
                                    />
                                </label>
                                <label className={styles.settingRow}>
                                    <span>界面材质</span>
                                    <select
                                        value={settings.uiMaterial}
                                        onChange={(event) => settings.updateSetting('uiMaterial', event.target.value as typeof settings.uiMaterial)}
                                    >
                                        <option value="default">默认</option>
                                        <option value="mica">Mica</option>
                                        <option value="acrylic">Acrylic</option>
                                    </select>
                                </label>
                                <label className={styles.settingRow}>
                                    <span>界面动画</span>
                                    <input
                                        type="checkbox"
                                        checked={settings.uiAnimation}
                                        onChange={(event) => settings.updateSetting('uiAnimation', event.target.checked)}
                                    />
                                </label>
                            </>
                        )}

                        {settingsTab === 'reading' && (
                            <>
                                <label className={styles.settingRow}>
                                    <span>字体</span>
                                    {loadingFonts ? (
                                        <span className={styles.fontLoading}>加载字体中...</span>
                                    ) : (
                                        <select
                                            value={selectedFontValue}
                                            onChange={(event) => {
                                                const selected = event.target.value
                                                if (selected === '系统默认') {
                                                    settings.updateSetting('fontFamily', 'inherit')
                                                } else {
                                                    settings.updateSetting('fontFamily', `"${selected}", sans-serif`)
                                                }
                                            }}
                                        >
                                            {systemFonts.map((font) => (
                                                <option key={font} value={font}>{font}</option>
                                            ))}
                                        </select>
                                    )}
                                </label>
                                <label className={styles.settingRow}>
                                    <span>{`字号 ${settings.fontSize}px`}</span>
                                    <input
                                        type="range"
                                        min={13}
                                        max={40}
                                        value={settings.fontSize}
                                        onChange={(event) => settings.updateSetting('fontSize', Number(event.target.value))}
                                    />
                                </label>
                                <label className={styles.settingRow}>
                                    <span>{`行距 ${settings.lineHeight.toFixed(1)}`}</span>
                                    <input
                                        type="range"
                                        min={1}
                                        max={3.5}
                                        step={0.1}
                                        value={settings.lineHeight}
                                        onChange={(event) => settings.updateSetting('lineHeight', Number(event.target.value))}
                                    />
                                </label>
                                <label className={styles.settingRow}>
                                    <span>{`字距 ${settings.letterSpacing}px`}</span>
                                    <input
                                        type="range"
                                        min={0}
                                        max={20}
                                        value={settings.letterSpacing}
                                        onChange={(event) => settings.updateSetting('letterSpacing', Number(event.target.value))}
                                    />
                                </label>
                                <label className={styles.settingRow}>
                                    <span>{`段距 ${settings.paragraphSpacing}px`}</span>
                                    <input
                                        type="range"
                                        min={0}
                                        max={100}
                                        value={settings.paragraphSpacing}
                                        onChange={(event) => settings.updateSetting('paragraphSpacing', Number(event.target.value))}
                                    />
                                </label>
                                <label className={styles.settingRow}>
                                    <span>{`页面宽度 ${settings.pageWidth.toFixed(1)}x`}</span>
                                    <input
                                        type="range"
                                        min={0.5}
                                        max={3}
                                        step={0.1}
                                        value={settings.pageWidth}
                                        onChange={(event) => settings.updateSetting('pageWidth', Number(event.target.value))}
                                    />
                                </label>
                                <label className={styles.settingRow}>
                                    <span>{`屏幕亮度 ${Math.round(settings.brightness * 100)}%`}</span>
                                    <input
                                        type="range"
                                        min={0.3}
                                        max={1}
                                        step={0.05}
                                        value={settings.brightness}
                                        onChange={(event) => settings.updateSetting('brightness', Number(event.target.value))}
                                    />
                                </label>
                                <label className={styles.settingRow}>
                                    <span>文字对齐</span>
                                    <select
                                        value={settings.textAlign}
                                        onChange={(event) => settings.updateSetting('textAlign', event.target.value as typeof settings.textAlign)}
                                    >
                                        <option value="left">左对齐</option>
                                        <option value="justify">两端对齐</option>
                                        <option value="center">居中</option>
                                    </select>
                                </label>
                                <label className={styles.settingRow}>
                                    <span>翻页模式</span>
                                    <select
                                        value={settings.pageTurnMode}
                                        onChange={(event) => settings.updateSetting('pageTurnMode', event.target.value as typeof settings.pageTurnMode)}
                                    >
                                        <option value="paginated-single">单页</option>
                                        <option value="paginated-double">双页</option>
                                        <option value="scrolled-continuous">连续滚动</option>
                                    </select>
                                </label>
                                <label className={styles.settingRow}>
                                    <span>翻页动画</span>
                                    <select
                                        value={settings.pageTurnAnimation}
                                        onChange={(event) => settings.updateSetting('pageTurnAnimation', event.target.value as typeof settings.pageTurnAnimation)}
                                    >
                                        <option value="slide">滑动</option>
                                        <option value="fade">渐变</option>
                                        <option value="none">无</option>
                                    </select>
                                </label>
                            </>
                        )}

                        {settingsTab === 'sync' && (
                            <div className={styles.syncPanel}>
                                <label className={styles.settingRow}>
                                    <span>同步模式</span>
                                    <select
                                        value={syncStore.syncMode}
                                        onChange={(event) => void syncStore.setConfig({ syncMode: event.target.value as 'full' | 'data' | 'files' })}
                                    >
                                        <option value="full">完整备份（文件+数据+设置）</option>
                                        <option value="data">仅数据（进度/笔记/设置）</option>
                                        <option value="files">仅文件（书籍实体文件）</option>
                                    </select>
                                </label>
                                <label className={styles.settingRow}>
                                    <span>恢复模式</span>
                                    <select
                                        value={syncStore.restoreMode}
                                        onChange={(event) => void syncStore.setConfig({ restoreMode: event.target.value as 'auto' | 'full' | 'data' | 'files' })}
                                    >
                                        <option value="auto">自动（跟随备份包）</option>
                                        <option value="full">强制完整恢复</option>
                                        <option value="data">强制仅数据恢复</option>
                                        <option value="files">强制仅文件恢复</option>
                                    </select>
                                </label>
                                <label className={styles.settingRow}>
                                    <span>恢复前处理</span>
                                    <label className={styles.checkboxRow}>
                                        <input
                                            type="checkbox"
                                            checked={syncStore.replaceBeforeRestore}
                                            onChange={(event) => void syncStore.setConfig({ replaceBeforeRestore: event.target.checked })}
                                        />
                                        先清空对应本地数据
                                    </label>
                                </label>
                                <label className={styles.settingRow}>
                                    <span>服务器地址</span>
                                    <input
                                        className={styles.textInput}
                                        type="text"
                                        placeholder="示例: https://example.com/dav"
                                        value={syncStore.webdavUrl}
                                        onChange={(event) => void syncStore.setConfig({ webdavUrl: event.target.value })}
                                    />
                                </label>
                                <label className={styles.settingRow}>
                                    <span>服务器文件夹</span>
                                    <input
                                        className={styles.textInput}
                                        type="text"
                                        placeholder="示例: VitraReader 或 backups/reader"
                                        value={syncStore.webdavPath}
                                        onChange={(event) => void syncStore.setConfig({ webdavPath: event.target.value })}
                                    />
                                </label>
                                <label className={styles.settingRow}>
                                    <span>用户名</span>
                                    <input
                                        className={styles.textInput}
                                        type="text"
                                        value={syncStore.webdavUser}
                                        onChange={(event) => void syncStore.setConfig({ webdavUser: event.target.value })}
                                    />
                                </label>
                                <label className={styles.settingRow}>
                                    <span>密码</span>
                                    <input
                                        className={styles.textInput}
                                        type="password"
                                        value={syncStore.webdavPass}
                                        onChange={(event) => void syncStore.setConfig({ webdavPass: event.target.value })}
                                    />
                                </label>

                                <div className={styles.syncActions}>
                                    <button className={styles.smallBtn} onClick={() => void syncStore.testConnection()} disabled={syncStore.isTesting}>
                                        {syncStore.isTesting ? '测试中...' : '测试'}
                                    </button>
                                    <button className={styles.smallBtn} onClick={() => void syncStore.restoreData()} disabled={syncStore.isRestoring}>
                                        {syncStore.isRestoring ? '恢复中...' : '恢复'}
                                    </button>
                                    <button className={styles.syncPrimaryBtn} onClick={() => void syncStore.syncData()} disabled={syncStore.isSyncing}>
                                        {syncStore.isSyncing ? '同步中...' : '绑定并同步'}
                                    </button>
                                </div>
                                {syncStore.syncStatus && <div className={styles.syncStatus}>{syncStore.syncStatus}</div>}
                                {syncStore.lastSyncTime && (
                                    <div className={styles.syncStatus}>
                                        上次同步: {new Date(syncStore.lastSyncTime).toLocaleString()}
                                    </div>
                                )}

                            </div>
                        )}

                        {settingsTab === 'translate' && (
                            <div className={styles.syncPanel}>
                                <div className={styles.syncStatus} style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                                    翻译服务配置（OpenAI/Gemini/Claude/Ollama/DeepL/DeepLX 兼容）
                                </div>
                                <label className={styles.settingRow}>
                                    <span>翻译 Provider</span>
                                    <select
                                        value={translateConfig.provider}
                                        onChange={(event) => setTranslateConfig((prev) => ({ ...prev, provider: event.target.value as TranslateProvider }))}
                                    >
                                        <option value="openai">OpenAI兼容</option>
                                        <option value="gemini">Gemini兼容</option>
                                        <option value="claude">Claude兼容</option>
                                        <option value="ollama">Ollama兼容</option>
                                        <option value="deepl">DeepL 官方</option>
                                        <option value="deeplx">DeepLX兼容</option>
                                    </select>
                                </label>
                                <label className={styles.settingRow}>
                                    <span>源语言</span>
                                    <input
                                        className={styles.textInput}
                                        type="text"
                                        value={translateConfig.sourceLang}
                                        placeholder="auto"
                                        onChange={(event) => setTranslateConfig((prev) => ({ ...prev, sourceLang: event.target.value }))}
                                    />
                                </label>
                                <label className={styles.settingRow}>
                                    <span>目标语言</span>
                                    <input
                                        className={styles.textInput}
                                        type="text"
                                        value={translateConfig.targetLang}
                                        placeholder="zh-CN"
                                        onChange={(event) => setTranslateConfig((prev) => ({ ...prev, targetLang: event.target.value }))}
                                    />
                                </label>

                                {translateConfig.provider === 'deepl' && (
                                    <>
                                        <label className={styles.settingRow}>
                                            <span>DeepL API Key</span>
                                            <input
                                                className={styles.textInput}
                                                type="password"
                                                value={translateConfig.deeplApiKey}
                                                onChange={(event) => setTranslateConfig((prev) => ({ ...prev, deeplApiKey: event.target.value }))}
                                            />
                                        </label>
                                        <label className={styles.settingRow}>
                                            <span>DeepL Endpoint</span>
                                            <input
                                                className={styles.textInput}
                                                type="text"
                                                value={translateConfig.deeplEndpoint}
                                                onChange={(event) => setTranslateConfig((prev) => ({ ...prev, deeplEndpoint: event.target.value }))}
                                            />
                                        </label>
                                    </>
                                )}

                                {translateConfig.provider === 'openai' && (
                                    <>
                                        <label className={styles.settingRow}>
                                            <span>OpenAI兼容 API Key</span>
                                            <input
                                                className={styles.textInput}
                                                type="password"
                                                value={translateConfig.openaiApiKey}
                                                onChange={(event) => setTranslateConfig((prev) => ({ ...prev, openaiApiKey: event.target.value }))}
                                            />
                                        </label>
                                        <label className={styles.settingRow}>
                                            <span>OpenAI兼容 Endpoint</span>
                                            <input
                                                className={styles.textInput}
                                                type="text"
                                                value={translateConfig.openaiEndpoint}
                                                onChange={(event) => setTranslateConfig((prev) => ({ ...prev, openaiEndpoint: event.target.value }))}
                                            />
                                        </label>
                                        <label className={styles.settingRow}>
                                            <span>Model</span>
                                            <input
                                                className={styles.textInput}
                                                type="text"
                                                value={translateConfig.openaiModel}
                                                onChange={(event) => setTranslateConfig((prev) => ({ ...prev, openaiModel: event.target.value }))}
                                            />
                                        </label>
                                    </>
                                )}

                                {translateConfig.provider === 'gemini' && (
                                    <>
                                        <label className={styles.settingRow}>
                                            <span>Gemini API Key</span>
                                            <input
                                                className={styles.textInput}
                                                type="password"
                                                value={translateConfig.geminiApiKey}
                                                onChange={(event) => setTranslateConfig((prev) => ({ ...prev, geminiApiKey: event.target.value }))}
                                            />
                                        </label>
                                        <label className={styles.settingRow}>
                                            <span>Gemini Endpoint</span>
                                            <input
                                                className={styles.textInput}
                                                type="text"
                                                value={translateConfig.geminiEndpoint}
                                                onChange={(event) => setTranslateConfig((prev) => ({ ...prev, geminiEndpoint: event.target.value }))}
                                            />
                                        </label>
                                        <label className={styles.settingRow}>
                                            <span>Gemini Model</span>
                                            <input
                                                className={styles.textInput}
                                                type="text"
                                                value={translateConfig.geminiModel}
                                                onChange={(event) => setTranslateConfig((prev) => ({ ...prev, geminiModel: event.target.value }))}
                                            />
                                        </label>
                                    </>
                                )}

                                {translateConfig.provider === 'claude' && (
                                    <>
                                        <label className={styles.settingRow}>
                                            <span>Claude API Key</span>
                                            <input
                                                className={styles.textInput}
                                                type="password"
                                                value={translateConfig.claudeApiKey}
                                                onChange={(event) => setTranslateConfig((prev) => ({ ...prev, claudeApiKey: event.target.value }))}
                                            />
                                        </label>
                                        <label className={styles.settingRow}>
                                            <span>Claude Endpoint</span>
                                            <input
                                                className={styles.textInput}
                                                type="text"
                                                value={translateConfig.claudeEndpoint}
                                                onChange={(event) => setTranslateConfig((prev) => ({ ...prev, claudeEndpoint: event.target.value }))}
                                            />
                                        </label>
                                        <label className={styles.settingRow}>
                                            <span>Claude Model</span>
                                            <input
                                                className={styles.textInput}
                                                type="text"
                                                value={translateConfig.claudeModel}
                                                onChange={(event) => setTranslateConfig((prev) => ({ ...prev, claudeModel: event.target.value }))}
                                            />
                                        </label>
                                    </>
                                )}

                                {translateConfig.provider === 'ollama' && (
                                    <>
                                        <label className={styles.settingRow}>
                                            <span>Ollama Endpoint</span>
                                            <input
                                                className={styles.textInput}
                                                type="text"
                                                value={translateConfig.ollamaEndpoint}
                                                onChange={(event) => setTranslateConfig((prev) => ({ ...prev, ollamaEndpoint: event.target.value }))}
                                            />
                                        </label>
                                        <label className={styles.settingRow}>
                                            <span>Ollama Model</span>
                                            <input
                                                className={styles.textInput}
                                                type="text"
                                                value={translateConfig.ollamaModel}
                                                onChange={(event) => setTranslateConfig((prev) => ({ ...prev, ollamaModel: event.target.value }))}
                                            />
                                        </label>
                                    </>
                                )}

                                {translateConfig.provider === 'deeplx' && (
                                    <>
                                        <label className={styles.settingRow}>
                                            <span>DeepLX Endpoint</span>
                                            <input
                                                className={styles.textInput}
                                                type="text"
                                                value={translateConfig.deeplxEndpoint}
                                                onChange={(event) => setTranslateConfig((prev) => ({ ...prev, deeplxEndpoint: event.target.value }))}
                                            />
                                        </label>
                                    </>
                                )}

                                <label className={styles.settingRow}>
                                    <span>启用缓存</span>
                                    <label className={styles.checkboxRow}>
                                        <input
                                            type="checkbox"
                                            checked={translateConfig.cacheEnabled}
                                            onChange={(event) => setTranslateConfig((prev) => ({ ...prev, cacheEnabled: event.target.checked }))}
                                        />
                                        本地缓存翻译结果
                                    </label>
                                </label>
                                <label className={styles.settingRow}>
                                    <span>缓存时长(小时)</span>
                                    <input
                                        className={styles.textInput}
                                        type="number"
                                        min={1}
                                        max={24 * 365}
                                        value={translateConfig.cacheTtlHours}
                                        onChange={(event) => setTranslateConfig((prev) => ({ ...prev, cacheTtlHours: Number(event.target.value) || prev.cacheTtlHours }))}
                                    />
                                </label>
                                <label className={styles.settingRow}>
                                    <span>缓存上限</span>
                                    <input
                                        className={styles.textInput}
                                        type="number"
                                        min={50}
                                        max={5000}
                                        value={translateConfig.cacheMaxEntries}
                                        onChange={(event) => setTranslateConfig((prev) => ({ ...prev, cacheMaxEntries: Number(event.target.value) || prev.cacheMaxEntries }))}
                                    />
                                </label>
                                <div className={styles.syncActions}>
                                    <button className={styles.smallBtn} onClick={handleSaveTranslateConfig} disabled={translateSaving}>
                                        {translateSaving ? '保存中...' : '保存翻译配置'}
                                    </button>
                                    <button className={styles.smallBtn} onClick={handleTestTranslate} disabled={translateTesting}>
                                        {translateTesting ? '测试中...' : '测试翻译'}
                                    </button>
                                    <button className={styles.smallBtn} onClick={() => void handleClearTranslationCache()}>
                                        清空缓存
                                    </button>
                                </div>
                                {translateStatus && <div className={styles.syncStatus}>{translateStatus}</div>}
                            </div>
                        )}
                        <div className={styles.rowActions}>
                            <button className={styles.smallBtn} onClick={settings.resetToDefaults}>恢复默认设置</button>
                        </div>
                    </div>
                    </div>
                )}

                {showBookPropertiesModal && (
                    <div className={styles.settingsModalOverlay} onClick={() => closeBookPropertiesModal()}>
                        <div className={`${styles.dialogPanel} ${styles.bookPropertiesPanel}`} onClick={(event) => event.stopPropagation()}>
                            <div className={styles.settingsHeader}>
                                <h3>图书属性</h3>
                                <button className={styles.closeBtn} onClick={() => closeBookPropertiesModal()}>×</button>
                            </div>

                            <div className={styles.bookPropertiesBody}>
                                <div className={styles.bookCoverEditor}>
                                    <div className={styles.bookCoverPreview}>
                                        {bookPropertiesDraft.cover ? (
                                            <img src={bookPropertiesDraft.cover} alt={bookPropertiesDraft.title || '封面'} />
                                        ) : (
                                            <div className={styles.placeholderCover}>
                                                <span>EPUB</span>
                                            </div>
                                        )}
                                    </div>
                                    <div className={styles.rowActions}>
                                        <input
                                            ref={bookCoverInputRef}
                                            type="file"
                                            accept="image/*"
                                            className={styles.hiddenFileInput}
                                            onChange={(event) => void handleBookCoverFileChange(event)}
                                        />
                                        <button className={styles.smallBtn} onClick={() => bookCoverInputRef.current?.click()}>
                                            更换封面
                                        </button>
                                        <button
                                            className={styles.smallBtn}
                                            onClick={() => setBookPropertiesDraft((prev) => ({ ...prev, cover: '' }))}
                                        >
                                            移除封面
                                        </button>
                                    </div>
                                </div>

                                <label className={styles.settingRow}>
                                    <span>书名</span>
                                    <input
                                        className={styles.textInput}
                                        type="text"
                                        value={bookPropertiesDraft.title}
                                        onChange={(event) => setBookPropertiesDraft((prev) => ({ ...prev, title: event.target.value }))}
                                    />
                                </label>

                                <label className={styles.settingRow}>
                                    <span>作者</span>
                                    <input
                                        className={styles.textInput}
                                        type="text"
                                        value={bookPropertiesDraft.author}
                                        onChange={(event) => setBookPropertiesDraft((prev) => ({ ...prev, author: event.target.value }))}
                                    />
                                </label>

                                <label className={`${styles.settingRow} ${styles.settingRowTop}`}>
                                    <span>简介</span>
                                    <textarea
                                        className={styles.textAreaInput}
                                        value={bookPropertiesDraft.description}
                                        placeholder="输入图书简介..."
                                        onChange={(event) => setBookPropertiesDraft((prev) => ({ ...prev, description: event.target.value }))}
                                    />
                                </label>
                            </div>

                            {bookPropertiesStatus && <div className={styles.syncStatus}>{bookPropertiesStatus}</div>}
                            <div className={styles.rowActions}>
                                <button className={styles.smallBtn} onClick={() => void handleRestoreBookProperties()} disabled={bookPropertiesSaving}>恢复默认</button>
                                <button className={styles.smallBtn} onClick={() => closeBookPropertiesModal()} disabled={bookPropertiesSaving}>取消</button>
                                <button className={styles.syncPrimaryBtn} onClick={() => void handleSaveBookProperties()} disabled={bookPropertiesSaving}>
                                    {bookPropertiesSaving ? '保存中...' : '保存属性'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {showCreateShelfModal && (
                    <div className={styles.settingsModalOverlay} onClick={() => setShowCreateShelfModal(false)}>
                        <div className={styles.dialogPanel} onClick={(event) => event.stopPropagation()}>
                            <div className={styles.settingsHeader}>
                                <h3>新建书架</h3>
                                <button className={styles.closeBtn} onClick={() => setShowCreateShelfModal(false)}>×</button>
                            </div>
                            <label className={styles.settingRow}>
                                <span>书架名称</span>
                                <input
                                    className={styles.textInput}
                                    type="text"
                                    value={newShelfName}
                                    onChange={(event) => setNewShelfName(event.target.value)}
                                />
                            </label>
                            <div className={styles.rowActions}>
                                <button className={styles.smallBtn} onClick={() => setShowCreateShelfModal(false)}>取消</button>
                                <button className={styles.syncPrimaryBtn} onClick={() => void createShelf()}>创建</button>
                            </div>
                        </div>
                    </div>
                )}

                {showManageShelfModal && (
                    <div className={styles.settingsModalOverlay} onClick={() => setShowManageShelfModal(false)}>
                        <div className={styles.dialogPanel} onClick={(event) => event.stopPropagation()}>
                            <div className={styles.settingsHeader}>
                                <h3>管理书架</h3>
                                <button className={styles.closeBtn} onClick={() => setShowManageShelfModal(false)}>×</button>
                            </div>
                            <div className={styles.manageShelfList}>
                                {shelves.map((shelf) => (
                                    <div key={shelf.id} className={styles.manageShelfRow}>
                                        <input
                                            className={styles.textInput}
                                            defaultValue={shelf.name}
                                            onBlur={(event) => void renameShelf(shelf.id, event.target.value)}
                                        />
                                        <button className={styles.smallBtn} onClick={() => void dissolveShelf(shelf.id)}>解散</button>
                                    </div>
                                ))}
                            </div>
                            {shelves.length > 1 && (
                                <div className={styles.manageMovePanel}>
                                    <label className={styles.settingRow}>
                                        <span>来源书架</span>
                                        <select value={manageSourceShelfId} onChange={(event) => setManageSourceShelfId(event.target.value)}>
                                            {shelves.map((shelf) => (
                                                <option key={shelf.id} value={shelf.id}>{shelf.name}</option>
                                            ))}
                                        </select>
                                    </label>
                                    <label className={styles.settingRow}>
                                        <span>目标书架</span>
                                        <select value={manageTargetShelfId} onChange={(event) => setManageTargetShelfId(event.target.value)}>
                                            {shelves.map((shelf) => (
                                                <option key={shelf.id} value={shelf.id}>{shelf.name}</option>
                                            ))}
                                        </select>
                                    </label>
                                    <div className={styles.rowActions}>
                                        <button className={styles.syncPrimaryBtn} onClick={() => void moveShelfBooks(manageSourceShelfId, manageTargetShelfId)}>
                                            移动全部图书
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {dialogState.open && (
                    <div className={styles.settingsModalOverlay} onClick={closeDialog}>
                        <div className={styles.dialogPanel} onClick={(event) => event.stopPropagation()}>
                            <div className={styles.settingsHeader}>
                                <h3>{dialogState.title}</h3>
                                <button className={styles.closeBtn} onClick={closeDialog}>×</button>
                            </div>
                            <p className={styles.dialogMessage}>{dialogState.message}</p>
                            <div className={styles.rowActions}>
                                {dialogState.type === 'confirm' && (
                                    <button className={styles.smallBtn} onClick={closeDialog}>{dialogState.cancelText}</button>
                                )}
                                <button className={styles.syncPrimaryBtn} onClick={() => void handleDialogConfirm()}>{dialogState.confirmText}</button>
                            </div>
                        </div>
                    </div>
                )}

                <div className={styles.statusLine}>
                    <span>{activeNav === 'highlight' ? `${allHighlights.length} 条高亮` : activeNav === 'notes' ? `${allBookmarks.length} 条笔记` : `${visibleBooks.length} 本书`}</span>
                </div>

                <div className={styles.scrollArea}>
                    {(activeNav === 'highlight' || activeNav === 'notes') ? (
                        <div className={styles.annotationGroups}>
                            {(activeNav === 'highlight' ? groupedHighlights : groupedBookmarks).length === 0 ? (
                                <div className={styles.emptyState}>
                                    <motion.p initial={{ opacity: 0 }} animate={{ opacity: 0.5 }} transition={{ delay: 0.2 }}>
                                        {activeNav === 'highlight' ? '还没有高亮标注。' : '还没有笔记。'}
                                    </motion.p>
                                </div>
                            ) : (activeNav === 'highlight' ? groupedHighlights : []).map((group) => (
                                <div key={group.bookId} className={styles.annotationGroup}>
                                    <button className={styles.annotationGroupTitle} onClick={() => onOpenBook(group.bookId)}>
                                        <span>{group.bookTitle}</span>
                                        <span className={styles.annotationCount}>{group.items.length}</span>
                                    </button>
                                    {group.items.map((h) => (
                                        <div key={h.id} className={styles.annotationEntry} onClick={() => onOpenBook(group.bookId, { location: h.cfiRange, searchText: h.text })} style={{ cursor: 'pointer' }}>
                                            <span className={styles.highlightBar} style={{ background: h.color }} />
                                            <span className={styles.annotationText}>{h.text}</span>
                                            <span className={styles.annotationDate}>{new Date(h.createdAt).toLocaleDateString()}</span>
                                        </div>
                                    ))}
                                </div>
                            ))}
                            {activeNav === 'notes' && groupedBookmarks.map((group) => (
                                <div key={group.bookId} className={styles.annotationGroup}>
                                    <button className={styles.annotationGroupTitle} onClick={() => onOpenBook(group.bookId)}>
                                        <span>{group.bookTitle}</span>
                                        <span className={styles.annotationCount}>{group.items.length}</span>
                                    </button>
                                    {group.items.map((b) => (
                                        <div key={b.id} className={styles.annotationEntry} onClick={() => onOpenBook(group.bookId, { location: b.location, searchText: b.title })} style={{ cursor: 'pointer' }}>
                                            <span className={styles.noteIcon}>📝</span>
                                            <div className={styles.noteContent}>
                                                {b.title && <span className={styles.noteQuote}>{b.title}</span>}
                                                {b.note && <span className={styles.noteBody}>{b.note}</span>}
                                            </div>
                                            <span className={styles.annotationDate}>{new Date(b.createdAt).toLocaleDateString()}</span>
                                        </div>
                                    ))}
                                </div>
                            ))}
                        </div>
                    ) : (
                    <>
                    {activeNav === 'all' && !activeShelfId && shelfGroups.length > 0 && (
                        <div className={styles.shelfGroups}>
                            {shelfGroups.map((group) => (
                                <button
                                    key={group.id}
                                    className={styles.shelfGroupCard}
                                    onClick={() => setActiveShelfId(group.id)}
                                    title={`${group.name}（${group.books.length} 本）`}
                                >
                                    <div className={styles.shelfGroupCovers}>
                                        {group.books.slice(0, 4).map((book) => (
                                            <div key={book.id} className={styles.shelfGroupCover}>
                                                {book.cover ? (
                                                    <img src={book.cover} alt={book.title} />
                                                ) : (
                                                    <span>EPUB</span>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                    <div className={styles.shelfGroupMeta}>
                                        <strong>{group.name}</strong>
                                        <span>{group.books.length} 本</span>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                    {visibleBooks.length === 0 ? (
                    <div className={styles.emptyState}>
                        <motion.p
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 0.5 }}
                            transition={{ delay: 0.2 }}
                        >
                            书架空空如也，导入一本书开始阅读吧。
                        </motion.p>
                    </div>
                    ) : (
                        <motion.div
                            className={styles.grid}
                            variants={container}
                            initial="hidden"
                            animate="show"
                        >
                            <AnimatePresence mode="popLayout">
                                {visibleBooks.map((book) => (
                                    <motion.div
                                        key={book.id}
                                        className={styles.card}
                                        variants={item}
                                        layout
                                        whileHover={{ y: -5, boxShadow: '0 8px 30px rgba(0,0,0,0.12)' }}
                                        onClick={() => onOpenBook(book.id)}
                                        onContextMenu={(event) => handleBookContextMenu(event, book.id)}
                                    >
                                        <div className={styles.coverWrapper}>
                                            {book.cover ? (
                                                <img src={book.cover} alt={book.title} className={styles.coverImage} />
                                            ) : (
                                                <div className={styles.placeholderCover}>
                                                    <span>EPUB</span>
                                                </div>
                                            )}
                                            <div className={styles.cardOverlay} />
                                        </div>
                                        <div className={styles.meta}>
                                            <h3 className={styles.title} title={book.title}>{book.title}</h3>
                                            <p className={styles.author}>{book.author || 'Unknown'}</p>
                                            <div className={styles.progressRow}>
                                                <span>{progressMap[book.id] ?? 0}%</span>
                                            </div>
                                            <div className={styles.progressTrack}>
                                                <div className={styles.progressFill} style={{ width: `${progressMap[book.id] ?? 0}%` }} />
                                            </div>
                                        </div>
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                        </motion.div>
                    )}
                    </>
                    )}
                </div>
                {contextMenu.visible && contextMenu.bookId && (
                    <div
                        className={styles.contextMenu}
                        style={{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }}
                        onClick={(event) => event.stopPropagation()}
                    >
                        {trashBookIds.includes(contextMenu.bookId) ? (
                            <>
                                <button
                                    className={styles.contextMenuItem}
                                    onClick={async () => {
                                        await restoreFromTrash(contextMenu.bookId as string)
                                        setContextMenu({ visible: false, x: 0, y: 0, bookId: null })
                                    }}
                                >
                                    恢复图书
                                </button>
                                <button
                                    className={`${styles.contextMenuItem} ${styles.contextDanger}`}
                                    onClick={async () => {
                                        handlePermanentDeleteBook(contextMenu.bookId as string)
                                        setContextMenu({ visible: false, x: 0, y: 0, bookId: null })
                                    }}
                                >
                                    彻底删除
                                </button>
                            </>
                        ) : (
                            <>
                                <button
                                    className={styles.contextMenuItem}
                                    onClick={() => {
                                        openBookPropertiesModal(contextMenu.bookId as string)
                                        setContextMenu({ visible: false, x: 0, y: 0, bookId: null })
                                    }}
                                >
                                    属性
                                </button>
                                <button
                                    className={styles.contextMenuItem}
                                    onClick={async () => {
                                        await toggleFavorite(contextMenu.bookId as string)
                                        setContextMenu({ visible: false, x: 0, y: 0, bookId: null })
                                    }}
                                >
                                    {favoriteBookIds.includes(contextMenu.bookId) ? '取消喜爱' : '加入喜爱'}
                                </button>
                                <button
                                    className={styles.contextMenuItem}
                                    onClick={async () => {
                                        await addBookToShelf(contextMenu.bookId as string)
                                        setContextMenu({ visible: false, x: 0, y: 0, bookId: null })
                                    }}
                                >
                                    加入书架
                                </button>
                                {activeShelfId && (shelfBookMap[activeShelfId] || []).includes(contextMenu.bookId) && (
                                    <button
                                        className={styles.contextMenuItem}
                                        onClick={async () => {
                                            await removeBookFromActiveShelf(contextMenu.bookId as string)
                                            setContextMenu({ visible: false, x: 0, y: 0, bookId: null })
                                        }}
                                    >
                                        从当前书架移除
                                    </button>
                                )}
                                <button
                                    className={`${styles.contextMenuItem} ${styles.contextDanger}`}
                                    onClick={async () => {
                                        await moveToTrash(contextMenu.bookId as string)
                                        setContextMenu({ visible: false, x: 0, y: 0, bookId: null })
                                    }}
                                >
                                    移到回收
                                </button>
                            </>
                        )}
                    </div>
                )}
            </section>
        </div>
    )
}
