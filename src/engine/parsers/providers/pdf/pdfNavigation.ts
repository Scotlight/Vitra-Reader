import type { TocItem } from '../../../core/contentProvider'
import type {
    PdfAnnotation,
    PdfDocumentProxy,
    PdfOutlineItem,
    PdfPageProxy,
    PdfPageViewport,
} from '../../../../types/pdfjs'
import type { PdfPageLink } from './pdfTypes'

const FALLBACK_TOC_STEP = 10

export function buildPdfHref(pageIndex: number): string {
    return `page-${pageIndex}`
}

export function buildFallbackPdfToc(pageCount: number): TocItem[] {
    const items: TocItem[] = []
    for (let pageIndex = 0; pageIndex < pageCount; pageIndex += FALLBACK_TOC_STEP) {
        items.push({
            id: `p-${pageIndex}`,
            href: buildPdfHref(pageIndex),
            label: `第 ${pageIndex + 1} 页`,
        })
    }
    return items
}

export async function loadPdfOutline(doc: PdfDocumentProxy): Promise<TocItem[]> {
    const outline = await doc.getOutline()
    if (!outline?.length) return []
    return mapPdfOutlineItems(doc, outline, [])
}

async function mapPdfOutlineItems(
    doc: PdfDocumentProxy,
    items: readonly PdfOutlineItem[],
    path: readonly number[],
): Promise<TocItem[]> {
    const mapped: TocItem[] = []
    for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
        const entry = await mapPdfOutlineItem(doc, items[itemIndex], [...path, itemIndex])
        if (entry) mapped.push(entry)
    }
    return mapped
}

async function mapPdfOutlineItem(
    doc: PdfDocumentProxy,
    item: PdfOutlineItem,
    path: readonly number[],
): Promise<TocItem | null> {
    const fallbackPageIndex = path[path.length - 1] ?? 0
    const targetPage = await resolvePdfDestPageIndex(doc, item.dest, fallbackPageIndex)
    const children = item.items?.length ? await mapPdfOutlineItems(doc, item.items, path) : undefined
    if (targetPage === null && !children?.length) return null

    return {
        id: `outline-${path.join('-')}`,
        href: buildPdfHref(targetPage ?? fallbackPageIndex),
        label: item.title?.trim() || `第 ${fallbackPageIndex + 1} 节`,
        subitems: children?.length ? children : undefined,
    }
}

export async function extractPdfPageLinks(
    doc: PdfDocumentProxy,
    page: PdfPageProxy,
    viewport: PdfPageViewport,
    pageIndex: number,
): Promise<readonly PdfPageLink[]> {
    try {
        const annotations = await page.getAnnotations({ intent: 'display' })
        if (!Array.isArray(annotations) || annotations.length === 0) return []

        const links: PdfPageLink[] = []
        for (const annotation of annotations) {
            const link = await buildPdfPageLink(annotation, doc, viewport, pageIndex)
            if (link) links.push(link)
        }
        return links
    } catch (error) {
        console.warn(`[PdfProvider] Failed to extract annotations for page ${pageIndex + 1}:`, error)
        return []
    }
}

async function buildPdfPageLink(
    annotation: PdfAnnotation,
    doc: PdfDocumentProxy,
    viewport: PdfPageViewport,
    currentPageIndex: number,
): Promise<PdfPageLink | null> {
    if (annotation?.subtype !== 'Link') return null
    if (!Array.isArray(annotation?.rect) || annotation.rect.length < 4) return null

    const targetPage = await resolvePdfDestPageIndex(doc, annotation.dest, currentPageIndex)
    if (targetPage === null) return null

    const rect = normalizePdfRect(annotation.rect, viewport)
    if (!rect) return null
    return { targetPage, ...rect }
}

async function resolvePdfDestPageIndex(
    doc: PdfDocumentProxy,
    dest: unknown,
    currentPageIndex: number,
): Promise<number | null> {
    if (!dest) return null

    if (typeof dest === 'string') {
        const explicit = await doc.getDestination(dest)
        if (!Array.isArray(explicit) || explicit.length === 0) return null
        return resolvePdfDestPageIndex(doc, explicit, currentPageIndex)
    }

    if (!Array.isArray(dest) || dest.length === 0) return null
    const head = dest[0]
    if (typeof head === 'number' && Number.isFinite(head)) {
        return Math.max(0, Math.floor(head))
    }
    if (head && typeof head === 'object' && typeof (head as { num?: unknown }).num === 'number') {
        const index = await doc.getPageIndex(head as object)
        return Number.isFinite(index) ? Math.max(0, index) : null
    }
    if (head === null) {
        return Math.max(0, currentPageIndex)
    }
    return null
}

function normalizePdfRect(
    rect: unknown,
    viewport: PdfPageViewport,
): { left: number; top: number; width: number; height: number } | null {
    if (!Array.isArray(rect) || rect.length < 4) return null
    if (viewport.width <= 0 || viewport.height <= 0) return null

    const rectNumbers = rect.map(Number)
    if (rectNumbers.some((value) => !Number.isFinite(value))) return null

    const viewportRect = typeof viewport.convertToViewportRectangle === 'function'
        ? viewport.convertToViewportRectangle(rectNumbers)
        : rectNumbers
    const [x1, y1, x2, y2] = viewportRect
    const leftPx = Math.min(x1, x2)
    const rightPx = Math.max(x1, x2)
    const topPx = Math.min(y1, y2)
    const bottomPx = Math.max(y1, y2)
    const widthPx = rightPx - leftPx
    const heightPx = bottomPx - topPx
    if (widthPx <= 0 || heightPx <= 0) return null

    return {
        left: clampPercent((leftPx / viewport.width) * 100),
        top: clampPercent((topPx / viewport.height) * 100),
        width: clampPercent((widthPx / viewport.width) * 100),
        height: clampPercent((heightPx / viewport.height) * 100),
    }
}

function clampPercent(value: number): number {
    return Math.max(0, Math.min(100, Number(value.toFixed(4))))
}
