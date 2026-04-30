import { useEffect, useRef, type MutableRefObject, type RefObject } from 'react'
import {
    applyPaginatedHorizontalWindow,
    collectPaginatedHorizontalWindowItems,
    resolvePaginatedHorizontalWindow,
    restorePaginatedHorizontalWindowItems,
    shouldUsePaginatedHorizontalWindowing,
    type PaginatedHorizontalWindowItem,
} from './paginatedHorizontalWindowing'

const PAGE_WIDTH_CHANGE_TOLERANCE_PX = 1

interface UsePaginatedHorizontalWindowingOptions {
    viewportRef: RefObject<HTMLDivElement | null>
    columnRef: RefObject<HTMLDivElement | null>
    chapterNode: HTMLElement | null
    displayPage: number
    totalPages: number
}

function cancelFrame(frameRef: MutableRefObject<number | null>): void {
    if (frameRef.current === null) return
    window.cancelAnimationFrame(frameRef.current)
    frameRef.current = null
}

export function usePaginatedHorizontalWindowing({
    viewportRef,
    columnRef,
    chapterNode,
    displayPage,
    totalPages,
}: UsePaginatedHorizontalWindowingOptions): void {
    const itemsRef = useRef<readonly PaginatedHorizontalWindowItem[]>([])
    const pageWidthRef = useRef(0)
    const frameRef = useRef<number | null>(null)

    useEffect(() => {
        return () => {
            cancelFrame(frameRef)
            restorePaginatedHorizontalWindowItems(itemsRef.current)
            itemsRef.current = []
            pageWidthRef.current = 0
        }
    }, [chapterNode])

    useEffect(() => {
        cancelFrame(frameRef)

        if (!shouldUsePaginatedHorizontalWindowing(totalPages)) {
            restorePaginatedHorizontalWindowItems(itemsRef.current)
            itemsRef.current = []
            pageWidthRef.current = 0
            return
        }

        frameRef.current = window.requestAnimationFrame(() => {
            frameRef.current = null
            const viewport = viewportRef.current
            const container = columnRef.current
            if (!viewport || !container || !chapterNode) return

            const pageWidth = viewport.clientWidth
            if (pageWidth <= 0) return

            const pageWidthChanged = Math.abs(pageWidthRef.current - pageWidth) > PAGE_WIDTH_CHANGE_TOLERANCE_PX
            if (itemsRef.current.length === 0 || pageWidthChanged) {
                restorePaginatedHorizontalWindowItems(itemsRef.current)
                itemsRef.current = collectPaginatedHorizontalWindowItems(container, pageWidth)
                pageWidthRef.current = pageWidth
            }

            const pageWindow = resolvePaginatedHorizontalWindow(displayPage, totalPages)
            applyPaginatedHorizontalWindow(itemsRef.current, pageWindow)
        })

        return () => {
            cancelFrame(frameRef)
        }
    }, [chapterNode, columnRef, displayPage, totalPages, viewportRef])
}
