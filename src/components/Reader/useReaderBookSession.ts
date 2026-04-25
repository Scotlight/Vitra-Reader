import { useCallback, useEffect, useRef, useState } from 'react'
import type { ContentProvider } from '../../engine/core/contentProvider'
import type { PageTurnMode } from '../../stores/useSettingsStore'
import {
    INITIAL_READER_BOOK_SESSION_STATE,
    loadReaderBookSession,
    type ReaderBookSessionState,
} from './readerBookSessionLoader'

interface UseReaderBookSessionOptions {
    readonly bookId: string
    readonly pageTurnMode: PageTurnMode
}

export function useReaderBookSession({ bookId, pageTurnMode }: UseReaderBookSessionOptions) {
    const [session, setSession] = useState<ReaderBookSessionState>(INITIAL_READER_BOOK_SESSION_STATE)
    const pageTurnModeRef = useRef(pageTurnMode)
    pageTurnModeRef.current = pageTurnMode

    const setCurrentProgress = useCallback((progress: number) => {
        setSession((current) => ({ ...current, currentProgress: progress }))
    }, [])

    useEffect(() => {
        let alive = true
        let activeProvider: ContentProvider | null = null

        setSession((current) => ({ ...current, isReady: false, provider: null, toc: [] }))

        void loadReaderBookSession(bookId, pageTurnModeRef.current).then((nextSession) => {
            if (!alive) {
                nextSession.provider?.destroy()
                return
            }
            activeProvider = nextSession.provider
            setSession(nextSession)
        })

        return () => {
            alive = false
            activeProvider?.destroy()
        }
    }, [bookId])

    return {
        ...session,
        setCurrentProgress,
    }
}

