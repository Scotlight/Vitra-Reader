import { useEffect, useState } from 'react'
import type { MouseEvent, ReactNode } from 'react'
import type { ReaderPanelTab } from './readerPanelTypes'
import styles from './MobileReaderChrome.module.css'

interface MobileReaderChromeProps {
    readonly activeTab: ReaderPanelTab
    readonly chapterCount: number
    readonly chapterLabel: string
    readonly clockText: string
    readonly currentProgress: number
    readonly isNightMode: boolean
    readonly onNextChapter: () => void
    readonly onPreviousChapter: () => void
    readonly onProgressCommit: (progress: number) => void
    readonly onTabChange: (tab: ReaderPanelTab) => void
    readonly onToggleNightMode: () => void
    readonly panelContent: ReactNode
    readonly settingsOpen: boolean
    readonly showFooterChapter: boolean
    readonly showFooterProgress: boolean
    readonly showFooterTime: boolean
    readonly toggleSettingsPanel: () => void
}

function clampProgress(progress: number): number {
    if (!Number.isFinite(progress)) return 0
    return Math.max(0, Math.min(1, progress))
}

export function MobileReaderChrome({
    activeTab,
    chapterCount,
    chapterLabel,
    clockText,
    currentProgress,
    isNightMode,
    onNextChapter,
    onPreviousChapter,
    onProgressCommit,
    onTabChange,
    onToggleNightMode,
    panelContent,
    settingsOpen,
    showFooterChapter,
    showFooterProgress,
    showFooterTime,
    toggleSettingsPanel,
}: MobileReaderChromeProps) {
    const [drawerOpen, setDrawerOpen] = useState(false)
    const [progressOpen, setProgressOpen] = useState(true)
    const [draftProgress, setDraftProgress] = useState(() => clampProgress(currentProgress))

    useEffect(() => {
        setDraftProgress(clampProgress(currentProgress))
    }, [currentProgress])

    useEffect(() => {
        if (settingsOpen) setDrawerOpen(false)
    }, [settingsOpen])

    const progressPercent = Math.round(draftProgress * 100)
    const handlePanelClick = (event: MouseEvent<HTMLDivElement>) => {
        if ((event.target as HTMLElement).closest('[data-reader-panel-navigation="true"]')) {
            setDrawerOpen(false)
        }
    }
    const commitProgress = () => onProgressCommit(draftProgress)

    return (
        <div className={styles.mobileChrome} data-mobile-reader-chrome="true">
            <aside className={styles.statusCapsule} aria-label="阅读状态">
                {showFooterProgress && (
                    <div className={styles.statusItem}>
                        <strong>{progressPercent}%</strong>
                        <span>进度</span>
                    </div>
                )}
                {showFooterChapter && (
                    <div className={styles.statusItem}>
                        <span className={styles.chapterName}>{chapterLabel || '章节加载中'}</span>
                        <span>章节</span>
                    </div>
                )}
                {showFooterTime && (
                    <div className={styles.statusItem}>
                        <b>{clockText}</b>
                        <span>时间</span>
                    </div>
                )}
            </aside>

            <div className={`${styles.progressControls} ${progressOpen ? styles.progressControlsOpen : ''}`} aria-hidden={!progressOpen}>
                <button type="button" onClick={onPreviousChapter}>上一章</button>
                <input
                    aria-label="阅读进度"
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={progressPercent}
                    onChange={(event) => setDraftProgress(Number(event.target.value) / 100)}
                    onPointerUp={commitProgress}
                    onTouchEnd={commitProgress}
                    onKeyUp={commitProgress}
                />
                <button type="button" onClick={onNextChapter}>下一章</button>
            </div>

            <nav className={styles.bottomNav} aria-label="移动端阅读工具栏">
                <button
                    type="button"
                    className={drawerOpen ? styles.activeAction : ''}
                    onClick={() => {
                        onTabChange('toc')
                        setDrawerOpen((open) => !open)
                    }}
                    aria-expanded={drawerOpen}
                >
                    <MobileIcon name="toc" />
                    <span>目录</span>
                </button>
                <button
                    type="button"
                    className={progressOpen ? styles.activeAction : ''}
                    onClick={() => setProgressOpen((open) => !open)}
                    aria-expanded={progressOpen}
                >
                    <span className={styles.progressIcon}>{progressPercent}%</span>
                    <span>进度</span>
                </button>
                <button
                    type="button"
                    className={settingsOpen ? styles.activeAction : ''}
                    onClick={toggleSettingsPanel}
                    aria-expanded={settingsOpen}
                >
                    <MobileIcon name="settings" />
                    <span>设置</span>
                </button>
                <button
                    type="button"
                    className={isNightMode ? styles.activeAction : ''}
                    onClick={onToggleNightMode}
                    aria-pressed={isNightMode}
                >
                    <MobileIcon name="night" />
                    <span>夜间</span>
                </button>
            </nav>

            {drawerOpen && (
                <div className={styles.drawerLayer}>
                    <button type="button" className={styles.drawerBackdrop} onClick={() => setDrawerOpen(false)} aria-label="关闭目录" />
                    <aside className={styles.drawer} aria-label="阅读目录面板" onClick={handlePanelClick} data-active-tab={activeTab}>
                        <nav className={styles.drawerTabs} aria-label="目录面板标签">
                            <button type="button" className={activeTab === 'toc' ? styles.drawerTabActive : ''} onClick={() => onTabChange('toc')}>目录</button>
                            <button type="button" className={activeTab === 'search' ? styles.drawerTabActive : ''} onClick={() => onTabChange('search')}>搜索</button>
                            <button type="button" className={activeTab === 'annotations' ? styles.drawerTabActive : ''} onClick={() => onTabChange('annotations')}>书签</button>
                        </nav>
                        {panelContent}
                        <div className={styles.drawerFooter}>
                            <span>☷ 正序</span>
                            <span>共 {chapterCount} 章</span>
                        </div>
                    </aside>
                </div>
            )}

        </div>
    )
}

interface MobileIconProps {
    readonly name: 'toc' | 'settings' | 'night'
}

function MobileIcon({ name }: MobileIconProps) {
    if (name === 'toc') {
        return (
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />
            </svg>
        )
    }
    if (name === 'settings') {
        return (
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M8 14v6" />
            </svg>
        )
    }
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M20 15.4A8.6 8.6 0 0 1 8.6 4 8.5 8.5 0 1 0 20 15.4Z" />
        </svg>
    )
}
