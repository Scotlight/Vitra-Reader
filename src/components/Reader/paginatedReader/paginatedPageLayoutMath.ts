const PAGE_COUNT_EPSILON = 0.001

export function resolvePaginatedPageCount(scrollWidth: number, pageWidth: number): number {
    if (pageWidth <= 0) return 1
    const rawPages = Math.max(0, scrollWidth) / pageWidth
    return Math.max(1, Math.ceil(rawPages - PAGE_COUNT_EPSILON))
}

export function clampPaginatedPage(page: number, totalPages: number): number {
    const lastPage = Math.max(0, Math.floor(totalPages) - 1)
    return Math.max(0, Math.min(Math.floor(page), lastPage))
}

export function resolvePaginatedPageFromOffset(
    offsetX: number,
    pageWidth: number,
    totalPages: number,
): number {
    if (pageWidth <= 0) return 0
    return clampPaginatedPage(Math.floor(offsetX / pageWidth), totalPages)
}

export function formatPaginatedTranslateX(page: number, pageWidth: number): string {
    const offset = Math.max(0, Math.floor(page)) * Math.max(0, pageWidth)
    return `translateX(${-offset}px)`
}
