import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import styles from './TranslationDialog.module.css'

/** 复制成功反馈的显示时长（ms） */
const COPY_FEEDBACK_DURATION_MS = 1200

interface TranslationDialogProps {
    visible: boolean
    sourceText: string
    translatedText: string
    providerLabel: string
    fromCache: boolean
    loading: boolean
    error: string
    onRetry: () => void
    onClose: () => void
}

export const TranslationDialog = ({
    visible,
    sourceText,
    translatedText,
    providerLabel,
    fromCache,
    loading,
    error,
    onRetry,
    onClose,
}: TranslationDialogProps) => {
    const [copied, setCopied] = useState(false)

    useEffect(() => {
        if (!copied) return
        const timer = window.setTimeout(() => setCopied(false), COPY_FEEDBACK_DURATION_MS)
        return () => window.clearTimeout(timer)
    }, [copied])

    const handleCopy = async () => {
        if (!translatedText) return
        try {
            await navigator.clipboard.writeText(translatedText)
            setCopied(true)
        } catch {
            setCopied(false)
        }
    }

    return (
        <AnimatePresence>
            {visible && (
                <motion.div
                    className={styles.overlay}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={onClose}
                >
                    <motion.div
                        className={styles.dialog}
                        initial={{ opacity: 0, y: 12, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 8, scale: 0.98 }}
                        transition={{ duration: 0.18 }}
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className={styles.header}>
                            <strong>翻译结果</strong>
                            <button className={styles.closeBtn} onClick={onClose}>×</button>
                        </div>
                        <div className={styles.meta}>
                            <span>Provider: {providerLabel}</span>
                            {fromCache && <span className={styles.cacheTag}>缓存命中</span>}
                        </div>

                        <div className={styles.block}>
                            <div className={styles.blockLabel}>原文</div>
                            <div className={styles.blockContent}>{sourceText || '-'}</div>
                        </div>

                        <div className={styles.block}>
                            <div className={styles.blockLabel}>译文</div>
                            {loading ? (
                                <div className={styles.loading}>翻译中...</div>
                            ) : error ? (
                                <div className={styles.error}>{error}</div>
                            ) : (
                                <div className={styles.blockContent}>{translatedText || '-'}</div>
                            )}
                        </div>

                        <div className={styles.actions}>
                            <button className={styles.btn} onClick={onRetry} disabled={loading}>重试</button>
                            <button className={styles.btn} onClick={handleCopy} disabled={loading || !translatedText}>
                                {copied ? '已复制' : '复制译文'}
                            </button>
                            <button className={styles.primaryBtn} onClick={onClose}>关闭</button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    )
}

