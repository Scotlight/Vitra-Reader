import { useCallback, useEffect, useRef } from 'react'
import { addActiveReadingMs } from '../../services/readingStatsService'

interface UseReadingActivityTrackerOptions {
    bookId: string
    isReady: boolean
    idleTimeoutMs?: number
    flushThresholdMs?: number
}

const DEFAULT_IDLE_TIMEOUT_MS = 45_000
const DEFAULT_FLUSH_THRESHOLD_MS = 5_000

export function useReadingActivityTracker({
    bookId,
    isReady,
    idleTimeoutMs = DEFAULT_IDLE_TIMEOUT_MS,
    flushThresholdMs = DEFAULT_FLUSH_THRESHOLD_MS,
}: UseReadingActivityTrackerOptions) {
    const lastTickAtRef = useRef(Date.now())
    const lastActivityAtRef = useRef(0)
    const pendingActiveMsRef = useRef(0)

    const markActivity = useCallback(() => {
        lastActivityAtRef.current = Date.now()
    }, [])

    const flushPending = useCallback(async () => {
        if (!bookId || pendingActiveMsRef.current <= 0) return
        const pending = pendingActiveMsRef.current
        pendingActiveMsRef.current = 0
        await addActiveReadingMs(bookId, pending, Date.now())
    }, [bookId])

    useEffect(() => {
        pendingActiveMsRef.current = 0
        lastTickAtRef.current = Date.now()
        lastActivityAtRef.current = 0
    }, [bookId])

    useEffect(() => {
        if (!isReady) return
        markActivity()
    }, [isReady, markActivity])

    useEffect(() => {
        const isWindowActive = () => document.visibilityState === 'visible' && document.hasFocus()

        const tick = () => {
            const now = Date.now()
            const deltaMs = Math.max(0, now - lastTickAtRef.current)
            lastTickAtRef.current = now

            if (!isReady || !isWindowActive()) return
            if (now - lastActivityAtRef.current > idleTimeoutMs) return

            pendingActiveMsRef.current += deltaMs
            if (pendingActiveMsRef.current >= flushThresholdMs) {
                void flushPending()
            }
        }

        const timer = window.setInterval(tick, 1_000)
        return () => {
            window.clearInterval(timer)
        }
    }, [flushPending, flushThresholdMs, idleTimeoutMs, isReady])

    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                lastTickAtRef.current = Date.now()
                markActivity()
                return
            }
            void flushPending()
        }

        const handlePageHide = () => {
            void flushPending()
        }

        document.addEventListener('visibilitychange', handleVisibilityChange)
        window.addEventListener('pagehide', handlePageHide)
        window.addEventListener('beforeunload', handlePageHide)
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange)
            window.removeEventListener('pagehide', handlePageHide)
            window.removeEventListener('beforeunload', handlePageHide)
            void flushPending()
        }
    }, [flushPending, markActivity])

    return { markActivity, flushPending }
}
