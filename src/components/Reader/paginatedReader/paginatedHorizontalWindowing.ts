import { clampPaginatedPage } from './paginatedPageLayoutMath'

const DEFAULT_OVERSCAN_PAGES = 1
export const DEFAULT_MIN_WINDOWED_PAGE_COUNT = 6
export const HORIZONTAL_WINDOW_ATTR = 'data-vitra-horizontal-window'
const HORIZONTAL_WINDOW_HIDDEN = 'hidden'
const HORIZONTAL_WINDOW_MODE_ATTR = 'data-vitra-horizontal-window-mode'
const HORIZONTAL_WINDOW_DEHYDRATED = 'dehydrated'
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
    originalMinHeight: string
    originalContainIntrinsicSize: string
    originalContentVisibility: string
    originalSrc: string | null
    originalSrcset: string | null
    originalPoster: string | null
    dehydratedHtml: string | null
    dehydratedHeight: number
    isDehydrated: boolean
}

export interface PaginatedHorizontalWindowStats {
    total: number
    visible: number
    hidden: number
    dehydrated: number
    restored: number
}

export interface ApplyPaginatedHorizontalWindowOptions {
    dehydrateOutsideWindow?: boolean
    onRestored?: () => void
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
        .filter((element) => !element.parentElement?.closest(selector))

    return elements.flatMap((element) => {
        const span = resolveElementPageSpan(element.getBoundingClientRect(), containerRect, pageWidth)
        if (!span) return []
        return [{
            element,
            startPage: span.startPage,
            endPage: span.endPage,
            originalVisibility: element.style.visibility,
            originalPointerEvents: element.style.pointerEvents,
            originalMinHeight: element.style.minHeight,
            originalContainIntrinsicSize: element.style.containIntrinsicSize,
            originalContentVisibility: element.style.contentVisibility,
            originalSrc: element.getAttribute('src'),
            originalSrcset: element.getAttribute('srcset'),
            originalPoster: element.getAttribute('poster'),
            dehydratedHtml: null,
            dehydratedHeight: 0,
            isDehydrated: false,
        }]
    })
}

function isItemInsideWindow(
    item: Pick<PaginatedHorizontalWindowItem, 'startPage' | 'endPage'>,
    pageWindow: PaginatedHorizontalWindow,
): boolean {
    return item.endPage >= pageWindow.startPage && item.startPage <= pageWindow.endPage
}

function restoreNullableAttr(element: HTMLElement, name: string, value: string | null): void {
    if (value === null) {
        element.removeAttribute(name)
        return
    }
    element.setAttribute(name, value)
}

function clearElementMediaSources(element: HTMLElement): void {
    element.removeAttribute('src')
    element.removeAttribute('srcset')
    element.removeAttribute('poster')
    element.querySelectorAll('img,source,video,audio').forEach((node) => {
        node.removeAttribute('src')
        node.removeAttribute('srcset')
        node.removeAttribute('poster')
        if (node instanceof HTMLMediaElement) {
            try {
                node.pause()
                node.load()
            } catch {
                // jsdom 与部分浏览器状态下 load/pause 可能不可用；属性已清理即可。
            }
        }
    })
}

function dehydrateWindowedElement(item: PaginatedHorizontalWindowItem): boolean {
    if (item.isDehydrated) return false
    const rect = item.element.getBoundingClientRect()
    item.dehydratedHtml = item.element.innerHTML
    item.dehydratedHeight = Math.max(1, rect.height)
    item.element.style.minHeight = `${item.dehydratedHeight}px`
    item.element.style.containIntrinsicSize = `${item.dehydratedHeight}px`
    item.element.style.contentVisibility = 'hidden'
    clearElementMediaSources(item.element)
    item.element.replaceChildren()
    item.element.setAttribute(HORIZONTAL_WINDOW_MODE_ATTR, HORIZONTAL_WINDOW_DEHYDRATED)
    item.isDehydrated = true
    return true
}

function restoreWindowedElement(item: PaginatedHorizontalWindowItem): boolean {
    if (!item.isDehydrated) return false
    item.element.innerHTML = item.dehydratedHtml ?? ''
    restoreNullableAttr(item.element, 'src', item.originalSrc)
    restoreNullableAttr(item.element, 'srcset', item.originalSrcset)
    restoreNullableAttr(item.element, 'poster', item.originalPoster)
    item.element.style.minHeight = item.originalMinHeight
    item.element.style.containIntrinsicSize = item.originalContainIntrinsicSize
    item.element.style.contentVisibility = item.originalContentVisibility
    item.element.removeAttribute(HORIZONTAL_WINDOW_MODE_ATTR)
    item.dehydratedHtml = null
    item.dehydratedHeight = 0
    item.isDehydrated = false
    return true
}

function setWindowedElementVisibility(
    item: PaginatedHorizontalWindowItem,
    visible: boolean,
    dehydrateOutsideWindow: boolean,
): { dehydrated: boolean; restored: boolean } {
    let restored = false
    let dehydrated = false

    if (visible) {
        restored = restoreWindowedElement(item)
        item.element.style.visibility = item.originalVisibility
        item.element.style.pointerEvents = item.originalPointerEvents
        item.element.removeAttribute(HORIZONTAL_WINDOW_ATTR)
        return { dehydrated, restored }
    }

    if (dehydrateOutsideWindow) {
        dehydrated = dehydrateWindowedElement(item)
    }
    item.element.style.visibility = 'hidden'
    item.element.style.pointerEvents = 'none'
    item.element.setAttribute(HORIZONTAL_WINDOW_ATTR, HORIZONTAL_WINDOW_HIDDEN)
    return { dehydrated, restored }
}

export function isPaginatedHorizontalWindowHiddenElement(element: HTMLElement): boolean {
    return element.getAttribute(HORIZONTAL_WINDOW_ATTR) === HORIZONTAL_WINDOW_HIDDEN
}

export function applyPaginatedHorizontalWindow(
    items: readonly PaginatedHorizontalWindowItem[],
    pageWindow: PaginatedHorizontalWindow,
    options: ApplyPaginatedHorizontalWindowOptions = {},
): PaginatedHorizontalWindowStats {
    let visible = 0
    let hidden = 0
    let dehydrated = 0
    let restored = 0
    const dehydrateOutsideWindow = options.dehydrateOutsideWindow ?? true

    for (const item of items) {
        const inside = isItemInsideWindow(item, pageWindow)
        const result = setWindowedElementVisibility(item, inside, dehydrateOutsideWindow)
        if (inside) visible += 1
        else hidden += 1
        if (result.dehydrated) dehydrated += 1
        if (result.restored) restored += 1
    }

    if (restored > 0) options.onRestored?.()
    return { total: items.length, visible, hidden, dehydrated, restored }
}

export function restorePaginatedHorizontalWindowItems(
    items: readonly PaginatedHorizontalWindowItem[],
): void {
    for (const item of items) {
        setWindowedElementVisibility(item, true, false)
    }
}
