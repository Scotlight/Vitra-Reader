import { useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { motion } from 'framer-motion'
import { useLibraryStore } from '../../stores/useLibraryStore'
import { useSettingsStore } from '../../stores/useSettingsStore'
import { db, type Highlight, type Bookmark } from '../../services/storageService'
import { useGroupManager } from '../../hooks/useGroupManager'
import { applyHomeOrder, buildHomeOrderKey, parseHomeOrderKey } from '../../hooks/groupManagerState'
import { SettingsPanel } from './SettingsPanel'
import { BookPropertiesModal } from './BookPropertiesModal'
import { LibrarySidebar } from './LibrarySidebar'
import { BookContextMenu } from './BookContextMenu'
import { CreateShelfModal, ManageShelfModal } from './ShelfModals'
import { AnnotationList } from './AnnotationList'
import { BookGrid, type LibraryGridItem } from './BookGrid'
import searchIcon from '../../assets/icons/search.svg'
import sortIcon from '../../assets/icons/sort.svg'
import refreshIcon from '../../assets/icons/refresh.svg'
import themeIcon from '../../assets/icons/theme.svg'
import chevronDownIcon from '../../assets/icons/chevron-down.svg'
import styles from './LibraryView.module.css'

export const LibraryView = ({ onOpenBook }: { onOpenBook: (id: string, jump?: { location: string; searchText?: string }) => void }) => {
    const { books, importBook, isLoading, loadBooks, removeBook } = useLibraryStore()
    const settings = useSettingsStore()
    const [keyword, setKeyword] = useState('')
    const [showSettings, setShowSettings] = useState(false)
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
    const [blankContextMenu, setBlankContextMenu] = useState<{ visible: boolean; x: number; y: number }>({
        visible: false,
        x: 0,
        y: 0,
    })
    const [showBookPropertiesModal, setShowBookPropertiesModal] = useState<string | null>(null)
    const [scrollContainer, setScrollContainer] = useState<HTMLDivElement | null>(null)

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

    const trashBookIdSet = useMemo(() => new Set(trashBookIds), [trashBookIds])

    const group = useGroupManager({
        books,
        trashBookIdSet,
        activeNav,
        showInfoDialog,
        showConfirmDialog,
    })

    const {
        groups,
        groupBookMap,
        homeOrder,
        activeGroupId,
        setActiveGroupId,
        groupedBookIdSet,
        groupCollections,
        bookById,
        openCreateGroupModal,
        showCreateGroupModal,
        setShowCreateGroupModal,
        newGroupName,
        setNewGroupName,
        showManageGroupModal,
        setShowManageGroupModal,
        manageSourceGroupId,
        setManageSourceGroupId,
        manageTargetGroupId,
        setManageTargetGroupId,
        createGroup,
        renameGroup,
        dissolveGroup,
        moveGroupBooks,
        addBookToGroup,
        removeBookFromActiveGroup,
        reorderHomeItems,
        reorderActiveGroupBooks,
    } = group

    useEffect(() => {
        void loadBooks()
    }, [loadBooks])

    useEffect(() => {
        const loadAllMeta = async () => {
            const [allProgress, favEntry, trashEntry, bookmarks, highlights] = await Promise.all([
                db.progress.toArray(),
                db.settings.get('favoriteBookIds'),
                db.settings.get('trashBookIds'),
                db.bookmarks.toArray(),
                db.highlights.toArray(),
            ])
            const map = allProgress.reduce<Record<string, number>>((acc, item) => {
                acc[item.bookId] = Math.round((item.percentage || 0) * 100)
                return acc
            }, {})
            setProgressMap(map)
            const favValue = favEntry?.value
            setFavoriteBookIds(Array.isArray(favValue) ? favValue.map((item) => String(item)) : [])
            const trashValue = trashEntry?.value
            setTrashBookIds(Array.isArray(trashValue) ? trashValue.map((item) => String(item)) : [])
            setNoteBookIds(Array.from(new Set(bookmarks.map((item) => item.bookId))))
            setHighlightBookIds(Array.from(new Set(highlights.map((item) => item.bookId))))
            setAllHighlights(highlights)
            setAllBookmarks(bookmarks)
        }
        void loadAllMeta()
        const handleFocus = () => { void loadAllMeta() }
        document.addEventListener('visibilitychange', handleFocus)
        window.addEventListener('focus', handleFocus)
        return () => {
            document.removeEventListener('visibilitychange', handleFocus)
            window.removeEventListener('focus', handleFocus)
        }
    }, [books])

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

    const favoriteBookIdSet = useMemo(() => new Set(favoriteBookIds), [favoriteBookIds])
    const noteBookIdSet = useMemo(() => new Set(noteBookIds), [noteBookIds])
    const highlightBookIdSet = useMemo(() => new Set(highlightBookIds), [highlightBookIds])

    const filteredBooks = useMemo(() => {
        const q = keyword.trim().toLowerCase()
        const matchesKeyword = (title: string, author: string) => title.toLowerCase().includes(q) || author.toLowerCase().includes(q)
        const sourceBase = !q
            ? books
            : books.filter((book) => {
            return matchesKeyword(book.title, book.author)
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

        if (activeNav === 'all' && activeGroupId) {
            const activeGroupCollection = groupCollections.find((item) => item.id === activeGroupId)
            const orderedBooks = activeGroupCollection?.books ?? []
            return !q ? orderedBooks : orderedBooks.filter((book) => matchesKeyword(book.title, book.author))
        }

        const sorted = [...navFiltered].sort((a, b) => {
            if (sortMode === 'title') return a.title.localeCompare(b.title, 'zh-CN')
            if (sortMode === 'author') return a.author.localeCompare(b.author, 'zh-CN')
            if (sortMode === 'addedAt') return (b.addedAt || 0) - (a.addedAt || 0)
            return (b.lastReadAt || 0) - (a.lastReadAt || 0)
        })
        return sorted
    }, [books, keyword, sortMode, activeNav, activeGroupId, favoriteBookIdSet, trashBookIdSet, noteBookIdSet, highlightBookIdSet, groupCollections])

    const showMixedHome = activeNav === 'all' && !activeGroupId && keyword.trim() === ''

    const visibleBooks = useMemo(() => {
        if (!showMixedHome) return filteredBooks
        return filteredBooks.filter((book) => !groupedBookIdSet.has(book.id))
    }, [showMixedHome, filteredBooks, groupedBookIdSet])

    const homeItems = useMemo<LibraryGridItem[]>(() => {
        if (!showMixedHome) return []

        const availableKeys = [
            ...groupCollections.map((collection) => buildHomeOrderKey('group', collection.id)),
            ...visibleBooks.map((book) => buildHomeOrderKey('book', book.id)),
        ]
        const groupsById = new Map(groupCollections.map((collection) => [collection.id, collection]))
        const visibleBooksById = new Map(visibleBooks.map((book) => [book.id, book]))
        const orderedItems: LibraryGridItem[] = []

        applyHomeOrder(availableKeys, homeOrder).forEach((key) => {
            const parsed = parseHomeOrderKey(key)
            if (!parsed) return

            if (parsed.type === 'group') {
                const collection = groupsById.get(parsed.id)
                if (collection) {
                    orderedItems.push({ key, type: 'group', group: collection })
                }
                return
            }

            const book = visibleBooksById.get(parsed.id)
            if (book) {
                orderedItems.push({ key, type: 'book', book })
            }
        })

        return orderedItems
    }, [showMixedHome, groupCollections, visibleBooks, homeOrder])

    const gridItems = useMemo<LibraryGridItem[]>(() => {
        if (showMixedHome) return homeItems
        return visibleBooks.map((book) => ({ key: book.id, type: 'book', book }))
    }, [showMixedHome, homeItems, visibleBooks])

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

    const persistFavorites = async (next: string[]) => {
        setFavoriteBookIds(next)
        await db.settings.put({ key: 'favoriteBookIds', value: next })
    }

    const persistTrash = async (next: string[]) => {
        setTrashBookIds(next)
        await db.settings.put({ key: 'trashBookIds', value: next })
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

    const handleBookContextMenu = (event: ReactMouseEvent<HTMLElement>, bookId: string) => {
        event.preventDefault()
        event.stopPropagation()
        setBlankContextMenu({ visible: false, x: 0, y: 0 })
        setContextMenu({
            visible: true,
            x: event.clientX,
            y: event.clientY,
            bookId,
        })
    }

    const handleBlankAreaContextMenu = (event: ReactMouseEvent<HTMLElement>) => {
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
    }

    const handleGridReorder = (sourceKey: string, targetKey: string) => {
        if (showMixedHome) {
            void reorderHomeItems(sourceKey, targetKey, homeItems.map((item) => item.key))
            return
        }

        if (activeNav === 'all' && activeGroupId) {
            void reorderActiveGroupBooks(sourceKey, targetKey)
        }
    }

    const currentGroupName = activeGroupId
        ? groups.find((item) => item.id === activeGroupId)?.name ?? '当前分组'
        : ''
    const emptyMessage = activeNav === 'fav'
        ? '还没有加入喜爱的图书。'
        : activeNav === 'trash'
            ? '回收站还是空的。'
            : activeNav === 'all' && activeGroupId
                ? (keyword.trim() ? `${currentGroupName} 中没有匹配的图书。` : `${currentGroupName} 里还没有图书。`)
                : activeNav === 'all' && showMixedHome
                    ? '还没有分组和图书，导入一本书开始阅读吧。'
                    : keyword.trim()
                        ? '没有找到匹配的图书。'
                        : '还没有图书，导入一本书开始阅读吧。'
    const statusText = activeNav === 'highlight'
        ? `${allHighlights.length} 条高亮`
        : activeNav === 'notes'
            ? `${allBookmarks.length} 条笔记`
            : showMixedHome
                ? `${gridItems.length} 项`
                : `${gridItems.length} 本书`

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
        setShowBookPropertiesModal(bookId)
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

    const Icon = ({ src, className }: { src: string; className?: string }) => (
        <img className={className} src={src} alt="" />
    )

    return (
        <div className={styles.libraryContainer}>
            <LibrarySidebar
                activeNav={activeNav}
                setActiveNav={setActiveNav}
                group={group}
                onOpenBook={onOpenBook}
                onContextMenu={handleBookContextMenu}
                onToggleSettings={() => setShowSettings((value) => !value)}
            />

            <section className={styles.content}>
                <header className={styles.topbar}>
                    <div className={styles.searchWrap}>
                        <input
                            className={styles.searchInput}
                            type="search"
                            name="library-search"
                            aria-label="搜索我的书库"
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
                    <SettingsPanel
                        systemFonts={systemFonts}
                        loadingFonts={loadingFonts}
                        onClose={() => setShowSettings(false)}
                    />
                )}

                {showBookPropertiesModal && (() => {
                    const book = books.find((item) => item.id === showBookPropertiesModal)
                    return book ? (
                        <BookPropertiesModal
                            book={book}
                            books={books}
                            onClose={() => setShowBookPropertiesModal(null)}
                            onSaved={loadBooks}
                        />
                    ) : null
                })()}

                {showCreateGroupModal && (
                    <CreateShelfModal
                        newShelfName={newGroupName}
                        setNewShelfName={setNewGroupName}
                        onClose={() => setShowCreateGroupModal(false)}
                        onCreate={() => void createGroup()}
                    />
                )}

                {showManageGroupModal && (
                    <ManageShelfModal
                        shelves={groups}
                        manageSourceShelfId={manageSourceGroupId}
                        setManageSourceShelfId={setManageSourceGroupId}
                        manageTargetShelfId={manageTargetGroupId}
                        setManageTargetShelfId={setManageTargetGroupId}
                        onClose={() => setShowManageGroupModal(false)}
                        onRename={(id, name) => void renameGroup(id, name)}
                        onDissolve={(id) => void dissolveGroup(id)}
                        onMoveBooks={(from, to) => void moveGroupBooks(from, to)}
                    />
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
                    <span>{statusText}</span>
                </div>

                <div ref={setScrollContainer} className={styles.scrollArea} onContextMenu={handleBlankAreaContextMenu}>
                    {(activeNav === 'highlight' || activeNav === 'notes') ? (
                        <AnnotationList
                            activeNav={activeNav}
                            groupedHighlights={groupedHighlights}
                            groupedBookmarks={groupedBookmarks}
                            onOpenBook={onOpenBook}
                        />
                    ) : (
                        <BookGrid
                            items={gridItems}
                            emptyMessage={emptyMessage}
                            progressMap={progressMap}
                            onOpenBook={onOpenBook}
                            onOpenGroup={(groupId) => {
                                setActiveNav('all')
                                setActiveGroupId(groupId)
                            }}
                            onContextMenu={handleBookContextMenu}
                            scrollContainer={scrollContainer}
                            sortable={showMixedHome || (activeNav === 'all' && Boolean(activeGroupId))}
                            sortContextKey={showMixedHome ? 'home' : activeGroupId ? `group:${activeGroupId}` : null}
                            onReorder={handleGridReorder}
                        />
                    )}
                </div>

                {blankContextMenu.visible && (
                    <div
                        className={styles.contextMenu}
                        style={{ left: `${blankContextMenu.x}px`, top: `${blankContextMenu.y}px` }}
                        onClick={(event) => event.stopPropagation()}
                    >
                        <button
                            className={styles.contextMenuItem}
                            onClick={() => {
                                setBlankContextMenu({ visible: false, x: 0, y: 0 })
                                openCreateGroupModal()
                            }}
                        >
                            新建分组
                        </button>
                    </div>
                )}

                <BookContextMenu
                    contextMenu={contextMenu}
                    setContextMenu={setContextMenu}
                    trashBookIds={trashBookIds}
                    favoriteBookIds={favoriteBookIds}
                    activeGroupId={activeGroupId}
                    groupBookMap={groupBookMap}
                    onRestoreFromTrash={restoreFromTrash}
                    onPermanentDelete={handlePermanentDeleteBook}
                    onOpenProperties={openBookPropertiesModal}
                    onToggleFavorite={toggleFavorite}
                    onAddToGroup={addBookToGroup}
                    onRemoveFromGroup={removeBookFromActiveGroup}
                    onMoveToTrash={moveToTrash}
                />
            </section>
        </div>
    )
}
