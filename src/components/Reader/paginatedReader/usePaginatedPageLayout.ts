import { useEffect, useCallback, type MutableRefObject, type RefObject } from 'react'
import { releaseMediaResources } from '@/utils/mediaResourceCleanup'
import { findTextInDOM } from '@/utils/textFinder'
import type { PageBoundary } from '@/engine'

interface UsePaginatedPageLayoutOptions {
    viewportRef: RefObject<HTMLDivElement | null>
    columnRef: RefObject<HTMLDivElement | null>
    chapterNode: HTMLElement | null
    pageBoundariesRef: MutableRefObject<readonly PageBoundary[]>
    pendingLastPageRef: MutableRefObject<boolean>
    pendingSearchTextRef: MutableRefObject<string | null>
    currentPageRef: MutableRefObject<number>
    totalPagesRef: MutableRefObject<number>
    isInitialLoadRef: MutableRefObject<boolean>
    currentSpineIndexRef: MutableRefObject<number>
    abortPaginationMeasure: () => void
    measureBoundariesInShadow: (node: HTMLElement, height: number) => Promise<readonly PageBoundary[]>
    scheduleHighlightInjection: (node: HTMLElement, spineIndex: number) => void
    setCurrentPage: (page: number) => void
    setTotalPages: (pages: number) => void
    setDisplayPage: (page: number) => void
    setChapterFading: (v: boolean) => void
    isPageLikelyBlank: (page: number) => boolean
}

export function usePaginatedPageLayout({
    viewportRef,
    columnRef,
    chapterNode,
    pageBoundariesRef,
    pendingLastPageRef,
    pendingSearchTextRef,
    currentPageRef,
    totalPagesRef,
    isInitialLoadRef,
    currentSpineIndexRef,
    abortPaginationMeasure,
    measureBoundariesInShadow,
    scheduleHighlightInjection,
    setCurrentPage,
    setTotalPages,
    setDisplayPage,
    setChapterFading,
    isPageLikelyBlank,
}: UsePaginatedPageLayoutOptions) {
    // Mount chapter node + calculate pagination
    useEffect(() => {
        const container = columnRef.current
        const viewport = viewportRef.current
        if (!container || !viewport || !chapterNode) return

        const h = viewport.clientHeight
        const w = viewport.clientWidth
        container.style.height = `${h}px`
        container.style.transition = 'none'
        container.style.transform = 'translateX(0)'

        releaseMediaResources(container)
        container.appendChild(chapterNode)

        requestAnimationFrame(() => {
            if (w <= 0) return
            const boundaries = pageBoundariesRef.current ?? []
            const rawPages = container.scrollWidth / w
            const pages = Math.max(1, Math.ceil(rawPages - 0.001))
            const logicalPages = Math.max(1, boundaries.length || pages)
            if (Math.abs(logicalPages - pages) >= 3) {
                console.warn(
                    `[PaginatedReader] Visual pages (${pages}) diverge from logical map (${logicalPages})`,
                )
            }
            setTotalPages(pages)
            totalPagesRef.current = pages

            let targetPage = 0
            let shouldJumpToLastPage = false
            if (pendingLastPageRef.current) {
                targetPage = pages - 1
                shouldJumpToLastPage = true
                pendingLastPageRef.current = false
            }

            const searchText = pendingSearchTextRef.current
            if (searchText && container) {
                pendingSearchTextRef.current = null
                const range = findTextInDOM(container, searchText)
                if (range) {
                    const rect = range.getBoundingClientRect()
                    const containerRect = container.getBoundingClientRect()
                    targetPage = Math.floor((rect.left - containerRect.left + container.scrollLeft) / w)
                    targetPage = Math.max(0, Math.min(targetPage, pages - 1))
                }
            }

            if (shouldJumpToLastPage) {
                while (targetPage > 0 && isPageLikelyBlank(targetPage)) {
                    targetPage -= 1
                }
            }

            setCurrentPage(targetPage)
            currentPageRef.current = targetPage
            setDisplayPage(targetPage)
            container.style.transform = `translateX(${-targetPage * w}px)`

            requestAnimationFrame(() => {
                container.style.transition = ''
                setChapterFading(false)
                isInitialLoadRef.current = false
            })

            scheduleHighlightInjection(chapterNode, currentSpineIndexRef.current)
        })
    }, [chapterNode, scheduleHighlightInjection]) // eslint-disable-line react-hooks/exhaustive-deps

    // Recalculate on resize
    useEffect(() => {
        const viewport = viewportRef.current
        const container = columnRef.current
        if (!viewport || !container || !chapterNode) return

        let resizeTimer: number | null = null
        let disposed = false

        const recalc = () => {
            const oldWidth = Math.max(1, viewport.clientWidth)
            const fallbackAnchorX = currentPageRef.current * oldWidth + oldWidth * 0.35

            const viewportRect = viewport.getBoundingClientRect()
            const probeX = viewportRect.left + viewportRect.width * 0.5
            const probeY = viewportRect.top + Math.min(viewportRect.height * 0.32, 220)
            const probeElement = document.elementFromPoint(probeX, probeY) as HTMLElement | null
            const containerRect = container.getBoundingClientRect()

            let anchorX = fallbackAnchorX
            if (probeElement && container.contains(probeElement)) {
                const probeRect = probeElement.getBoundingClientRect()
                const probeOffsetX = probeRect.left - containerRect.left + container.scrollLeft
                if (Number.isFinite(probeOffsetX) && probeOffsetX >= 0) {
                    anchorX = probeOffsetX
                }
            }

            if (resizeTimer) window.clearTimeout(resizeTimer)
            resizeTimer = window.setTimeout(() => {
                const w = viewport.clientWidth
                const h = viewport.clientHeight
                if (disposed || w <= 0 || h <= 0) return

                container.style.height = `${h}px`
                const pages = Math.max(1, Math.ceil(container.scrollWidth / w))
                const anchorBasedPage = Math.floor(anchorX / w)
                const nextPage = Math.max(0, Math.min(anchorBasedPage, pages - 1))

                setTotalPages(pages)
                totalPagesRef.current = pages
                setCurrentPage(nextPage)
                currentPageRef.current = nextPage
                setDisplayPage(nextPage)

                container.style.transition = 'none'
                container.style.transform = `translateX(${-nextPage * w}px)`
                requestAnimationFrame(() => { container.style.transition = '' })

                void measureBoundariesInShadow(chapterNode, h).catch((error) => {
                    if (disposed) return
                    console.warn('[PaginatedReader] Resize pagination measure failed:', error)
                })
            }, 100)
        }

        const ro = new ResizeObserver(recalc)
        ro.observe(viewport)
        return () => {
            disposed = true
            ro.disconnect()
            if (resizeTimer) window.clearTimeout(resizeTimer)
            abortPaginationMeasure()
        }
    }, [chapterNode, abortPaginationMeasure, measureBoundariesInShadow]) // eslint-disable-line react-hooks/exhaustive-deps

    const getColumnWidth = useCallback(() => {
        return viewportRef.current?.clientWidth ?? 600
    }, [viewportRef])

    return { getColumnWidth }
}
