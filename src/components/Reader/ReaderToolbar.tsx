import { motion } from 'framer-motion'
import styles from './ReaderView.module.css'

interface ReaderToolbarProps {
    readonly bookTitleText: string
    readonly headerHeight: number
    readonly isFullscreen: boolean
    readonly leftPanelOpen: boolean
    readonly onBack: () => void
    readonly onToggleFullscreen: () => void
    readonly settingsOpen: boolean
    readonly toggleLeftPanel: () => void
    readonly toggleSettingsPanel: () => void
}

export function ReaderToolbar({
    bookTitleText,
    headerHeight,
    isFullscreen,
    leftPanelOpen,
    onBack,
    onToggleFullscreen,
    settingsOpen,
    toggleLeftPanel,
    toggleSettingsPanel,
}: ReaderToolbarProps) {
    return (
        <motion.div
            className={styles.toolbar}
            style={{ height: `${headerHeight}px` }}
            initial={{ y: -50 }}
            animate={{ y: 0 }}
        >
            <button className={styles.iconBtn} onClick={onBack}>← Back</button>
            <div className={styles.centerInfo}>
                <span className={styles.bookTitle}>{bookTitleText}</span>
            </div>
            <div className={styles.actions}>
                <button className={`${styles.iconBtn} ${leftPanelOpen ? styles.active : ''}`} onClick={toggleLeftPanel}>
                    ≡ 目录/搜索
                </button>
                <button className={`${styles.iconBtn} ${settingsOpen ? styles.active : ''}`} onClick={toggleSettingsPanel}>
                    ⚙ 设置
                </button>
                <button
                    aria-pressed={isFullscreen}
                    className={`${styles.iconBtn} ${isFullscreen ? styles.active : ''}`}
                    onClick={onToggleFullscreen}
                    title={isFullscreen ? '退出全屏' : '全屏阅读'}
                >
                    {isFullscreen ? '⤢ 退出全屏' : '⛶ 全屏'}
                </button>
            </div>
        </motion.div>
    )
}
