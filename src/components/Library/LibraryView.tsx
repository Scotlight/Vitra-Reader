import { useEffect, useMemo } from 'react'
import { useReaderSystemFonts } from '@/components/Reader/useReaderSystemFonts'
import { useLibraryStore } from '@/stores/useLibraryStore'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { useGroupManager } from '@/hooks/useGroupManager'
import { LibrarySidebar } from './LibrarySidebar'
import { BookContextMenu } from './BookContextMenu'
import { AnnotationList } from './AnnotationList'
import { BookGrid } from './BookGrid'
import { ReadingStatsPanel } from './ReadingStatsPanel'
import { useLibraryDerivedData } from './libraryView/useLibraryDerivedData'
import { useLibraryMetaState } from './libraryView/useLibraryMetaState'
import { useLibraryViewState } from './libraryView/useLibraryViewState'
import { useLibraryBookActions } from './libraryView/useLibraryBookActions'
import { useLibraryImport } from './libraryView/useLibraryImport'
import { LibraryTopbar } from './libraryView/LibraryTopbar'
import { LibraryDialogs } from './libraryView/LibraryDialogs'
import { SettingsPanel } from './SettingsPanel'
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
        setBookGroupMembership,
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
        shelfLabelCounts,
    } = useLibraryDerivedData({
        books,
        keyword,
        sortMode,
        activeNav,
        activeGroupId,
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

    // 侧栏「全部」数量只计非回收书，与标签计数口径一致。
    const totalBookCount = useMemo(
        () => books.filter((book) => !trashBookIdSet.has(book.id)).length,
        [books, trashBookIdSet],
    )

    const homeItemKeys = useMemo(() => homeItems.map((item) => item.key), [homeItems])
    const {
        handleBlankAreaContextMenu,
        handleBookContextMenu,
        handleGridReorder,
        handlePermanentDeleteBook,
        openBookPropertiesModal,
        setBookShelfLabel,
    } = useLibraryBookActions({
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
        onBooksChanged: loadBooks,
    })

    const handleImport = useLibraryImport({
        importBook,
        loadBooks,
        showInfoDialog,
    })

    return (
        <div className={styles.libraryContainer}>
            <LibrarySidebar
                activeNav={activeNav}
                setActiveNav={(nav) => {
                    setShowSettings(false)
                    setActiveNav(nav)
                }}
                group={group}
                totalBookCount={totalBookCount}
                shelfLabelCounts={shelfLabelCounts}
                onOpenBook={onOpenBook}
                onContextMenu={handleBookContextMenu}
                isSettingsOpen={showSettings}
                onToggleSettings={() => setShowSettings(true)}
            />

            <section className={`${styles.content} ${showSettings ? styles.settingsContent : ''}`}>
                {showSettings ? (
                    <SettingsPanel
                        systemFonts={systemFonts}
                        loadingFonts={loadingFonts}
                        onClose={() => setShowSettings(false)}
                    />
                ) : (
                    <>
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
                            books={books}
                            activeGroupId={activeGroupId}
                            groupBookMap={groupBookMap}
                            onRestoreFromTrash={restoreFromTrash}
                            onPermanentDelete={handlePermanentDeleteBook}
                            onOpenProperties={openBookPropertiesModal}
                            onSetShelfLabel={setBookShelfLabel}
                            onAddToGroup={addBookToGroup}
                            onRemoveFromGroup={removeBookFromActiveGroup}
                            onMoveToTrash={moveToTrash}
                        />
                    </>
                )}

                <LibraryDialogs
                    books={books}
                    groups={groups}
                    groupBookMap={groupBookMap}
                    showBookPropertiesModal={showBookPropertiesModal}
                    onCloseBookProperties={() => setShowBookPropertiesModal(null)}
                    onSavedBookProperties={loadBooks}
                    onSaveGroupMembership={setBookGroupMembership}
                    showCreateGroupModal={showCreateGroupModal}
                    newGroupName={newGroupName}
                    setNewGroupName={setNewGroupName}
                    onCloseCreateGroupModal={() => setShowCreateGroupModal(false)}
                    onCreateGroup={() => void createGroup()}
                    showManageGroupModal={showManageGroupModal}
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
            </section>
        </div>
    )
}
