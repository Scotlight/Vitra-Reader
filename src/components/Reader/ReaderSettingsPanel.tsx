import { AnimatePresence, motion } from 'framer-motion'
import { useSettingsStore } from '../../stores/useSettingsStore'
import { ReaderAppearanceSettings } from './ReaderAppearanceSettings'
import { ReaderModeSettings } from './ReaderModeSettings'
import styles from './ReaderView.module.css'

interface ReaderSettingsPanelProps {
    readonly bookFormat: string
    readonly isOpen: boolean
}

export function ReaderSettingsPanel({ bookFormat, isOpen }: ReaderSettingsPanelProps) {
    const settings = useSettingsStore()

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    className={styles.panelRight}
                    initial={{ x: 300, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: 300, opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                >
                    <div className={styles.scrollContent}>
                        <div className={styles.settingsHeader}>
                            <h3>外观设置</h3>
                            <button className={styles.resetBtn} onClick={settings.resetToDefaults}>重置</button>
                        </div>
                        <ReaderAppearanceSettings />
                        <ReaderModeSettings bookFormat={bookFormat} />
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    )
}
