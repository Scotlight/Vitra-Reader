import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import type { TocItem } from '@/engine/core/contentProvider'
import type { PageTurnMode } from '@/stores/useSettingsStore'
import { getWindowFullscreenBridge, requestElementFullscreen } from '@/services/platform/platformBridge'
import { ImmersiveReaderShell } from './ImmersiveReaderShell'
import { ReaderSettingsPanel } from './ReaderSettingsPanel'
import type { ReaderColors } from './readerColors'
import type { ReaderPanelTab } from './readerPanelTypes'
import styles from './ReaderView.module.css'

interface ReaderSurfaceSettings {
    fontSize: number
    letterSpacing: number
    lineHeight: number
    paragraphSpacing: number
    showFooterChapter: boolean
    showFooterProgress: boolean
    showFooterTime: boolean
    textAlign: string
    themeId: string
}

interface ReaderSurfaceProps {
    activeTab: ReaderPanelTab
    bookFormat: string
    bookTitleText: string
    chapterLabel: string
    clockText: string
    closePanels: () => void
    content: ReactNode
    currentSectionHref: string
    onBack: () => void
    onPageTurnModeChange: (nextMode: PageTurnMode) => void
    onTabChange: (tab: ReaderPanelTab) => void
    panelContent: ReactNode
    progressLabel: string
    readerColors: ReaderColors
    resolvedReaderFontFamily: string
    settings: ReaderSurfaceSettings
    settingsOpen: boolean
    toc: readonly TocItem[]
    toggleSettingsPanel: () => void
}

function buildReaderContainerStyle(
    readerColors: ReaderColors,
    resolvedReaderFontFamily: string,
    settings: ReaderSurfaceSettings,
): CSSProperties {
    return {
        background: readerColors.bgColor,
        color: readerColors.textColor,
        ['--reader-bg-color' as string]: readerColors.bgColor,
        ['--reader-text-color' as string]: readerColors.textColor,
        ['--reader-font-family' as string]: resolvedReaderFontFamily,
        ['--reader-font-size' as string]: `${settings.fontSize}px`,
        ['--reader-line-height' as string]: String(settings.lineHeight),
        ['--reader-letter-spacing' as string]: `${settings.letterSpacing}px`,
        ['--reader-paragraph-spacing' as string]: `${settings.paragraphSpacing}px`,
        ['--reader-text-align' as string]: settings.textAlign,
    }
}

export function ReaderSurface({
    activeTab,
    bookFormat,
    bookTitleText,
    chapterLabel,
    clockText,
    closePanels,
    content,
    currentSectionHref,
    onBack,
    onPageTurnModeChange,
    onTabChange,
    panelContent,
    progressLabel,
    readerColors,
    resolvedReaderFontFamily,
    settings,
    settingsOpen,
    toc,
    toggleSettingsPanel,
}: ReaderSurfaceProps) {
    const readerContainerRef = useRef<HTMLDivElement | null>(null)
    const [isFullscreen, setIsFullscreen] = useState(false)

    const syncFullscreenState = useCallback(() => {
        const windowFullscreen = getWindowFullscreenBridge()
        if (windowFullscreen) {
            void windowFullscreen.get()
                .then(setIsFullscreen)
                .catch((error) => {
                    console.warn('[Reader] Get window fullscreen state failed:', error)
                    setIsFullscreen(document.fullscreenElement === readerContainerRef.current)
                })
            return
        }

        setIsFullscreen(document.fullscreenElement === readerContainerRef.current)
    }, [])

    useEffect(() => {
        const removeWindowFullscreenListener = getWindowFullscreenBridge()?.onChange(setIsFullscreen)
        document.addEventListener('fullscreenchange', syncFullscreenState)
        syncFullscreenState()
        return () => {
            removeWindowFullscreenListener?.()
            document.removeEventListener('fullscreenchange', syncFullscreenState)
        }
    }, [syncFullscreenState])

    const toggleFullscreen = useCallback(() => {
        const container = readerContainerRef.current
        if (!container) return

        const windowFullscreen = getWindowFullscreenBridge()
        if (windowFullscreen) {
            void windowFullscreen.set(!isFullscreen)
                .then(setIsFullscreen)
                .catch((error) => {
                    console.warn('[Reader] Toggle window fullscreen failed:', error)
                })
            return
        }

        if (document.fullscreenElement === container) {
            void document.exitFullscreen().catch((error) => {
                console.warn('[Reader] Exit fullscreen failed:', error)
            })
            return
        }

        void requestElementFullscreen(container).catch((error) => {
            console.warn('[Reader] Enter fullscreen failed:', error)
        })
    }, [isFullscreen])

    const settingsPanel = (
        <ReaderSettingsPanel
            bookFormat={bookFormat}
            isOpen={settingsOpen}
            onClose={closePanels}
            onPageTurnModeChange={onPageTurnModeChange}
            placement="bottom"
        />
    )

    return (
        <div
            ref={readerContainerRef}
            className={`${styles.readerContainer} ${styles.readerContainerFullscreen}`}
            style={buildReaderContainerStyle(readerColors, resolvedReaderFontFamily, settings)}
        >
            <ImmersiveReaderShell
                activeTab={activeTab}
                bookTitleText={bookTitleText}
                chapterLabel={chapterLabel}
                clockText={clockText}
                closePanels={closePanels}
                content={content}
                currentSectionHref={currentSectionHref}
                onBack={onBack}
                onTabChange={onTabChange}
                onToggleFullscreen={toggleFullscreen}
                panelContent={panelContent}
                progressLabel={progressLabel}
                settingsOpen={settingsOpen}
                settingsPanel={settingsPanel}
                showFooterChapter={settings.showFooterChapter}
                showFooterProgress={settings.showFooterProgress}
                showFooterTime={settings.showFooterTime}
                toc={toc}
                toggleSettingsPanel={toggleSettingsPanel}
            />
        </div>
    )
}
