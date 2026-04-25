import { useEffect, useRef } from 'react'
import type { SpineItemInfo } from '../../../engine/core/contentProvider'
import { db } from '../../../services/storageService'

interface UsePaginatedProgressOptions {
    bookId: string
    currentPage: number
    currentSpineIndex: number
    isLoading: boolean
    onChapterChange?: (label: string, href: string) => void
    onProgressChange?: (progress: number) => void
    spineItems: SpineItemInfo[]
    totalPages: number
}

export function usePaginatedProgress({
    bookId,
    currentPage,
    currentSpineIndex,
    isLoading,
    onChapterChange,
    onProgressChange,
    spineItems,
    totalPages,
}: UsePaginatedProgressOptions) {
    const progressTimerRef = useRef<number | null>(null)

    useEffect(() => {
        if (spineItems.length === 0) return
        const item = spineItems[currentSpineIndex]
        if (item) onChapterChange?.(item.id, item.href)
    }, [currentSpineIndex, spineItems, onChapterChange])

    useEffect(() => {
        if (spineItems.length === 0 || isLoading) return
        const chapterProgress = totalPages > 1 ? currentPage / (totalPages - 1) : 0
        const progress = (currentSpineIndex + Math.min(1, chapterProgress)) / spineItems.length
        const clamped = Math.max(0, Math.min(1, progress))
        onProgressChange?.(clamped)

        if (progressTimerRef.current) window.clearTimeout(progressTimerRef.current)
        progressTimerRef.current = window.setTimeout(() => {
            db.progress.put({
                bookId,
                location: `vitra:${currentSpineIndex}:${currentPage}`,
                percentage: clamped,
                currentChapter: spineItems[currentSpineIndex]?.href || '',
                updatedAt: Date.now(),
            }).catch((error) => console.warn('[PaginatedReader] Progress save failed:', error))
        }, 500)

        return () => {
            if (progressTimerRef.current) window.clearTimeout(progressTimerRef.current)
        }
    }, [currentSpineIndex, currentPage, totalPages, spineItems, isLoading, bookId, onProgressChange])
}
