import { useEffect, useMemo, useState } from 'react'
import { useReaderSystemFonts } from '@/components/Reader/useReaderSystemFonts'
import { useLibraryStore } from '@/stores/useLibraryStore'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { useGroupManager } from '@/hooks/useGroupManager'
import { useIsMobileLayout } from '@/hooks/useIsMobileLayout'
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
import { MobileLibraryChrome, type MobileLibraryDestination, type MobileLibraryTab } from './MobileLibraryChrome'
import { MobileHomeView, type MobileHomeShortcut } from './mobileHome/MobileHomeView'
import type { MobileSettingsPage } from './settingsPanel/mobileSettings'
import styles from './LibraryView.module.css'

export const LibraryView = ({ onOpenBook }: { onOpenBook: (id: string, jump?: { location: string; searchText?: string }) => void }) => {
    const { books, importBook, isLoading, loadBooks, removeBook } = useLibraryStore()
    const settings = useSettingsStore()
    const { systemFonts, loadingFonts } = useReaderSystemFonts()
    const isMobileLayout = useIsMobileLayout()
    const [mobileSettingsPage, setMobileSettingsPage] = useState<MobileSettingsPage | null>(null)
    // 移动端一级 tab 叠加层：只在移动布局下参与渲染决策，桌面端完全无感（chrome 隐藏 + 内容分支有 isMobileLayout 闸）
    const [mobileTab, setMobileTab] = useState<MobileLibraryTab>('home')
    const {
        keyword,
        setKeyword,
        showSettings,
        setShowSettings,
        activeNav,
        setActiveNav,
        sortMode,
        setSortMode,
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

    const homeItemKeys = useMemo(() => homeItems.map((item) => item.key), [homeItems])
    const {
        handleBlankAreaContextMenu,
        handleBookContextMenu,
        handleGridReorder,
        handlePermanentDeleteBook,
        openBookPropertiesModal,
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
    })

    const handleImport = useLibraryImport({
        importBook,
        loadBooks,
        showInfoDialog,
    })

    const handleMobileNavigate = (destination: MobileLibraryDestination) => {
        setMobileSettingsPage(null)
        setShowSettings(false)
        setActiveNav(destination)
        if (destination === 'all' || destination === 'stats') {
            setActiveGroupId(null)
        }
    }

    // 5 个一级 tab → 既有 activeNav/showSettings 的映射层。home 不动 activeNav：
    // 首页内容自派生（见 MobileHomeView），不占用桌面共用的导航语义。
    const handleMobileTabChange = (tab: MobileLibraryTab) => {
        setMobileTab(tab)
        setMobileSettingsPage(null)
        if (tab === 'settings') {
            setShowSettings(true)
            return
        }
        setShowSettings(false)
        if (tab === 'shelf') {
            setActiveNav('all')
            setActiveGroupId(null)
        } else if (tab === 'time') {
            setActiveNav('stats')
            setActiveGroupId(null)
        } else if (tab === 'notes') {
            setActiveNav('notes')
        }
    }

    // 首页快捷入口 → 书架 tab 的对应筛选/排序。search 暂落到书架（那里有搜索框），
    // 全屏搜索是原型的独立浮层，属后续 phase。
    const handleHomeShortcut = (shortcut: MobileHomeShortcut) => {
        setMobileTab('shelf')
        setMobileSettingsPage(null)
        setShowSettings(false)
        setActiveGroupId(null)
        if (shortcut === 'fav' || shortcut === 'trash') {
            setActiveNav(shortcut)
            return
        }
        setActiveNav('all')
        if (shortcut === 'recentlyAdded') setSortMode('addedAt')
        if (shortcut === 'recentlyRead') setSortMode('lastRead')
    }

    return (
        <div className={styles.libraryContainer}>
            <LibrarySidebar
                activeNav={activeNav}
                setActiveNav={(nav) => {
                    setMobileSettingsPage(null)
                    setShowSettings(false)
                    setActiveNav(nav)
                }}
                group={group}
                onOpenBook={onOpenBook}
                onContextMenu={handleBookContextMenu}
                isSettingsOpen={showSettings}
                onToggleSettings={() => {
                    setMobileSettingsPage(null)
                    setShowSettings(true)
                }}
            />

            <section className={`${styles.content} ${showSettings ? styles.settingsContent : ''}`}>
                <MobileLibraryChrome
                    activeNav={activeNav}
                    isLoading={isLoading}
                    isSettingsOpen={showSettings}
                    keyword={keyword}
                    mobileSettingsPage={mobileSettingsPage}
                    mobileTab={mobileTab}
                    statusText={statusText}
                    onHomeSearch={() => handleHomeShortcut('search')}
                    onImport={() => void handleImport()}
                    onKeywordChange={setKeyword}
                    onNavigate={handleMobileNavigate}
                    onMobileSettingsBack={() => setMobileSettingsPage(null)}
                    onTabChange={handleMobileTabChange}
                />
                {showSettings ? (
                    <SettingsPanel
                        systemFonts={systemFonts}
                        loadingFonts={loadingFonts}
                        mobilePage={mobileSettingsPage}
                        onClose={() => {
                            setMobileSettingsPage(null)
                            setShowSettings(false)
                        }}
                        onMobilePageChange={setMobileSettingsPage}
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
                            {isMobileLayout && mobileTab === 'home' ? (
                                <MobileHomeView
                                    books={books}
                                    progressMap={progressMap}
                                    trashBookIdSet={trashBookIdSet}
                                    onOpenBook={(id) => onOpenBook(id)}
                                    onShortcut={handleHomeShortcut}
                                />
                            ) : activeNav === 'stats' ? (
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
                    </>
                )}

                <LibraryDialogs
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
            </section>
        </div>
    )
}
