import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import { buildFontFamilyWithFallback } from '@/utils/fontFallback'
import { findCurrentChapterLabel, normalizeTocHref } from './readerToc'
import { useReaderAnnotations } from './useReaderAnnotations'
import { useReaderBookSession } from './useReaderBookSession'
import { useReaderClock } from './useReaderClock'
import { useReaderNavigation } from './useReaderNavigation'
import { useReadingActivityTracker } from './useReadingActivityTracker'
import { resolveReaderColors } from './readerColors'
import { buildReaderStyleConfig } from './readerStyleConfig'
import {
    createFallbackModePositionSnapshot,
    type ReaderModePositionSnapshot,
} from './readerModeSwitchPosition'
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
    const [modeSwitchAnchor, setModeSwitchAnchor] = useState<{
        serial: number
        snapshot: ReaderModePositionSnapshot
    } | null>(null)
    const scrollReaderRef = useRef<ScrollReaderHandle>(null)
    const paginatedReaderRef = useRef<PaginatedReaderHandle>(null)
    const settings = useSettingsStore()
    const {
        bookFormat,
        bookTitleText,
        currentProgress,
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
    const resolvedReaderFontFamily = buildFontFamilyWithFallback(settings.fontFamily)
    const readerColors = resolveReaderColors(settings)
    const readerStyleConfig = useMemo(() => buildReaderStyleConfig(
        settings,
        readerColors,
        resolvedReaderFontFamily,
        bookFormat,
    ), [
        bookFormat,
        readerColors.textColor,
        readerColors.bgColor,
        resolvedReaderFontFamily,
        settings.fontSize,
        settings.lineHeight,
        settings.paragraphSpacing,
        settings.paragraphIndentEnabled,
        settings.letterSpacing,
        settings.textAlign,
        settings.pageWidth,
        settings.themeId,
    ])
    useEffect(() => {
        providerRef.current = provider
        return () => {
            if (providerRef.current === provider) {
                providerRef.current = null
            }
        }
    }, [provider])
    useEffect(() => {
        setModeSwitchAnchor(null)
    }, [bookId])
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
    const getFallbackModePositionSnapshot = useCallback(() => {
        const fallbackSpineIndex = isScrollMode
            ? scrollParams.initialSpineIndex
            : paginatedParams.initialSpineIndex
        return createFallbackModePositionSnapshot({
            currentProgress,
            currentSectionHref,
            fallbackSpineIndex,
            provider,
            sourceMode: effectivePageTurnMode,
        })
    }, [
        currentProgress,
        currentSectionHref,
        effectivePageTurnMode,
        isScrollMode,
        paginatedParams.initialSpineIndex,
        provider,
        scrollParams.initialSpineIndex,
    ])
    const handlePageTurnModeChange = useCallback((nextMode: PageTurnMode) => {
        if (nextMode === settings.pageTurnMode) return
        const liveSnapshot = isScrollMode
            ? scrollReaderRef.current?.getPosition()
            : paginatedReaderRef.current?.getPosition()
        const snapshot = liveSnapshot ?? getFallbackModePositionSnapshot()
        setModeSwitchAnchor((current) => ({
            serial: (current?.serial ?? 0) + 1,
            snapshot,
        }))
        settings.updateSetting('pageTurnMode', nextMode)
    }, [
        getFallbackModePositionSnapshot,
        isScrollMode,
        settings,
    ])
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
            bookTitleText={bookTitleText}
            chapterLabel={findCurrentChapterLabel(toc, currentSectionHref)}
            clockText={clockText}
            closePanels={closePanels}
            content={content}
            currentSectionHref={currentSectionHref}
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
            onTabChange={setActiveTab}
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
