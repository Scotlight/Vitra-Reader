import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import type { PageTurnMode } from '@/stores/useSettingsStore'
import { ReaderFooter } from './ReaderFooter'
import { ReaderSettingsPanel } from './ReaderSettingsPanel'
import { ReaderToolbar } from './ReaderToolbar'
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
    footerHeight: number
    headerHeight: number
    leftPanel: ReactNode
    leftPanelOpen: boolean
    onBack: () => void
    onPageTurnModeChange: (nextMode: PageTurnMode) => void
    progressLabel: string
    readerColors: ReaderColors
    resolvedReaderFontFamily: string
    settings: ReaderSurfaceSettings
    settingsOpen: boolean
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
    footerHeight,
    headerHeight,
    leftPanel,
    leftPanelOpen,
    onBack,
    onPageTurnModeChange,
    progressLabel,
    readerColors,
    resolvedReaderFontFamily,
    settings,
    settingsOpen,
    toggleLeftPanel,
    toggleSettingsPanel,
}: ReaderSurfaceProps) {
    const footerEnabled = footerHeight > 0
    const readerContainerRef = useRef<HTMLDivElement | null>(null)
    const [isFullscreen, setIsFullscreen] = useState(false)

    const syncFullscreenState = useCallback(() => {
        setIsFullscreen(document.fullscreenElement === readerContainerRef.current)
    }, [])

    useEffect(() => {
        document.addEventListener('fullscreenchange', syncFullscreenState)
        syncFullscreenState()
        return () => {
            document.removeEventListener('fullscreenchange', syncFullscreenState)
        }
    }, [syncFullscreenState])

    const toggleFullscreen = useCallback(() => {
        const container = readerContainerRef.current
        if (!container) return

        if (document.fullscreenElement === container) {
            void document.exitFullscreen().catch((error) => {
                console.warn('[Reader] Exit fullscreen failed:', error)
            })
            return
        }

        void container.requestFullscreen().catch((error) => {
            console.warn('[Reader] Enter fullscreen failed:', error)
        })
    }, [])

    return (
        <div
            ref={readerContainerRef}
            className={`${styles.readerContainer} ${isFullscreen ? styles.readerContainerFullscreen : ''}`}
            style={buildReaderContainerStyle(readerColors, resolvedReaderFontFamily, settings)}
        >
            <ReaderToolbar
                bookTitleText={bookTitleText}
                headerHeight={headerHeight}
                isFullscreen={isFullscreen}
                leftPanelOpen={leftPanelOpen}
                onBack={onBack}
                onToggleFullscreen={toggleFullscreen}
                settingsOpen={settingsOpen}
                toggleLeftPanel={toggleLeftPanel}
                toggleSettingsPanel={toggleSettingsPanel}
            />

            <div className={styles.contentArea} style={{ paddingTop: `${headerHeight}px`, paddingBottom: `${footerEnabled ? footerHeight : 0}px` }}>
                {(leftPanelOpen || settingsOpen) && <div className={styles.panelBackdrop} onClick={closePanels} />}
                {leftPanel}

                <div className={styles.readerWrapper}>{content}</div>

                {footerEnabled && (
                    <ReaderFooter
                        bgColor={readerColors.bgColor}
                        chapterLabel={chapterLabel}
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

                <ReaderSettingsPanel
                    bookFormat={bookFormat}
                    isOpen={settingsOpen}
                    onPageTurnModeChange={onPageTurnModeChange}
                />
            </div>
        </div>
    )
}
