import { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import noteActionIcon from '../../assets/icons/reader-note.svg'
import highlightActionIcon from '../../assets/icons/reader-highlight.svg'
import copyActionIcon from '../../assets/icons/reader-copy.svg'
import searchActionIcon from '../../assets/icons/reader-search.svg'
import webSearchActionIcon from '../../assets/icons/reader-web-search.svg'
import speakActionIcon from '../../assets/icons/reader-speak.svg'
import translateActionIcon from '../../assets/icons/reader-translate.svg'
import styles from './SelectionMenu.module.css'

export type HighlightPreset = {
    key: string
    color: string
}

export const HIGHLIGHT_PRESETS: HighlightPreset[] = [
    { key: 'cream', color: 'rgba(255, 243, 205, 0.55)' },
    { key: 'mint', color: 'rgba(209, 250, 229, 0.55)' },
    { key: 'sky', color: 'rgba(219, 234, 254, 0.55)' },
]

export interface SelectionMenuProps {
    visible: boolean
    x: number
    y: number
    onCopy: () => void
    onHighlight: (color: string) => void
    onNote: () => void
    onSearch: () => void
    onWebSearch: () => void
    onReadAloud: () => void
    onTranslate: () => void
    onDismiss: () => void
}

const MENU_HEIGHT_ESTIMATE = 160
const MENU_WIDTH_ESTIMATE = 240
const EDGE_PADDING = 8

export const SelectionMenu = ({
    visible,
    x,
    y,
    onCopy,
    onHighlight,
    onNote,
    onSearch,
    onWebSearch,
    onReadAloud,
    onTranslate,
    onDismiss,
}: SelectionMenuProps) => {
    const menuRef = useRef<HTMLDivElement>(null)

    // Click outside to dismiss
    useEffect(() => {
        if (!visible) return
        const handler = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                onDismiss()
            }
        }
        // Delay to avoid catching the same mouseup that opened the menu
        const timer = setTimeout(() => document.addEventListener('mousedown', handler), 50)
        return () => {
            clearTimeout(timer)
            document.removeEventListener('mousedown', handler)
        }
    }, [visible, onDismiss])

    // Flip below if too close to top; flip above if too close to bottom
    const flipBelow = y < MENU_HEIGHT_ESTIMATE + EDGE_PADDING
    const flipAbove = !flipBelow && y > window.innerHeight - MENU_HEIGHT_ESTIMATE - EDGE_PADDING
    const clampedX = Math.max(MENU_WIDTH_ESTIMATE / 2 + EDGE_PADDING, Math.min(x, window.innerWidth - MENU_WIDTH_ESTIMATE / 2 - EDGE_PADDING))
    const adjustedY = flipBelow ? y + 30 : flipAbove ? y - 30 : y

    return (
        <AnimatePresence>
            {visible && (
                <motion.div
                    ref={menuRef}
                    className={`${styles.selectionMenu} ${flipBelow ? styles.below : ''}`}
                    style={{ top: adjustedY, left: clampedX }}
                    initial={{ opacity: 0, scale: 0.8, y: flipBelow ? -10 : 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                >
                    <button className={styles.menuIconBtn} onClick={onNote} title="笔记">
                        <img className={styles.menuActionIcon} src={noteActionIcon} alt="" />
                    </button>
                    <button className={styles.menuIconBtn} onClick={() => onHighlight(HIGHLIGHT_PRESETS[0].color)} title="高亮">
                        <img className={styles.menuActionIcon} src={highlightActionIcon} alt="" />
                    </button>
                    <button className={styles.menuIconBtn} onClick={onCopy} title="复制">
                        <img className={styles.menuActionIcon} src={copyActionIcon} alt="" />
                    </button>
                    <button className={styles.menuIconBtn} onClick={onSearch} title="全文搜索">
                        <img className={styles.menuActionIcon} src={searchActionIcon} alt="" />
                    </button>
                    <button className={styles.menuIconBtn} onClick={onWebSearch} title="在线搜索">
                        <img className={styles.menuActionIcon} src={webSearchActionIcon} alt="" />
                    </button>
                    <button className={styles.menuIconBtn} onClick={onReadAloud} title="朗读">
                        <img className={styles.menuActionIcon} src={speakActionIcon} alt="" />
                    </button>
                    <div className={styles.menuDivider} />
                    <button className={styles.menuIconBtn} onClick={onTranslate} title="翻译">
                        <img className={styles.menuActionIcon} src={translateActionIcon} alt="" />
                    </button>
                    <div className={styles.highlightSwatches}>
                        {HIGHLIGHT_PRESETS.map((preset) => (
                            <button
                                key={preset.key}
                                className={styles.swatchBtn}
                                style={{ background: preset.color }}
                                onClick={() => onHighlight(preset.color)}
                                title="高亮颜色"
                            />
                        ))}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    )
}
