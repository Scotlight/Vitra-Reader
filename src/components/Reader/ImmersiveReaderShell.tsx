import { useCallback, useState } from 'react'
import type { MouseEvent, ReactNode } from 'react'
import styles from './ImmersiveReaderShell.module.css'

interface ImmersiveReaderShellProps {
    readonly bookTitleText: string
    readonly chapterLabel: string
    readonly clockText: string
    readonly closePanels: () => void
    readonly content: ReactNode
    readonly leftPanel: ReactNode
    readonly leftPanelOpen: boolean
    readonly onBack: () => void
    readonly onToggleFullscreen: () => void
    readonly progressLabel: string
    readonly settingsOpen: boolean
    readonly settingsPanel: ReactNode
    readonly toggleLeftPanel: () => void
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

export function ImmersiveReaderShell({
    bookTitleText,
    chapterLabel,
    clockText,
    closePanels,
    content,
    leftPanel,
    leftPanelOpen,
    onBack,
    onToggleFullscreen,
    progressLabel,
    settingsOpen,
    settingsPanel,
    toggleLeftPanel,
    toggleSettingsPanel,
}: ImmersiveReaderShellProps) {
    const [chromeActive, setChromeActive] = useState(true)
    const activeChromeClass = chromeActive ? styles.activeChrome : ''
    const progressWidth = resolveProgressWidth(progressLabel)

    const handleContentClick = useCallback((event: MouseEvent<HTMLDivElement>) => {
        if (hasSelectedText()) return
        if ((event.target as HTMLElement).closest('a,button,input,select,textarea,[role="button"],[contenteditable="true"]')) return
        setChromeActive((current) => !current)
    }, [])

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
                    <button className={`${styles.iconButton} ${leftPanelOpen ? styles.activeButton : ''}`} onClick={toggleLeftPanel}>
                        ≡ 目录
                    </button>
                    <button className={`${styles.iconButton} ${settingsOpen ? styles.activeButton : ''}`} onClick={toggleSettingsPanel}>
                        ⚙ 设置
                    </button>
                    <button className={styles.iconButton} onClick={onToggleFullscreen}>
                        ⤢ 退出
                    </button>
                </div>
            </div>

            <div className={`${styles.glassCapsule} ${styles.tocCapsule} ${activeChromeClass}`} data-immersive-reader-chrome="true">
                <div className={styles.capsuleTitle}>目录</div>
                <button className={styles.capsuleAction} onClick={toggleLeftPanel}>
                    {leftPanelOpen ? '收起目录/搜索' : '打开目录/搜索'}
                </button>
            </div>

            <div className={`${styles.glassCapsule} ${styles.statusCapsule} ${activeChromeClass}`} data-immersive-reader-chrome="true">
                <div className={styles.statusItem}>
                    <span className={styles.highlightText}>{progressLabel}</span>
                    <span className={styles.subText}>进度</span>
                </div>
                <div className={styles.statusDivider} />
                <div className={styles.statusItem}>
                    <span>{chapterLabel || '章节加载中'}</span>
                    <span className={styles.subText}>章节</span>
                </div>
                <div className={styles.statusDivider} />
                <div className={styles.statusItem}>
                    <span>{clockText}</span>
                    <span className={styles.subText}>时间</span>
                </div>
            </div>

            <div className={styles.bottomProgressBar} style={{ width: progressWidth }} />

            {(leftPanelOpen || settingsOpen) && (
                <div className={styles.panelLayer} data-immersive-reader-chrome="true">
                    <div className={styles.panelBackdrop} onClick={closePanels} />
                    {leftPanel}
                    {settingsPanel}
                </div>
            )}
        </div>
    )
}
