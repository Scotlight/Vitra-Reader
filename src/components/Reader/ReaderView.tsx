import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSettingsStore } from '../../stores/useSettingsStore'
import type { ContentProvider, SearchResult } from '../../engine/core/contentProvider'
import { resolveReaderRenderMode } from '../../engine'
import { ScrollReaderView, ScrollReaderHandle } from './ScrollReaderView'
import { PaginatedReaderView, PaginatedReaderHandle } from './PaginatedReaderView'
import { useAutoScrollActiveToc } from './useAutoScrollActiveToc'
import { ReaderFooter } from './ReaderFooter'
import { ReaderLeftPanel, type ReaderPanelTab } from './ReaderLeftPanel'
import { ReaderSettingsPanel } from './ReaderSettingsPanel'
import { ReaderToolbar } from './ReaderToolbar'
import { buildFontFamilyWithFallback } from '../../utils/fontFallback'
import { findCurrentChapterLabel, normalizeTocHref } from './readerToc'
import { useReaderAnnotations } from './useReaderAnnotations'
import { contrastRatio } from './readerTheme'
import { useReaderBookSession } from './useReaderBookSession'
import { useReaderClock } from './useReaderClock'
import { useReaderNavigation } from './useReaderNavigation'
import styles from './ReaderView.module.css'

interface ReaderViewProps {
    bookId: string
    onBack: () => void
    jumpTarget?: { location: string; searchText?: string } | null
}

export const ReaderView = ({ bookId, onBack, jumpTarget }: ReaderViewProps) => {
    const tocListRef = useRef<HTMLDivElement>(null)
    const providerRef = useRef<ContentProvider | null>(null)
    const [leftPanelOpen, setLeftPanelOpen] = useState(false)
    const [settingsOpen, setSettingsOpen] = useState(false)
    const [activeTab, setActiveTab] = useState<ReaderPanelTab>('toc')

    const [currentSectionHref, setCurrentSectionHref] = useState<string>('')
    const [searchQuery, setSearchQuery] = useState('')
    const [searchResults, setSearchResults] = useState<SearchResult[]>([])
    const [isSearching, setIsSearching] = useState(false)
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
        vitraScrollParams,
        setCurrentProgress,
    } = useReaderBookSession({
        bookId,
        pageTurnMode: settings.pageTurnMode,
    })
    const clockText = useReaderClock()
    const {
        bookmarks,
        deleteBookmark,
        deleteHighlight,
        expandedNoteId,
        highlights,
        setExpandedNoteId,
    } = useReaderAnnotations({
        activeTab,
        bookId,
        leftPanelOpen,
    })

    const modeDecision = resolveReaderRenderMode(bookFormat, settings.pageTurnMode)
    const effectivePageTurnMode = modeDecision.effectiveMode
    const isScrollMode = effectivePageTurnMode === 'scrolled-continuous'
    const resolvedReaderFontFamily = buildFontFamilyWithFallback(settings.fontFamily)
    const readerColors = (() => {
        const fallbackByTheme: Record<string, { text: string; bg: string }> = {
            light: { text: '#1a1a1a', bg: '#ffffff' },
            dark: { text: '#e0e0e0', bg: '#16213e' },
            sepia: { text: '#5b4636', bg: '#f4ecd8' },
            green: { text: '#2d4a3e', bg: '#c7edcc' },
        }
        const base = fallbackByTheme[settings.themeId] || fallbackByTheme.light
        const candidateText = settings.customTextColor || base.text
        const candidateBg = settings.customBgColor || base.bg
        const safeText = settings.customTextColor
            ? candidateText
            : (contrastRatio(candidateText, candidateBg) < 3 ? (settings.themeId === 'dark' ? '#e0e0e0' : '#1a1a1a') : candidateText)

        return {
            textColor: safeText,
            bgColor: candidateBg,
        }
    })()

    const readerStyleConfig = useMemo(() => ({
        textColor: readerColors.textColor,
        bgColor: readerColors.bgColor,
        fontSize: settings.fontSize,
        fontFamily: resolvedReaderFontFamily,
        lineHeight: settings.lineHeight,
        paragraphSpacing: settings.paragraphSpacing,
        textIndentEm: settings.paragraphIndentEnabled ? 2 : 0,
        letterSpacing: settings.letterSpacing,
        textAlign: settings.textAlign,
        pageWidth: settings.pageWidth,
        isPdfDarkMode: bookFormat === 'pdf' && settings.themeId === 'dark',
    }), [
        readerColors.textColor,
        readerColors.bgColor,
        settings.fontSize,
        resolvedReaderFontFamily,
        settings.lineHeight,
        settings.paragraphSpacing,
        settings.paragraphIndentEnabled,
        settings.letterSpacing,
        settings.textAlign,
        settings.pageWidth,
        bookFormat,
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

    const {
        closePanels,
        handleSearch,
        handleTocClick,
        jumpToAnnotation,
        openSearchPanelWithKeyword,
        toggleLeftPanel,
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
        setLeftPanelOpen,
        setSearchResults,
        setSettingsOpen,
    })
    useAutoScrollActiveToc({
        activeTab,
        currentSectionHref,
        leftPanelOpen,
        tocLength: toc.length,
        tocListRef,
    })
    const handleChapterChange = useCallback((_label: string, href: string) => {
        setCurrentSectionHref(normalizeTocHref(href))
    }, [])

    const currentChapterLabel = findCurrentChapterLabel(toc, currentSectionHref)
    const headerHeight = Math.max(36, Math.min(96, Number(settings.headerHeight) || 48))
    const footerHeight = Math.max(0, Math.min(96, Number(settings.footerHeight) || 32))
    const footerEnabled = footerHeight > 0
    const progressLabel = `${Math.round(Math.max(0, Math.min(1, currentProgress)) * 100)}%`

    return (
        <div
            className={styles.readerContainer}
            style={{
                background: readerColors.bgColor,
                color: readerColors.textColor,
                ['--reader-bg-color']: readerColors.bgColor,
                ['--reader-text-color']: readerColors.textColor,
                ['--reader-font-family']: resolvedReaderFontFamily,
                ['--reader-font-size']: `${settings.fontSize}px`,
                ['--reader-line-height']: String(settings.lineHeight),
                ['--reader-letter-spacing']: `${settings.letterSpacing}px`,
                ['--reader-paragraph-spacing']: `${settings.paragraphSpacing}px`,
                ['--reader-text-align']: settings.textAlign,
            }}
        >
            <ReaderToolbar
                bookTitleText={bookTitleText}
                headerHeight={headerHeight}
                leftPanelOpen={leftPanelOpen}
                onBack={onBack}
                settingsOpen={settingsOpen}
                toggleLeftPanel={toggleLeftPanel}
                toggleSettingsPanel={toggleSettingsPanel}
            />

            <div className={styles.contentArea} style={{ paddingTop: `${headerHeight}px`, paddingBottom: `${footerEnabled ? footerHeight : 0}px` }}>
                {(leftPanelOpen || settingsOpen) && <div className={styles.panelBackdrop} onClick={closePanels} />}

                <ReaderLeftPanel
                    activeTab={activeTab}
                    bookmarks={bookmarks}
                    currentSectionHref={currentSectionHref}
                    deleteBookmark={deleteBookmark}
                    deleteHighlight={deleteHighlight}
                    expandedNoteId={expandedNoteId}
                    handleSearch={handleSearch}
                    handleTocClick={handleTocClick}
                    highlights={highlights}
                    isOpen={leftPanelOpen}
                    isSearching={isSearching}
                    jumpToAnnotation={jumpToAnnotation}
                    onExpandedNoteChange={setExpandedNoteId}
                    onSearchQueryChange={setSearchQuery}
                    onTabChange={setActiveTab}
                    searchQuery={searchQuery}
                    searchResults={searchResults}
                    toc={toc}
                    tocListRef={tocListRef}
                />

                <div className={styles.readerWrapper}>
                    {!isReady && (
                        <div className={styles.blockingLoadingOverlay}>
                            <div className={styles.loading}>Loading...</div>
                        </div>
                    )}

                    {isScrollMode && provider && isReady && (
                        <ScrollReaderView
                            ref={scrollReaderRef}
                            provider={provider}
                            bookId={bookId}
                            initialSpineIndex={vitraScrollParams.initialSpineIndex}
                            initialScrollOffset={vitraScrollParams.initialScrollOffset}
                            smoothConfig={{
                                enabled: settings.smoothScrollEnabled,
                                stepSizePx: settings.smoothStepSizePx,
                                animationTimeMs: settings.smoothAnimationTimeMs,
                                accelerationDeltaMs: settings.smoothAccelerationDeltaMs,
                                accelerationMax: settings.smoothAccelerationMax,
                                tailToHeadRatio: settings.smoothTailToHeadRatio,
                                easing: settings.smoothAnimationEasing,
                                reverseWheelDirection: settings.smoothReverseWheelDirection,
                            }}
                            readerStyles={readerStyleConfig}
                            onProgressChange={setCurrentProgress}
                            onChapterChange={handleChapterChange}
                            onSelectionSearch={(keyword) => {
                                setSearchQuery(keyword)
                                openSearchPanelWithKeyword(keyword)
                            }}
                        />
                    )}

                    {!isScrollMode && provider && isReady && (
                        <PaginatedReaderView
                            ref={paginatedReaderRef}
                            provider={provider}
                            bookId={bookId}
                            initialSpineIndex={paginatedParams.initialSpineIndex}
                            initialPage={paginatedParams.initialPage}
                            pageTurnMode={effectivePageTurnMode === 'paginated-double' ? 'paginated-double' : 'paginated-single'}
                            readerStyles={readerStyleConfig}
                            onProgressChange={setCurrentProgress}
                            onChapterChange={handleChapterChange}
                            onSelectionSearch={(keyword) => {
                                setSearchQuery(keyword)
                                openSearchPanelWithKeyword(keyword)
                            }}
                        />
                    )}
                </div>

                {footerEnabled && (
                    <ReaderFooter
                        bgColor={readerColors.bgColor}
                        chapterLabel={currentChapterLabel}
                        clockText={clockText}
                        footerHeight={footerHeight}
                        progressLabel={progressLabel}
                        showChapter={settings.showFooterChapter}
                        showProgress={settings.showFooterProgress}
                        showTime={settings.showFooterTime}
                        textColor={readerColors.textColor}
                        themeId={settings.themeId}
                    />
                )}

                <ReaderSettingsPanel bookFormat={bookFormat} isOpen={settingsOpen} />
            </div>
        </div>
    )
}
