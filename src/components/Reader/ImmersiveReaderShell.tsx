import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import type { MouseEvent, ReactNode } from 'react'
import type { TocItem } from '@/engine/core/contentProvider'
import type { ReaderPanelTab } from './readerPanelTypes'
import { MobileReaderChrome } from './MobileReaderChrome'
import { ReaderToast, emitReaderToast } from './ReaderToast'
import { scheduleCenterActiveToc } from './tocAutoScroll'
import { useReaderTabShortcut } from './useReaderTabShortcut'
import { usePinnedSidebarResize } from './usePinnedSidebarResize'
import { formatDurationLabel, estimateRemainingMsFromProgress } from '@/services/readingStatsService'
import styles from './ImmersiveReaderShell.module.css'

const MOBILE_LANDSCAPE_QUERY = '(orientation: landscape) and (max-height: 600px)'

interface ImmersiveReaderShellProps {
    readonly activeTab: ReaderPanelTab
    readonly bookAuthorText: string
    readonly bookCover: string
    readonly bookTotalActiveMs: number
    readonly bookTitleText: string
    readonly chapterLabel: string
    readonly clockText: string
    readonly closePanels: () => void
    readonly content: ReactNode
    readonly currentSectionHref: string
    readonly currentProgress: number
    /** 沉浸模式：进书 2.5s 无交互后自动隐藏 chrome。默认关闭维持现状 */
    readonly immersiveMode?: boolean
    readonly isNightMode: boolean
    readonly onNextChapter: () => void
    readonly onBack: () => void
    readonly onPreviousChapter: () => void
    readonly onProgressCommit: (progress: number) => void
    readonly onTabChange: (tab: ReaderPanelTab) => void
    readonly onToggleNightMode: () => void
    readonly onToggleFullscreen: () => void
    readonly onPinnedSidebarWidthChange?: (width: number) => void
    readonly panelContent: ReactNode
    readonly pinnedSidebarWidth?: number
    readonly progressLabel: string
    readonly showFooterChapter: boolean
    readonly showFooterProgress: boolean
    readonly showFooterTime: boolean
    readonly settingsOpen: boolean
    readonly settingsPanel: ReactNode
    readonly toc: readonly TocItem[]
    readonly toggleSettingsPanel: () => void
}

function resolveProgressWidth(progressLabel: string): string {
    const progressValue = Number.parseFloat(progressLabel)
    if (!Number.isFinite(progressValue)) return '0%'
    return `${Math.max(0, Math.min(100, progressValue))}%`
}

function hasSelectedText(): boolean {
    return (window.getSelection()?.toString().trim().length ?? 0) > 0
}

interface StatusItemConfig {
    readonly key: string
    readonly node: ReactNode
}

function buildStatusItems(
    progressLabel: string,
    chapterLabel: string,
    clockText: string,
    showFooterProgress: boolean,
    showFooterChapter: boolean,
    showFooterTime: boolean,
): StatusItemConfig[] {
    const items: StatusItemConfig[] = []
    if (showFooterProgress) {
        items.push({
            key: 'progress',
            node: (
                <div className={styles.statusItem}>
                    <span className={styles.highlightText}>{progressLabel}</span>
                    <span className={styles.subText}>进度</span>
                </div>
            ),
        })
    }
    if (showFooterChapter) {
        items.push({
            key: 'chapter',
            node: (
                <div className={styles.statusItem}>
                    <span>{chapterLabel || '章节加载中'}</span>
                    <span className={styles.subText}>章节</span>
                </div>
            ),
        })
    }
    if (showFooterTime) {
        items.push({
            key: 'time',
            node: (
                <div className={styles.statusItem}>
                    <span>{clockText}</span>
                    <span className={styles.subText}>时间</span>
                </div>
            ),
        })
    }
    return items
}

export function ImmersiveReaderShell({
    activeTab,
    bookAuthorText,
    bookCover,
    bookTotalActiveMs,
    bookTitleText,
    chapterLabel,
    clockText,
    closePanels,
    content,
    currentSectionHref,
    currentProgress,
    immersiveMode = false,
    isNightMode,
    onNextChapter,
    onBack,
    onPreviousChapter,
    onProgressCommit,
    onTabChange,
    onToggleNightMode,
    onToggleFullscreen,
    onPinnedSidebarWidthChange,
    panelContent,
    pinnedSidebarWidth,
    progressLabel,
    showFooterChapter,
    showFooterProgress,
    showFooterTime,
    settingsOpen,
    settingsPanel,
    toc,
    toggleSettingsPanel,
}: ImmersiveReaderShellProps) {
    const [chromeActive, setChromeActive] = useState(true)
    // 沉浸模式的一次性自动隐藏：进书先显示 chrome 让用户定位，2.5s 无交互后隐去。
    // 用户在此期间点过正文（手动切过显隐）就取消——用户的显式意图优先于自动行为
    const immersiveAutoHideRef = useRef<number | null>(null)
    useEffect(() => {
        if (!immersiveMode) return
        immersiveAutoHideRef.current = window.setTimeout(() => {
            immersiveAutoHideRef.current = null
            setChromeActive(false)
        }, 2500)
        return () => {
            if (immersiveAutoHideRef.current !== null) {
                window.clearTimeout(immersiveAutoHideRef.current)
                immersiveAutoHideRef.current = null
            }
        }
    }, [immersiveMode])
    const [tocPinned, setTocPinned] = useState(() => (
        window.matchMedia?.(MOBILE_LANDSCAPE_QUERY).matches ?? false
    ))
    const activeChromeClass = chromeActive ? styles.activeChrome : ''
    const tocPinnedClass = tocPinned ? styles.tocCapsulePinned : ''
    const tocListRef = useRef<HTMLDivElement>(null)
    const { isResizing, sidebarWidth, startResize } = usePinnedSidebarResize(pinnedSidebarWidth, onPinnedSidebarWidthChange)

    useEffect(() => {
        const landscapeViewport = window.matchMedia?.(MOBILE_LANDSCAPE_QUERY)
        if (!landscapeViewport) return

        const pinLegacySidebarInLandscape = () => {
            if (landscapeViewport.matches) setTocPinned(true)
        }
        pinLegacySidebarInLandscape()
        landscapeViewport.addEventListener('change', pinLegacySidebarInLandscape)
        return () => landscapeViewport.removeEventListener('change', pinLegacySidebarInLandscape)
    }, [])

    useEffect(() => {
        if ((!chromeActive && !tocPinned) || activeTab !== 'toc') return
        const cancel = scheduleCenterActiveToc(() => tocListRef.current)
        return () => cancel()
    }, [chromeActive, tocPinned, activeTab, currentSectionHref, toc.length])

    useReaderTabShortcut({ enabled: chromeActive, activeTab, onTabChange })
    const progressWidth = resolveProgressWidth(progressLabel)

    const handleContentClick = useCallback((event: MouseEvent<HTMLDivElement>) => {
        if (hasSelectedText()) return
        if ((event.target as HTMLElement).closest('a,button,input,select,textarea,[role="button"],[contenteditable="true"]')) return
        if (immersiveAutoHideRef.current !== null) {
            window.clearTimeout(immersiveAutoHideRef.current)
            immersiveAutoHideRef.current = null
        }
        setChromeActive((current) => !current)
    }, [])
    const statusItems = buildStatusItems(
        progressLabel,
        chapterLabel,
        clockText,
        showFooterProgress,
        showFooterChapter,
        showFooterTime,
    )

    // 剩余时间：bookTotalActiveMs 与 currentProgress 都是 Shell 已有量（0~1 量纲一致可直接喂）。
    // 不足 1 分钟不显示，避免"剩余 0 分"这种撒谎文案
    const remainingMs = estimateRemainingMsFromProgress(bookTotalActiveMs, currentProgress)
    const remainingMinutes = remainingMs === null ? null : Math.round(remainingMs / 60_000)
    const remainingLabel = remainingMinutes !== null && remainingMinutes >= 1 ? `剩余 ${remainingMinutes} 分` : null

    return (
        <div
            className={styles.shell}
            data-toc-pinned={tocPinned ? 'true' : 'false'}
            data-sidebar-resizing={isResizing ? 'true' : 'false'}
            style={{ ['--pinned-sidebar-width' as string]: `min(${sidebarWidth}px, 50vw)` }}
        >
            <div className={styles.headerTrigger} />
            <div className={styles.leftSidebarTrigger} />
            <div className={styles.rightSidebarTrigger} />

            <div className={styles.contentFrame} onClick={handleContentClick}>
                {content}
            </div>

            <div className={`${styles.glassCapsule} ${styles.floatingHeader} ${activeChromeClass}`} data-immersive-reader-chrome="true">
                <div className={styles.headerLeft}>
                    <button className={styles.iconButton} onClick={onBack}>←</button>
                    <span className={styles.bookTitle}>{bookTitleText}</span>
                </div>
                <div className={styles.headerRight}>
                    <button className={`${styles.iconButton} ${settingsOpen ? styles.activeButton : ''}`} onClick={toggleSettingsPanel}>
                        ⚙ 设置
                    </button>
                    <button className={styles.iconButton} onClick={onToggleFullscreen}>
                        ⤢ 退出
                    </button>
                </div>
            </div>

            <div ref={tocListRef} className={`${styles.glassCapsule} ${styles.tocCapsule} ${activeChromeClass} ${tocPinnedClass}`} data-immersive-reader-chrome="true" data-active-tab={activeTab}>
                <button
                    type="button"
                    className={styles.tocPinButton}
                    onClick={() => setTocPinned((current) => !current)}
                    aria-label={tocPinned ? '切换为悬浮目录' : '切换为常驻目录'}
                    title={tocPinned ? '切换为悬浮目录' : '切换为常驻目录'}
                >
                    {tocPinned ? '悬浮' : '常驻'}
                </button>
                {tocPinned && (
                    <div className={styles.pinnedBookHeader}>
                        {bookCover
                            ? <img className={styles.pinnedBookCover} src={bookCover} alt="" />
                            : <div className={styles.pinnedBookCoverFallback} aria-hidden="true" />}
                        <div className={styles.pinnedBookMeta}>
                            <span className={styles.pinnedBookTitle} title={bookTitleText}>{bookTitleText}</span>
                            {bookAuthorText && (
                                <span className={styles.pinnedBookAuthor} title={bookAuthorText}>作者: {bookAuthorText}</span>
                            )}
                            {bookTotalActiveMs > 0 && (
                                <span className={styles.pinnedBookDuration}>已读: {formatDurationLabel(bookTotalActiveMs)}</span>
                            )}
                        </div>
                    </div>
                )}
                {panelContent}
            </div>

            {tocPinned && (
                <div
                    className={styles.sidebarResizeHandle}
                    role="separator"
                    aria-orientation="vertical"
                    aria-label="调整目录栏宽度"
                    onPointerDown={startResize}
                />
            )}

            {statusItems.length > 0 && (
                <div className={`${styles.glassCapsule} ${styles.statusCapsule} ${activeChromeClass}`} data-immersive-reader-chrome="true">
                    {statusItems.map((item, index) => (
                        <Fragment key={item.key}>
                            {index > 0 && <div className={styles.statusDivider} />}
                            {item.node}
                        </Fragment>
                    ))}
                </div>
            )}

            <div className={styles.bottomProgressBar} style={{ width: progressWidth }} />

            <MobileReaderChrome
                activeTab={activeTab}
                bookTitleText={bookTitleText}
                chapterCount={toc.length}
                chapterLabel={chapterLabel}
                chromeVisible={chromeActive}
                clockText={clockText}
                currentProgress={currentProgress}
                isNightMode={isNightMode}
                onBack={onBack}
                onBookmarkTap={() => emitReaderToast('书签功能即将上线')}
                onNextChapter={onNextChapter}
                onPreviousChapter={onPreviousChapter}
                onProgressCommit={onProgressCommit}
                onTabChange={onTabChange}
                onToggleNightMode={onToggleNightMode}
                panelContent={panelContent}
                remainingLabel={remainingLabel}
                settingsOpen={settingsOpen}
                showFooterChapter={showFooterChapter}
                showFooterProgress={showFooterProgress}
                showFooterTime={showFooterTime}
                toggleSettingsPanel={toggleSettingsPanel}
            />

            {settingsOpen && (
                <div className={styles.panelLayer} data-immersive-reader-chrome="true">
                    <div className={styles.panelBackdrop} onClick={closePanels} />
                    {settingsPanel}
                </div>
            )}

            <ReaderToast />
        </div>
    )
}
