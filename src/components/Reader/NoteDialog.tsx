import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import styles from './NoteDialog.module.css'

interface NoteDialogProps {
    visible: boolean
    selectedText: string
    onSave: (note: string) => void
    onCancel: () => void
}

export const NoteDialog = ({ visible, selectedText, onSave, onCancel }: NoteDialogProps) => {
    const [note, setNote] = useState('')
    const textareaRef = useRef<HTMLTextAreaElement>(null)

    useEffect(() => {
        if (visible) {
            setNote('')
            setTimeout(() => textareaRef.current?.focus(), 100)
        }
    }, [visible])

    const handleSave = () => {
        onSave(note.trim())
        setNote('')
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && e.ctrlKey) {
            e.preventDefault()
            handleSave()
        }
        if (e.key === 'Escape') {
            onCancel()
        }
    }

    return (
        <AnimatePresence>
            {visible && (
                <>
                    <motion.div
                        className={styles.backdrop}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onCancel}
                    />
                    <motion.div
                        className={styles.dialog}
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 20 }}
                    >
                        <h3 className={styles.title}>添加笔记</h3>
                        <div className={styles.quote}>
                            <span className={styles.quoteLabel}>引用文本：</span>
                            <p className={styles.quoteText}>"{selectedText}"</p>
                        </div>
                        <textarea
                            ref={textareaRef}
                            className={styles.textarea}
                            placeholder="写下你的想法..."
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            onKeyDown={handleKeyDown}
                            rows={4}
                        />
                        <div className={styles.actions}>
                            <button className={styles.cancelBtn} onClick={onCancel}>
                                取消
                            </button>
                            <button className={styles.saveBtn} onClick={handleSave}>
                                保存 (Ctrl+Enter)
                            </button>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    )
}
