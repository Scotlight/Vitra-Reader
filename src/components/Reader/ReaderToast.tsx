import { useEffect, useState } from 'react'
import styles from './ReaderToast.module.css'

/**
 * 阅读器 toast 通道（Phase 5 打底）。
 *
 * 事件驱动而不是 props/context：触发方可能在 chrome、手势层、future 的书签逻辑里，
 * 层层透传回调会把 Shell 的 props 面撑爆。CustomEvent 让任何层一行代码就能发通知。
 */

export const READER_TOAST_EVENT = 'reader:toast'

export function emitReaderToast(message: string): void {
    window.dispatchEvent(new CustomEvent(READER_TOAST_EVENT, { detail: { message } }))
}

interface ToastState {
    readonly message: string
    /** 连续两条相同文案也要重播 popIn，靠自增 id 换 key 重挂载 */
    readonly id: number
}

const TOAST_DURATION_MS = 2000

export function ReaderToast() {
    const [toast, setToast] = useState<ToastState | null>(null)

    useEffect(() => {
        let counter = 0
        const handleToast = (event: Event) => {
            const message = (event as CustomEvent<{ message?: unknown }>).detail?.message
            if (typeof message !== 'string' || message.length === 0) return
            counter += 1
            setToast({ message, id: counter })
        }
        window.addEventListener(READER_TOAST_EVENT, handleToast)
        return () => window.removeEventListener(READER_TOAST_EVENT, handleToast)
    }, [])

    useEffect(() => {
        if (!toast) return
        const timer = window.setTimeout(() => setToast(null), TOAST_DURATION_MS)
        return () => window.clearTimeout(timer)
    }, [toast])

    if (!toast) return null
    return (
        <div key={toast.id} className={styles.toast} role="status">
            {toast.message}
        </div>
    )
}
