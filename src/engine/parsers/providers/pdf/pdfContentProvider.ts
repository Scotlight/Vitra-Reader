import type { SearchResult, SpineItemInfo, TocItem, ContentProvider } from '../../../core/contentProvider'
import type { PdfDocumentProxy } from '../../../../types/pdfjs'
import { buildFallbackPdfToc, buildPdfHref, loadPdfOutline } from './pdfNavigation'
import { renderPdfPageHtml } from './pdfPageHtml'
import { extractPdfPageSearchText, renderPdfPage } from './pdfPageRenderer'
import { openPdfDocument, openPdfDocumentWithFallback, promoteLegacyRuntime, shouldFallbackToLegacy } from './pdfRuntime'

const SEARCH_CONTEXT_CHARS = 20
const ADJACENT_PAGE_DELTA = 1

type IdleScheduler = (callback: () => void) => number

export class PdfContentProvider implements ContentProvider {
    private doc: PdfDocumentProxy | null = null
    private readonly sourceBytes: Uint8Array
    private pageCount = 0
    private outline: TocItem[] = []
    private pageHtmlCache = new Map<number, string>()
    private pageImageUrlCache = new Map<number, string>()
    private activeImageUrls = new Set<string>()

    constructor(data: ArrayBuffer) {
        this.sourceBytes = new Uint8Array(data)
    }

    async init(): Promise<void> {
        await this.openDocument()
    }

    destroy(): void {
        this.clearRenderedPageCache()
        this.doc?.destroy()
        this.doc = null
    }

    getToc(): TocItem[] {
        return this.outline.length > 0 ? this.outline : buildFallbackPdfToc(this.pageCount)
    }

    getSpineItems(): SpineItemInfo[] {
        return Array.from({ length: this.pageCount }, (_, pageIndex) => ({
            index: pageIndex,
            href: buildPdfHref(pageIndex),
            id: buildPdfHref(pageIndex),
            linear: true,
        }))
    }

    isAssetUrlAvailable(url: string): boolean {
        return !url.startsWith('blob:') || this.activeImageUrls.has(url)
    }

    getSpineIndexByHref(href: string): number {
        const match = href.match(/page-(\d+)/)
        return match ? parseInt(match[1], 10) : -1
    }

    async extractChapterHtml(pageIndex: number): Promise<string> {
        const cached = this.pageHtmlCache.get(pageIndex)
        if (cached) return cached

        const doc = this.ensureDocument()
        const renderedPage = await this.renderPageWithFallback(doc, pageIndex)
        const html = renderPdfPageHtml(renderedPage, pageIndex)
        this.storeRenderedPage(pageIndex, renderedPage.imageUrl, html)
        this.prerenderAdjacent(pageIndex)
        return html
    }

    async extractChapterStyles(): Promise<string[]> {
        return []
    }

    unloadChapter(pageIndex: number): void {
        this.releasePageCacheEntry(pageIndex)
    }

    async search(keyword: string): Promise<SearchResult[]> {
        const normalized = keyword.trim()
        if (!normalized) return []

        try {
            return await this.searchInCurrentDoc(normalized)
        } catch (error) {
            if (!shouldFallbackToLegacy(error)) throw error
            await this.reopenLegacyDocument('search parser error', error)
            return this.searchInCurrentDoc(normalized)
        }
    }

    private async openDocument(): Promise<void> {
        this.doc = await openPdfDocumentWithFallback(this.sourceBytes)
        this.pageCount = this.doc.numPages
        this.outline = await loadPdfOutline(this.doc)
    }

    private ensureDocument(): PdfDocumentProxy {
        if (!this.doc) throw new Error('[PdfProvider] document is not initialized')
        return this.doc
    }

    private async renderPageWithFallback(doc: PdfDocumentProxy, pageIndex: number) {
        try {
            return await renderPdfPage(doc, pageIndex)
        } catch (error) {
            if (!shouldFallbackToLegacy(error)) throw error
            await this.reopenLegacyDocument('page render parser error', error)
            return renderPdfPage(this.ensureDocument(), pageIndex)
        }
    }

    private async reopenLegacyDocument(reason: string, error: unknown): Promise<void> {
        promoteLegacyRuntime(reason, error)
        this.clearRenderedPageCache()
        this.doc?.destroy()
        this.doc = await openPdfDocument(this.sourceBytes, true)
        this.pageCount = this.doc.numPages
        this.outline = await loadPdfOutline(this.doc)
    }

    private storeRenderedPage(pageIndex: number, imageUrl: string, html: string): void {
        this.releasePageCacheEntry(pageIndex)
        this.pageImageUrlCache.set(pageIndex, imageUrl)
        this.activeImageUrls.add(imageUrl)
        this.pageHtmlCache.set(pageIndex, html)
    }

    private releasePageCacheEntry(pageIndex: number): void {
        const imageUrl = this.pageImageUrlCache.get(pageIndex)
        if (imageUrl) {
            this.activeImageUrls.delete(imageUrl)
            URL.revokeObjectURL(imageUrl)
            this.pageImageUrlCache.delete(pageIndex)
        }
        this.pageHtmlCache.delete(pageIndex)
    }

    private clearRenderedPageCache(): void {
        Array.from(this.pageImageUrlCache.keys()).forEach((pageIndex) => {
            this.releasePageCacheEntry(pageIndex)
        })
    }

    private prerenderAdjacent(pageIndex: number): void {
        const doc = this.doc
        if (!doc) return

        const candidatePages = [pageIndex + ADJACENT_PAGE_DELTA, pageIndex - ADJACENT_PAGE_DELTA]
            .filter((candidate) => candidate >= 0 && candidate < this.pageCount)
            .filter((candidate) => !this.pageHtmlCache.has(candidate))
        if (candidatePages.length === 0) return

        const scheduleIdle = this.getIdleScheduler()
        scheduleIdle(() => {
            candidatePages.forEach((candidatePage) => {
                if (this.pageHtmlCache.has(candidatePage)) return
                renderPdfPage(doc, candidatePage)
                    .then((renderedPage) => {
                        if (this.pageHtmlCache.has(candidatePage)) {
                            URL.revokeObjectURL(renderedPage.imageUrl)
                            return
                        }
                        const html = renderPdfPageHtml(renderedPage, candidatePage)
                        this.storeRenderedPage(candidatePage, renderedPage.imageUrl, html)
                    })
                    .catch((error) => {
                        console.warn(`[PdfProvider] Failed to prerender page ${candidatePage + 1}:`, error)
                    })
            })
        })
    }

    private getIdleScheduler(): IdleScheduler {
        if (typeof requestIdleCallback === 'function') {
            return (callback) => requestIdleCallback(callback)
        }
        return (callback) => window.setTimeout(callback, 0)
    }

    private async searchInCurrentDoc(keyword: string): Promise<SearchResult[]> {
        const doc = this.ensureDocument()
        const results: SearchResult[] = []
        const normalizedKeyword = keyword.toLowerCase()

        for (let pageNumber = 1; pageNumber <= this.pageCount; pageNumber += 1) {
            const page = await doc.getPage(pageNumber)
            const text = await extractPdfPageSearchText(page, pageNumber - 1)
            if (!text) continue
            const lowerText = text.toLowerCase()
            let position = lowerText.indexOf(normalizedKeyword)
            while (position !== -1) {
                results.push({
                    cfi: `vitra:${pageNumber - 1}:0`,
                    excerpt: buildSearchExcerpt(text, position, keyword.length),
                })
                position = lowerText.indexOf(normalizedKeyword, position + normalizedKeyword.length)
            }
        }
        return results
    }
}

function buildSearchExcerpt(text: string, start: number, keywordLength: number): string {
    const excerptStart = Math.max(0, start - SEARCH_CONTEXT_CHARS)
    const excerptEnd = Math.min(text.length, start + keywordLength + SEARCH_CONTEXT_CHARS)
    return text.slice(excerptStart, excerptEnd)
}
