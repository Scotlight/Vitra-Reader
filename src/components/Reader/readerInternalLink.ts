import type { ContentProvider } from '@/engine/core/contentProvider'

function parsePdfPageTarget(anchor: HTMLAnchorElement): number | null {
    const rawPage = anchor.getAttribute('data-pdf-page')
    if (!rawPage) return null
    const targetSpine = Number.parseInt(rawPage, 10)
    return Number.isFinite(targetSpine) ? targetSpine : null
}

function parseHrefTarget(
    anchor: HTMLAnchorElement,
    provider: ContentProvider,
): number | null {
    const href = anchor.getAttribute('href')?.trim()
    if (!href || href === '#') return null
    const targetSpine = provider.getSpineIndexByHref(href)
    return targetSpine >= 0 ? targetSpine : null
}

export function resolveReaderInternalLinkTarget(
    anchor: HTMLAnchorElement,
    provider: ContentProvider,
): number | null {
    const pdfTarget = parsePdfPageTarget(anchor)
    if (pdfTarget !== null) return pdfTarget
    return parseHrefTarget(anchor, provider)
}
