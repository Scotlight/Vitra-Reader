import { useEffect, useMemo, type MouseEvent as ReactMouseEvent } from 'react'
import { useReaderSystemFonts } from '../Reader/useReaderSystemFonts'
import { useLibraryStore } from '../../stores/useLibraryStore'
import { useSettingsStore } from '../../stores/useSettingsStore'
import { useGroupManager } from '../../hooks/useGroupManager'
import { LibrarySidebar } from './LibrarySidebar'
import { BookContextMenu } from './BookContextMenu'
import { AnnotationList } from './AnnotationList'
import { BookGrid } from './BookGrid'
import { ReadingStatsPanel } from './ReadingStatsPanel'
import { useLibraryDerivedData } from './libraryView/useLibraryDerivedData'
import { useLibraryMetaState } from './libraryView/useLibraryMetaState'
import { useLibraryViewState } from './libraryView/useLibraryViewState'
import { LibraryTopbar } from './libraryView/LibraryTopbar'
import { LibraryDialogs } from './libraryView/LibraryDialogs'
import styles from './LibraryView.module.css'

export const LibraryView = ({ onOpenBook }: { onOpenBook: (id: string, jump?: { location: string; searchText?: string }) => void }) => {
    const { books, importBook, isLoading, loadBooks, removeBook } = useLibraryStore()
    const settings = useSettingsStore()
    const { systemFonts, loadingFonts } = useReaderSystemFonts()
    const {
        keyword,
        setKeyword,
        showSettings,
        setShowSettings,
        activeNav,
        setActiveNav,
        sortMode,
        dialogState,
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
    } = useLibraryViewState()

    const {
        progressMap,
        favoriteBookIds,
        trashBookIds,
        noteBookIds,
        highlightBookIds,
        allHighlights,
        allBookmarks,
        persistFavorites,
        persistTrash,
        toggleFavorite,
        moveToTrash,
        restoreFromTrash,
    } = useLibraryMetaState({ activeNav })

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

    const {
        showMixedHome,
        homeItems,
        gridItems,
        groupedHighlights,
        groupedBookmarks,
        emptyMessage,
        statusText,
        sortModeLabel,
    } = useLibraryDerivedData({
        books,
        keyword,
        sortMode,
        activeNav,
        activeGroupId,
        favoriteBookIds,
        trashBookIds,
        noteBookIds,
        highlightBookIds,
        groupCollections,
        groupedBookIdSet,
        homeOrder,
        allHighlights,
        allBookmarks,
        bookById,
    })

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
                <LibraryTopbar
                    keyword={keyword}
                    sortModeLabel={sortModeLabel}
                    isLoading={isLoading}
                    onKeywordChange={setKeyword}
                    onNextSortMode={nextSortMode}
                    onRefresh={() => void loadBooks()}
                    onToggleTheme={() => settings.updateSetting('themeId', settings.themeId === 'dark' ? 'light' : 'dark')}
                    onImport={() => void handleImport()}
                />

                <LibraryDialogs
                    systemFonts={systemFonts}
                    loadingFonts={loadingFonts}
                    showSettings={showSettings}
                    onCloseSettings={() => setShowSettings(false)}
                    books={books}
                    showBookPropertiesModal={showBookPropertiesModal}
                    onCloseBookProperties={() => setShowBookPropertiesModal(null)}
                    onSavedBookProperties={loadBooks}
                    showCreateGroupModal={showCreateGroupModal}
                    newGroupName={newGroupName}
                    setNewGroupName={setNewGroupName}
                    onCloseCreateGroupModal={() => setShowCreateGroupModal(false)}
                    onCreateGroup={() => void createGroup()}
                    showManageGroupModal={showManageGroupModal}
                    groups={groups}
                    manageSourceGroupId={manageSourceGroupId}
                    setManageSourceGroupId={setManageSourceGroupId}
                    manageTargetGroupId={manageTargetGroupId}
                    setManageTargetGroupId={setManageTargetGroupId}
                    onCloseManageGroupModal={() => setShowManageGroupModal(false)}
                    onRenameGroup={(id, name) => void renameGroup(id, name)}
                    onDissolveGroup={(id) => void dissolveGroup(id)}
                    onMoveGroupBooks={(from, to) => void moveGroupBooks(from, to)}
                    dialogState={dialogState}
                    onCloseDialog={closeDialog}
                    onConfirmDialog={() => void handleDialogConfirm()}
                />

                <div className={styles.statusLine}>
                    <span>{statusText}</span>
                </div>

                <div ref={setScrollContainer} className={styles.scrollArea} onContextMenu={handleBlankAreaContextMenu}>
                    {activeNav === 'stats' ? (
                        <ReadingStatsPanel />
                    ) : (activeNav === 'highlight' || activeNav === 'notes') ? (
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
