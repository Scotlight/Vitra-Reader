import { clampPaginatedPage } from './paginatedPageLayoutMath'

const DEFAULT_OVERSCAN_PAGES = 1
export const DEFAULT_MIN_WINDOWED_PAGE_COUNT = 6
const WINDOWED_ELEMENT_SELECTOR = [
    'p',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'li',
    'blockquote',
    'pre',
    'table',
    'figure',
    'img',
    'svg',
    'video',
    'canvas',
].join(',')

export interface PaginatedHorizontalWindow {
    startPage: number
    endPage: number
}

export interface PaginatedHorizontalWindowItem {
    element: HTMLElement
    startPage: number
    endPage: number
    originalVisibility: string
    originalPointerEvents: string
}

export interface PaginatedHorizontalWindowStats {
    total: number
    visible: number
    hidden: number
}

export function shouldUsePaginatedHorizontalWindowing(
    totalPages: number,
    minPageCount = DEFAULT_MIN_WINDOWED_PAGE_COUNT,
): boolean {
    return Math.floor(totalPages) >= Math.max(1, Math.floor(minPageCount))
}

export function resolvePaginatedHorizontalWindow(
    currentPage: number,
    totalPages: number,
    overscanPages = DEFAULT_OVERSCAN_PAGES,
): PaginatedHorizontalWindow {
    const safeTotal = Math.max(1, Math.floor(totalPages))
    const safeOverscan = Math.max(0, Math.floor(overscanPages))
    const centerPage = clampPaginatedPage(currentPage, safeTotal)

    return {
        startPage: clampPaginatedPage(centerPage - safeOverscan, safeTotal),
        endPage: clampPaginatedPage(centerPage + safeOverscan, safeTotal),
    }
}

function resolveElementPageSpan(
    elementRect: DOMRect,
    containerRect: DOMRect,
    pageWidth: number,
): PaginatedHorizontalWindow | null {
    if (pageWidth <= 0 || elementRect.width <= 1 || elementRect.height <= 1) return null

    const left = Math.max(0, elementRect.left - containerRect.left)
    const right = Math.max(left, elementRect.right - containerRect.left)
    const startPage = Math.floor(left / pageWidth)
    const endPage = Math.floor(Math.max(left, right - 1) / pageWidth)

    return { startPage, endPage }
}

export function collectPaginatedHorizontalWindowItems(
    container: HTMLElement,
    pageWidth: number,
    selector = WINDOWED_ELEMENT_SELECTOR,
): PaginatedHorizontalWindowItem[] {
    const containerRect = container.getBoundingClientRect()
    const elements = Array.from(container.querySelectorAll(selector))
        .filter((node): node is HTMLElement => node instanceof HTMLElement)

    return elements.flatMap((element) => {
        const span = resolveElementPageSpan(element.getBoundingClientRect(), containerRect, pageWidth)
        if (!span) return []
        return [{
            element,
            startPage: span.startPage,
            endPage: span.endPage,
            originalVisibility: element.style.visibility,
            originalPointerEvents: element.style.pointerEvents,
        }]
    })
}

function isItemInsideWindow(
    item: Pick<PaginatedHorizontalWindowItem, 'startPage' | 'endPage'>,
    pageWindow: PaginatedHorizontalWindow,
): boolean {
    return item.endPage >= pageWindow.startPage && item.startPage <= pageWindow.endPage
}

function setWindowedElementVisibility(item: PaginatedHorizontalWindowItem, visible: boolean): void {
    if (visible) {
        item.element.style.visibility = item.originalVisibility
        item.element.style.pointerEvents = item.originalPointerEvents
        item.element.removeAttribute('data-vitra-horizontal-window')
        return
    }

    item.element.style.visibility = 'hidden'
    item.element.style.pointerEvents = 'none'
    item.element.setAttribute('data-vitra-horizontal-window', 'hidden')
}

export function applyPaginatedHorizontalWindow(
    items: readonly PaginatedHorizontalWindowItem[],
    pageWindow: PaginatedHorizontalWindow,
): PaginatedHorizontalWindowStats {
    let visible = 0
    let hidden = 0

    for (const item of items) {
        const inside = isItemInsideWindow(item, pageWindow)
        setWindowedElementVisibility(item, inside)
        if (inside) visible += 1
        else hidden += 1
    }

    return { total: items.length, visible, hidden }
}

export function restorePaginatedHorizontalWindowItems(
    items: readonly PaginatedHorizontalWindowItem[],
): void {
    for (const item of items) {
        setWindowedElementVisibility(item, true)
    }
}
