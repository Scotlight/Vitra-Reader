import { useCallback, useEffect, useState, type RefObject } from 'react'
import type { ContentProvider } from '@/engine/core/contentProvider'
import type { PageTurnMode } from '@/stores/useSettingsStore'
import type { PaginatedReaderHandle } from './PaginatedReaderView'
import type { ScrollReaderHandle } from './ScrollReaderView'
import {
    createFallbackModePositionSnapshot,
    type ReaderModePositionSnapshot,
} from './readerModeSwitchPosition'

interface ReaderModeSwitchAnchor {
    readonly serial: number
    readonly snapshot: ReaderModePositionSnapshot
}

interface UseReaderModeSwitchOptions {
    readonly bookId: string
    readonly currentProgress: number
    readonly currentSectionHref: string
    readonly effectivePageTurnMode: PageTurnMode
    readonly isScrollMode: boolean
    readonly pageTurnMode: PageTurnMode
    readonly paginatedInitialSpineIndex: number
    readonly paginatedReaderRef: RefObject<PaginatedReaderHandle | null>
    readonly provider: ContentProvider | null
    readonly scrollInitialSpineIndex: number
    readonly scrollReaderRef: RefObject<ScrollReaderHandle | null>
    readonly updatePageTurnMode: (nextMode: PageTurnMode) => void
}

export function useReaderModeSwitch({
    bookId,
    currentProgress,
    currentSectionHref,
    effectivePageTurnMode,
    isScrollMode,
    pageTurnMode,
    paginatedInitialSpineIndex,
    paginatedReaderRef,
    provider,
    scrollInitialSpineIndex,
    scrollReaderRef,
    updatePageTurnMode,
}: UseReaderModeSwitchOptions) {
    const [modeSwitchAnchor, setModeSwitchAnchor] = useState<ReaderModeSwitchAnchor | null>(null)

    useEffect(() => {
        setModeSwitchAnchor(null)
    }, [bookId])

    const getFallbackModePositionSnapshot = useCallback(() => {
        const fallbackSpineIndex = isScrollMode
            ? scrollInitialSpineIndex
            : paginatedInitialSpineIndex
        return createFallbackModePositionSnapshot({
            currentProgress,
            currentSectionHref,
            fallbackSpineIndex,
            provider,
            sourceMode: effectivePageTurnMode,
        })
    }, [
        currentProgress,
        currentSectionHref,
        effectivePageTurnMode,
        isScrollMode,
        paginatedInitialSpineIndex,
        provider,
        scrollInitialSpineIndex,
    ])

    const handlePageTurnModeChange = useCallback((nextMode: PageTurnMode) => {
        if (nextMode === pageTurnMode) return
        const liveSnapshot = isScrollMode
            ? scrollReaderRef.current?.getPosition()
            : paginatedReaderRef.current?.getPosition()
        const snapshot = liveSnapshot ?? getFallbackModePositionSnapshot()
        setModeSwitchAnchor((current) => ({
            serial: (current?.serial ?? 0) + 1,
            snapshot,
        }))
        updatePageTurnMode(nextMode)
    }, [
        getFallbackModePositionSnapshot,
        isScrollMode,
        pageTurnMode,
        paginatedReaderRef,
        scrollReaderRef,
        updatePageTurnMode,
    ])

    return {
        handlePageTurnModeChange,
        modeSwitchAnchor,
    }
}
