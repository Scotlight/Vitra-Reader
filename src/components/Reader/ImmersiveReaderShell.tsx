import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import type { MouseEvent, ReactNode } from 'react'
import type { TocItem } from '@/engine/core/contentProvider'
import type { ReaderPanelTab } from './readerPanelTypes'
import { scheduleCenterActiveToc } from './tocAutoScroll'
import { useReaderTabShortcut } from './useReaderTabShortcut'
import styles from './ImmersiveReaderShell.module.css'

interface ImmersiveReaderShellProps {
    readonly activeTab: ReaderPanelTab
    readonly bookTitleText: string
    readonly chapterLabel: string
    readonly clockText: string
    readonly closePanels: () => void
    readonly content: ReactNode
    readonly currentSectionHref: string
    readonly onBack: () => void
    readonly onTabChange: (tab: ReaderPanelTab) => void
    readonly onToggleFullscreen: () => void
    readonly panelContent: ReactNode
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
    bookTitleText,
    chapterLabel,
    clockText,
    closePanels,
    content,
    currentSectionHref,
    onBack,
    onTabChange,
    onToggleFullscreen,
    panelContent,
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
    const activeChromeClass = chromeActive ? styles.activeChrome : ''
    const tocListRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (!chromeActive || activeTab !== 'toc') return
        const cancel = scheduleCenterActiveToc(() => tocListRef.current)
        return () => cancel()
    }, [chromeActive, activeTab, currentSectionHref, toc.length])

    useReaderTabShortcut({ enabled: chromeActive, activeTab, onTabChange })
    const progressWidth = resolveProgressWidth(progressLabel)

    const handleContentClick = useCallback((event: MouseEvent<HTMLDivElement>) => {
        if (hasSelectedText()) return
        if ((event.target as HTMLElement).closest('a,button,input,select,textarea,[role="button"],[contenteditable="true"]')) return
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

    return (
        <div className={styles.shell}>
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

            <div ref={tocListRef} className={`${styles.glassCapsule} ${styles.tocCapsule} ${activeChromeClass}`} data-immersive-reader-chrome="true" data-active-tab={activeTab}>
                {panelContent}
            </div>

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

            {settingsOpen && (
                <div className={styles.panelLayer} data-immersive-reader-chrome="true">
                    <div className={styles.panelBackdrop} onClick={closePanels} />
                    {settingsPanel}
                </div>
            )}
        </div>
    )
}
