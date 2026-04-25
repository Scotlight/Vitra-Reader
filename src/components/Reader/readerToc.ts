import type { SpineItemInfo, TocItem } from '@/engine/core/contentProvider'

export function buildFallbackTocFromSpine(spineItems: readonly SpineItemInfo[]): TocItem[] {
    return spineItems.map((item, index) => ({
        id: item.id || `spine-${index}`,
        href: item.href,
        label: labelFromSpineHref(item.href, index),
    }))
}

export function normalizeTocHref(href?: string): string {
    const raw = (href || '').split('#')[0].split('?')[0].trim()
    if (!raw) return ''
    return raw
        .replace(/\\/g, '/')
        .replace(/^\.\//, '')
        .replace(/\/{2,}/g, '/')
        .replace(/\/+$/, '')
        .toLowerCase()
}

export function isTocHrefActive(itemHref: string, currentHref?: string): boolean {
    const normalizedItemHref = normalizeTocHref(itemHref)
    const normalizedCurrentHref = normalizeTocHref(currentHref)
    if (!normalizedItemHref || !normalizedCurrentHref) return false
    if (normalizedCurrentHref === normalizedItemHref) return true
    return getHrefTail(normalizedItemHref) === getHrefTail(normalizedCurrentHref)
}

export function findCurrentChapterLabel(items: readonly TocItem[], currentHref?: string): string {
    for (const item of items) {
        if (isTocHrefActive(item.href, currentHref)) return item.label
        if (!item.subitems?.length) continue
        const nested = findCurrentChapterLabel(item.subitems, currentHref)
        if (nested) return nested
    }
    return ''
}

function labelFromSpineHref(href: string, index: number): string {
    const fallback = `Chapter ${index + 1}`
    if (!href) return fallback
    const [pathPart] = href.split('#', 2)
    const fileName = pathPart.split('/').pop() || ''
    const decoded = decodeSafe(fileName)
    const withoutExt = decoded.replace(/\.[^.]+$/, '')
    const cleaned = withoutExt.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
    return cleaned || fallback
}

function decodeSafe(value: string): string {
    try {
        return decodeURIComponent(value)
    } catch {
        return value
    }
}

function getHrefTail(normalizedHref: string): string {
    const lastSlash = normalizedHref.lastIndexOf('/')
    return lastSlash >= 0 ? normalizedHref.slice(lastSlash + 1) : normalizedHref
}
