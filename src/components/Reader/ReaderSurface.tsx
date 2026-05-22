import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import type { TocItem } from '@/engine/core/contentProvider'
import type { PageTurnMode } from '@/stores/useSettingsStore'
import { ImmersiveReaderShell } from './ImmersiveReaderShell'
import { ReaderSettingsPanel } from './ReaderSettingsPanel'
import type { ReaderColors } from './readerColors'
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
    bookFormat: string
    bookTitleText: string
    chapterLabel: string
    clockText: string
    closePanels: () => void
    content: ReactNode
    currentSectionHref: string
    handleTocClick: (href: string) => Promise<void>
    leftPanel: ReactNode
    leftPanelOpen: boolean
    onBack: () => void
    onPageTurnModeChange: (nextMode: PageTurnMode) => void
    openSearchPanel: () => void
    openTocPanel: () => void
    progressLabel: string
    readerColors: ReaderColors
    resolvedReaderFontFamily: string
    settings: ReaderSurfaceSettings
    settingsOpen: boolean
    toc: readonly TocItem[]
    toggleLeftPanel: () => void
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
    bookFormat,
    bookTitleText,
    chapterLabel,
    clockText,
    closePanels,
    content,
    currentSectionHref,
    handleTocClick,
    leftPanel,
    leftPanelOpen,
    onBack,
    onPageTurnModeChange,
    openSearchPanel,
    openTocPanel,
    progressLabel,
    readerColors,
    resolvedReaderFontFamily,
    settings,
    settingsOpen,
    toc,
    toggleLeftPanel,
    toggleSettingsPanel,
}: ReaderSurfaceProps) {
    const readerContainerRef = useRef<HTMLDivElement | null>(null)
    const [isFullscreen, setIsFullscreen] = useState(false)

    const syncFullscreenState = useCallback(() => {
        const electronApi = window.electronAPI
        if (electronApi?.getWindowFullscreen) {
            void electronApi.getWindowFullscreen()
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
        const removeWindowFullscreenListener = window.electronAPI?.onWindowFullscreenChange?.(setIsFullscreen)
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

        const electronApi = window.electronAPI
        if (electronApi?.setWindowFullscreen) {
            void electronApi.setWindowFullscreen(!isFullscreen)
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

        void container.requestFullscreen().catch((error) => {
            console.warn('[Reader] Enter fullscreen failed:', error)
        })
    }, [isFullscreen])

    const settingsPanel = (
        <ReaderSettingsPanel
            bookFormat={bookFormat}
            isOpen={settingsOpen}
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
                bookTitleText={bookTitleText}
                chapterLabel={chapterLabel}
                clockText={clockText}
                closePanels={closePanels}
                content={content}
                currentSectionHref={currentSectionHref}
                handleTocClick={handleTocClick}
                leftPanel={leftPanel}
                leftPanelOpen={leftPanelOpen}
                onBack={onBack}
                openSearchPanel={openSearchPanel}
                openTocPanel={openTocPanel}
                onToggleFullscreen={toggleFullscreen}
                progressLabel={progressLabel}
                settingsOpen={settingsOpen}
                settingsPanel={settingsPanel}
                showFooterChapter={settings.showFooterChapter}
                showFooterProgress={settings.showFooterProgress}
                showFooterTime={settings.showFooterTime}
                toc={toc}
                toggleLeftPanel={toggleLeftPanel}
                toggleSettingsPanel={toggleSettingsPanel}
            />
        </div>
    )
}
