import { useCallback, useEffect, useRef, useState } from 'react'
import { useSettingsStore } from '@/stores/useSettingsStore'
import type { PageTurnMode } from '@/stores/useSettingsStore'
import type { ContentProvider, SearchResult } from '@/engine/core/contentProvider'
import { resolveReaderRenderMode } from '@/engine/core/readerRenderMode'
import { ScrollReaderView, ScrollReaderHandle } from './ScrollReaderView'
import { PaginatedReaderView, PaginatedReaderHandle } from './PaginatedReaderView'
import { useAutoScrollActiveToc } from './useAutoScrollActiveToc'
import { ReaderPanelContent } from './ReaderPanelContent'
import type { ReaderPanelTab } from './readerPanelTypes'
import { ReaderSurface } from './ReaderSurface'
import { findCurrentChapterLabel, normalizeTocHref } from './readerToc'
import { useReaderAnnotations } from './useReaderAnnotations'
import { useReaderAppearance } from './useReaderAppearance'
import { useReaderBookSession } from './useReaderBookSession'
import { useReaderBookHeaderInfo } from './useReaderBookHeaderInfo'
import { useReaderClock } from './useReaderClock'
import { useReaderModeSwitch } from './useReaderModeSwitch'
import { useReaderNavigation } from './useReaderNavigation'
import { useReadingActivityTracker } from './useReadingActivityTracker'
import styles from './ReaderView.module.css'
interface ReaderViewProps {
    bookId: string
    onBack: () => void
    jumpTarget?: { location: string; searchText?: string } | null
}
export const ReaderView = ({ bookId, onBack, jumpTarget }: ReaderViewProps) => {
    const tocListRef = useRef<HTMLDivElement>(null)
    const providerRef = useRef<ContentProvider | null>(null)
    const [settingsOpen, setSettingsOpen] = useState(false)
    const [activeTab, setActiveTab] = useState<ReaderPanelTab>('toc')
    const [currentSectionHref, setCurrentSectionHref] = useState<string>('')
    const [searchQuery, setSearchQuery] = useState('')
    const [searchResults, setSearchResults] = useState<SearchResult[]>([])
    const [isSearching, setIsSearching] = useState(false)
    const scrollReaderRef = useRef<ScrollReaderHandle>(null)
    const paginatedReaderRef = useRef<PaginatedReaderHandle>(null)
    const settings = useSettingsStore()
    const nightAppearanceRef = useRef<{
        themeId: string
        customBgColor: string | null
        customTextColor: string | null
    } | null>(null)
    const {
        bookFormat,
        bookTitleText,
        currentProgress,
        initialSectionHref,
        isReady,
        paginatedParams,
        provider,
        toc,
        scrollParams,
        setCurrentProgress,
    } = useReaderBookSession({
        bookId,
        pageTurnMode: settings.pageTurnMode,
    })
    const clockText = useReaderClock()
    const bookHeaderInfo = useReaderBookHeaderInfo({
        bookId,
        isReady,
    })
    const { markActivity } = useReadingActivityTracker({
        bookId,
        isReady,
    })
    const annotationState = useReaderAnnotations({
        activeTab,
        bookId,
    })
    const modeDecision = resolveReaderRenderMode(bookFormat, settings.pageTurnMode)
    const effectivePageTurnMode = modeDecision.effectiveMode
    const isScrollMode = effectivePageTurnMode === 'scrolled-continuous'
    const {
        readerColors,
        readerStyleConfig,
        resolvedReaderFontFamily,
    } = useReaderAppearance(settings, bookFormat)
    useEffect(() => {
        providerRef.current = provider
        return () => {
            if (providerRef.current === provider) {
                providerRef.current = null
            }
        }
    }, [provider])
    useEffect(() => {
        setCurrentSectionHref('')
    }, [bookId])
    useEffect(() => {
        if (!isReady) return
        setCurrentSectionHref(normalizeTocHref(initialSectionHref))
    }, [initialSectionHref, isReady])
    const {
        closePanels,
        handleSearch,
        handleTocClick,
        jumpToAnnotation,
        openSearchPanelWithKeyword,
        toggleSettingsPanel,
    } = useReaderNavigation({
        isReady,
        isScrollMode,
        jumpTarget,
        paginatedReaderRef,
        providerRef,
        scrollReaderRef,
        searchQuery,
        setActiveTab,
        setCurrentSectionHref,
        setIsSearching,
        setSearchResults,
        setSettingsOpen,
    })
    useAutoScrollActiveToc({
        activeTab,
        currentSectionHref,
        tocLength: toc.length,
        tocListRef,
    })
    useEffect(() => {
        const recordActiveReading = () => {
            markActivity()
        }
        window.addEventListener('keydown', recordActiveReading, { passive: true })
        window.addEventListener('wheel', recordActiveReading, { passive: true })
        window.addEventListener('pointerdown', recordActiveReading, { passive: true })
        window.addEventListener('touchstart', recordActiveReading, { passive: true })
        return () => {
            window.removeEventListener('keydown', recordActiveReading)
            window.removeEventListener('wheel', recordActiveReading)
            window.removeEventListener('pointerdown', recordActiveReading)
            window.removeEventListener('touchstart', recordActiveReading)
        }
    }, [markActivity])
    const handleProgressChange = useCallback((progress: number) => {
        setCurrentProgress(progress)
        markActivity()
    }, [markActivity, setCurrentProgress])
    const handleChapterChange = useCallback((_label: string, href: string) => {
        setCurrentSectionHref(normalizeTocHref(href))
    }, [])
    const handleSelectionSearch = useCallback((keyword: string) => {
        setSearchQuery(keyword)
        openSearchPanelWithKeyword(keyword)
    }, [openSearchPanelWithKeyword])
    const getCurrentSpineIndex = useCallback(() => {
        const snapshot = isScrollMode
            ? scrollReaderRef.current?.getPosition()
            : paginatedReaderRef.current?.getPosition()
        if (snapshot) return snapshot.spineIndex
        const currentProvider = providerRef.current
        if (!currentProvider) return 0
        const hrefIndex = currentProvider.getSpineIndexByHref(currentSectionHref)
        return hrefIndex >= 0 ? hrefIndex : 0
    }, [currentSectionHref, isScrollMode])
    const jumpToSpineIndex = useCallback((targetIndex: number) => {
        const currentProvider = providerRef.current
        if (!currentProvider) return
        const spineItems = currentProvider.getSpineItems()
        if (spineItems.length === 0) return
        const safeIndex = Math.max(0, Math.min(spineItems.length - 1, targetIndex))
        const target = spineItems[safeIndex]
        if (target) setCurrentSectionHref(normalizeTocHref(target.href))
        markActivity()
        if (isScrollMode) {
            void scrollReaderRef.current?.jumpToSpine(safeIndex)
            return
        }
        void paginatedReaderRef.current?.jumpToSpine(safeIndex)
    }, [isScrollMode, markActivity])
    const handlePreviousChapter = useCallback(() => {
        jumpToSpineIndex(getCurrentSpineIndex() - 1)
    }, [getCurrentSpineIndex, jumpToSpineIndex])
    const handleNextChapter = useCallback(() => {
        jumpToSpineIndex(getCurrentSpineIndex() + 1)
    }, [getCurrentSpineIndex, jumpToSpineIndex])
    const handleProgressCommit = useCallback((progress: number) => {
        const spineCount = providerRef.current?.getSpineItems().length ?? 0
        if (spineCount === 0) return
        const normalized = Math.max(0, Math.min(1, progress))
        jumpToSpineIndex(Math.round(normalized * (spineCount - 1)))
    }, [jumpToSpineIndex])
    const handleToggleNightMode = useCallback(() => {
        if (settings.themeId === 'dark') {
            const previous = nightAppearanceRef.current
            settings.updateSetting('themeId', previous?.themeId ?? 'light')
            settings.updateSetting('customBgColor', previous?.customBgColor ?? null)
            settings.updateSetting('customTextColor', previous?.customTextColor ?? null)
            nightAppearanceRef.current = null
            return
        }
        nightAppearanceRef.current = {
            themeId: settings.themeId,
            customBgColor: settings.customBgColor,
            customTextColor: settings.customTextColor,
        }
        settings.updateSetting('customBgColor', null)
        settings.updateSetting('customTextColor', null)
        settings.updateSetting('themeId', 'dark')
    }, [settings])
    const updatePageTurnMode = useCallback((nextMode: PageTurnMode) => {
        settings.updateSetting('pageTurnMode', nextMode)
    }, [settings])
    const handlePinnedSidebarWidthChange = useCallback((width: number) => {
        settings.updateSetting('pinnedSidebarWidth', width)
    }, [settings])
    const {
        handlePageTurnModeChange,
        modeSwitchAnchor,
    } = useReaderModeSwitch({
        bookId,
        currentProgress,
        currentSectionHref,
        effectivePageTurnMode,
        isScrollMode,
        pageTurnMode: settings.pageTurnMode,
        paginatedInitialSpineIndex: paginatedParams.initialSpineIndex,
        paginatedReaderRef,
        provider,
        scrollInitialSpineIndex: scrollParams.initialSpineIndex,
        scrollReaderRef,
        updatePageTurnMode,
    })
    const content = (
        <>
            {!isReady && (
                <div className={styles.blockingLoadingOverlay}>
                    <div className={styles.loading}>Loading...</div>
                </div>
            )}
            {isScrollMode && provider && isReady && (
                <ScrollReaderView
                    key={`scroll-${modeSwitchAnchor?.serial ?? 0}`}
                    ref={scrollReaderRef}
                    provider={provider}
                    bookId={bookId}
                    initialSpineIndex={modeSwitchAnchor?.snapshot?.spineIndex ?? scrollParams.initialSpineIndex}
                    initialScrollOffset={modeSwitchAnchor?.snapshot?.sourceMode === 'scrolled-continuous'
                        ? modeSwitchAnchor.snapshot.position
                        : scrollParams.initialScrollOffset}
                    initialChapterProgress={modeSwitchAnchor?.snapshot?.chapterProgress}
                    readerStyles={readerStyleConfig}
                    onProgressChange={handleProgressChange}
                    onChapterChange={handleChapterChange}
                    onSelectionSearch={handleSelectionSearch}
                />
            )}
            {!isScrollMode && provider && isReady && (
                <PaginatedReaderView
                    key={`paginated-${effectivePageTurnMode}-${modeSwitchAnchor?.serial ?? 0}`}
                    ref={paginatedReaderRef}
                    provider={provider}
                    bookId={bookId}
                    initialSpineIndex={modeSwitchAnchor?.snapshot?.spineIndex ?? paginatedParams.initialSpineIndex}
                    initialPage={modeSwitchAnchor?.snapshot && modeSwitchAnchor.snapshot.sourceMode !== 'scrolled-continuous'
                        ? modeSwitchAnchor.snapshot.position
                        : paginatedParams.initialPage}
                    initialChapterProgress={modeSwitchAnchor?.snapshot?.chapterProgress}
                    pageTurnMode={effectivePageTurnMode === 'paginated-double' ? 'paginated-double' : 'paginated-single'}
                    readerStyles={readerStyleConfig}
                    onProgressChange={handleProgressChange}
                    onChapterChange={handleChapterChange}
                    onSelectionSearch={handleSelectionSearch}
                />
            )}
        </>
    )
    return (
        <ReaderSurface
            activeTab={activeTab}
            bookFormat={bookFormat}
            bookAuthorText={bookHeaderInfo.author}
            bookCover={bookHeaderInfo.cover}
            bookTotalActiveMs={bookHeaderInfo.totalActiveMs}
            bookTitleText={bookTitleText}
            chapterLabel={findCurrentChapterLabel(toc, currentSectionHref)}
            clockText={clockText}
            closePanels={closePanels}
            content={content}
            currentSectionHref={currentSectionHref}
            currentProgress={currentProgress}
            isNightMode={settings.themeId === 'dark'}
            onNextChapter={handleNextChapter}
            panelContent={(
                <ReaderPanelContent
                    activeTab={activeTab}
                    bookmarks={annotationState.bookmarks}
                    currentSectionHref={currentSectionHref}
                    deleteBookmark={annotationState.deleteBookmark}
                    deleteHighlight={annotationState.deleteHighlight}
                    expandedNoteId={annotationState.expandedNoteId}
                    handleSearch={handleSearch}
                    handleTocClick={handleTocClick}
                    highlights={annotationState.highlights}
                    isSearching={isSearching}
                    jumpToAnnotation={jumpToAnnotation}
                    onExpandedNoteChange={annotationState.setExpandedNoteId}
                    onSearchQueryChange={setSearchQuery}
                    onTabChange={setActiveTab}
                    searchQuery={searchQuery}
                    searchResults={searchResults}
                    toc={toc}
                    tocListRef={tocListRef}
                />
            )}
            onBack={onBack}
            onPageTurnModeChange={handlePageTurnModeChange}
            onPinnedSidebarWidthChange={handlePinnedSidebarWidthChange}
            onPreviousChapter={handlePreviousChapter}
            onProgressCommit={handleProgressCommit}
            onTabChange={setActiveTab}
            onToggleNightMode={handleToggleNightMode}
            progressLabel={`${Math.round(Math.max(0, Math.min(1, currentProgress)) * 100)}%`}
            readerColors={readerColors}
            resolvedReaderFontFamily={resolvedReaderFontFamily}
            settings={settings}
            settingsOpen={settingsOpen}
            toc={toc}
            toggleSettingsPanel={toggleSettingsPanel}
        />
    )
}
