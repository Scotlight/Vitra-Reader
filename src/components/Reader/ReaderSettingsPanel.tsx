import { AnimatePresence, motion } from 'framer-motion'
import { useSettingsStore } from '@/stores/useSettingsStore'
import type { PageTurnMode } from '@/stores/useSettingsStore'
import { ReaderAppearanceSettings } from './ReaderAppearanceSettings'
import { ReaderModeSettings } from './ReaderModeSettings'
import styles from './ReaderView.module.css'

interface ReaderSettingsPanelProps {
    readonly bookFormat: string
    readonly isOpen: boolean
    readonly onPageTurnModeChange: (mode: PageTurnMode) => void
    readonly placement?: 'side' | 'bottom'
}

export function ReaderSettingsPanel({ bookFormat, isOpen, onPageTurnModeChange, placement = 'side' }: ReaderSettingsPanelProps) {
    const settings = useSettingsStore()
    const isBottomPlacement = placement === 'bottom'

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    className={isBottomPlacement ? styles.panelBottomCapsule : styles.panelRight}
                    initial={isBottomPlacement ? { y: 300, opacity: 0 } : { x: 300, opacity: 0 }}
                    animate={isBottomPlacement ? { y: 0, opacity: 1 } : { x: 0, opacity: 1 }}
                    exit={isBottomPlacement ? { y: 300, opacity: 0 } : { x: 300, opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                >
                    <div className={`${styles.scrollContent} ${isBottomPlacement ? styles.bottomSettingsContent : ''}`}>
                        <div className={styles.settingsHeader}>
                            <h3>外观设置</h3>
                            <button className={styles.resetBtn} onClick={settings.resetToDefaults}>重置</button>
                        </div>
                        <ReaderAppearanceSettings />
                        <ReaderModeSettings bookFormat={bookFormat} onPageTurnModeChange={onPageTurnModeChange} />
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    )
}
