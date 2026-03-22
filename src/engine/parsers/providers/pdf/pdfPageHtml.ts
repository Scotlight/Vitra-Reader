import { escapeHtml, escapeHtmlAttribute } from '../../../core/contentSanitizer'
import type { PdfPageLink, PdfRenderedPage } from './pdfTypes'

function renderPdfLinkLayer(links: readonly PdfPageLink[]): string {
    return links
        .map((link) => `<a data-pdf-page="${link.targetPage}" href="#pdf-page-${link.targetPage}" aria-label="PDF jump to page ${link.targetPage + 1}" style="position:absolute;left:${link.left}%;top:${link.top}%;width:${link.width}%;height:${link.height}%;display:block;z-index:2;background:transparent;text-decoration:none;"></a>`)
        .join('')
}

function renderHiddenSearchText(searchText: string): string {
    if (!searchText) return ''
    return `<div class="pdf-page-search-text" aria-hidden="true" style="display:none;white-space:pre-wrap;">${escapeHtml(searchText)}</div>`
}

export function renderPdfPageHtml(renderedPage: PdfRenderedPage, pageIndex: number): string {
    const safeUrl = escapeHtmlAttribute(renderedPage.imageUrl)
    const imageTag = `<img src="${safeUrl}" width="${renderedPage.pageWidthPx}" height="${renderedPage.pageHeightPx}" alt="PDF page ${pageIndex + 1}" style="display:block;width:100%;height:auto;"/>`
    const searchTextLayer = renderHiddenSearchText(renderedPage.searchText)
    const linkLayer = renderedPage.links.length > 0 ? renderPdfLinkLayer(renderedPage.links) : ''
    return `<div class="pdf-page-layer" style="position:relative;width:100%;line-height:0;">${imageTag}${searchTextLayer}${linkLayer}</div>`
}
