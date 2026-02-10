import { useEffect, useState } from 'react'
import { useSettingsStore } from './stores/useSettingsStore'
import { useSyncStore } from './stores/useSyncStore'
import { LibraryView } from './components/Library/LibraryView'
import { ReaderView } from './components/Reader/ReaderView'
import styles from './App.module.css'

type View = 'library' | 'reader'

function App() {
    const [currentView, setCurrentView] = useState<View>('library')
    const [currentBookId, setCurrentBookId] = useState<string | null>(null)
    const settings = useSettingsStore()
    const syncStore = useSyncStore()

    const handleOpenBook = (bookId: string) => {
        setCurrentBookId(bookId)
        setCurrentView('reader')
    }

    const handleBackToLibrary = () => {
        setCurrentView('library')
        setCurrentBookId(null)
    }

    useEffect(() => {
        const allowedThemes = new Set(['light', 'dark', 'sepia', 'green'])
        const themeForWindow = allowedThemes.has(settings.themeId) ? settings.themeId : 'light'
        document.documentElement.setAttribute('data-theme', themeForWindow)
    }, [settings.themeId, settings.customBgColor, settings.customTextColor])

    useEffect(() => {
        let intervalId: number | undefined
        let mounted = true

        const bootAutoSync = async () => {
            await syncStore.loadConfig()
            if (!mounted) return

            await syncStore.autoSync('startup')

            intervalId = window.setInterval(() => {
                void syncStore.autoSync('interval')
            }, 15 * 60 * 1000)
        }

        void bootAutoSync()

        const handleBeforeUnload = () => {
            void syncStore.autoSync('exit')
        }

        window.addEventListener('beforeunload', handleBeforeUnload)

        return () => {
            mounted = false
            if (intervalId) window.clearInterval(intervalId)
            window.removeEventListener('beforeunload', handleBeforeUnload)
        }
    }, [])

    return (
        <div
            className={styles.app}
            style={{
                '--reader-bg': settings.customBgColor || 'var(--bg-primary)',
                '--reader-text': settings.customTextColor || 'var(--text-primary)',
                '--font-family': settings.fontFamily,
                // Apply UI settings globally
                '--ui-opacity': settings.uiOpacity,
                '--ui-blur': `${settings.uiBlurStrength}px`,
                '--ui-roundness': `${settings.uiRoundness}px`,
                '--ui-transition-speed': settings.uiAnimation ? '0.25s' : '0s',
            } as React.CSSProperties}
        >
            {/* Main Content */}
            <main className={styles.main}>
                {currentView === 'library' ? (
                    <LibraryView onOpenBook={handleOpenBook} />
                ) : (
                    <ReaderView bookId={currentBookId!} onBack={handleBackToLibrary} />
                )}
            </main>
        </div>
    )
}

export default App
