import type { SearchResult, SpineItemInfo, TocItem, ContentProvider } from '@/engine/core/contentProvider'
import type { PdfDocumentProxy } from '@/types/pdfjs'
import type { PdfRenderedPage, PdfRuntimeKind } from './pdfTypes'
import { buildFallbackPdfToc, buildPdfHref, loadPdfOutline } from './pdfNavigation'
import { renderPdfPageHtml } from './pdfPageHtml'
import { extractPdfPageSearchText, renderPdfPage } from './pdfPageRenderer'
import { openPdfDocument, openPdfDocumentWithFallback, promoteLegacyRuntime, shouldFallbackToLegacy } from './pdfRuntime'

const SEARCH_CONTEXT_CHARS = 20
const ADJACENT_PAGE_DELTA = 1
const PRERENDER_IDLE_DELAY_MS = 900
const FAST_FOREGROUND_RENDER_THRESHOLD_MS = 120

export class PdfContentProvider implements ContentProvider {
    private doc: PdfDocumentProxy | null = null
    private readonly sourceBytes: Uint8Array
    private runtimeKind: PdfRuntimeKind = 'modern'
    private pageCount = 0
    private outline: TocItem[] = []
    private pageSearchTextCache = new Map<number, string>()
    private pageHtmlCache = new Map<number, string>()
    private renderedPageCache = new Map<number, PdfRenderedPage>()
    private activeImageUrls = new Set<string>()
    private pendingPageLoads = new Map<number, Promise<string>>()
    private lastForegroundRenderDurationMs: number | null = null
    private prerenderTimerId: number | null = null
    private prerenderPendingPageIndex: number | null = null
    private firstForegroundPageIndex: number | null = null
    private hasForegroundNavigation = false

    constructor(data: ArrayBuffer) {
        this.sourceBytes = new Uint8Array(data)
    }

    async init(): Promise<void> {
        await this.openDocument()
    }

    destroy(): void {
        this.cancelPendingPrerender()
        this.pendingPageLoads.clear()
        this.pageSearchTextCache.clear()
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
        this.cancelPendingPrerender()

        const cached = this.pageHtmlCache.get(pageIndex)
        if (cached) return cached

        const renderedPage = this.renderedPageCache.get(pageIndex)
        if (renderedPage) {
            const html = this.buildPageHtml(pageIndex, renderedPage)
            this.pageHtmlCache.set(pageIndex, html)
            this.scheduleNextPagePrerender(pageIndex)
            return html
        }

        const html = await this.loadPageHtml(pageIndex, 'foreground')
        this.scheduleNextPagePrerender(pageIndex)
        return html
    }

    async extractChapterStyles(): Promise<string[]> {
        return []
    }

    unloadChapter(pageIndex: number): void {
        this.pageHtmlCache.delete(pageIndex)
    }

    async search(keyword: string): Promise<SearchResult[]> {
        const normalized = keyword.trim()
        if (!normalized) return []

        try {
            return await this.searchInCurrentDoc(normalized)
        } catch (error) {
            if (!shouldFallbackToLegacy(error) || this.runtimeKind === 'legacy') throw error
            await this.reopenLegacyDocument('search parser error', error)
            return this.searchInCurrentDoc(normalized)
        }
    }

    private async openDocument(): Promise<void> {
        const opened = await openPdfDocumentWithFallback(this.sourceBytes)
        this.doc = opened.doc
        this.runtimeKind = opened.kind
        this.pageCount = this.doc.numPages
        this.outline = await loadPdfOutline(this.doc)
    }

    private ensureDocument(): PdfDocumentProxy {
        if (!this.doc) throw new Error('[PdfProvider] document is not initialized')
        return this.doc
    }

    private async renderPageWithFallback(doc: PdfDocumentProxy, pageIndex: number) {
        try {
            return await renderPdfPage(doc, pageIndex, this.lastForegroundRenderDurationMs)
        } catch (error) {
            if (!shouldFallbackToLegacy(error) || this.runtimeKind === 'legacy') throw error
            await this.reopenLegacyDocument('page render parser error', error)
            return renderPdfPage(this.ensureDocument(), pageIndex, this.lastForegroundRenderDurationMs)
        }
    }

    private async reopenLegacyDocument(reason: string, error: unknown): Promise<void> {
        promoteLegacyRuntime(reason, error)
        this.cancelPendingPrerender()
        this.pendingPageLoads.clear()
        this.pageSearchTextCache.clear()
        this.clearRenderedPageCache()
        this.doc?.destroy()
        this.doc = await openPdfDocument(this.sourceBytes, 'legacy')
        this.runtimeKind = 'legacy'
        this.pageCount = this.doc.numPages
        this.outline = await loadPdfOutline(this.doc)
    }

    private async loadPageHtml(pageIndex: number, source: 'foreground' | 'prerender'): Promise<string> {
        const cached = this.pageHtmlCache.get(pageIndex)
        if (cached) return cached

        const renderedPage = this.renderedPageCache.get(pageIndex)
        if (renderedPage) {
            const html = this.buildPageHtml(pageIndex, renderedPage)
            this.pageHtmlCache.set(pageIndex, html)
            return html
        }

        const pending = this.pendingPageLoads.get(pageIndex)
        if (pending) return pending

        const task = this.renderAndStorePage(pageIndex, source)
            .finally(() => {
                this.pendingPageLoads.delete(pageIndex)
            })
        this.pendingPageLoads.set(pageIndex, task)
        return task
    }

    private async renderAndStorePage(pageIndex: number, source: 'foreground' | 'prerender'): Promise<string> {
        const doc = this.ensureDocument()
        const renderStartedAt = performance.now()
        const renderedPage = await this.renderPageWithFallback(doc, pageIndex)
        const renderDurationMs = performance.now() - renderStartedAt
        if (source === 'foreground') {
            this.lastForegroundRenderDurationMs = renderDurationMs
            if (this.firstForegroundPageIndex === null) {
                this.firstForegroundPageIndex = pageIndex
            } else if (pageIndex !== this.firstForegroundPageIndex) {
                this.hasForegroundNavigation = true
            }
        }
        this.storeRenderedPage(pageIndex, renderedPage)
        const html = this.buildPageHtml(pageIndex, renderedPage)
        this.pageHtmlCache.set(pageIndex, html)
        return html
    }

    private buildPageHtml(pageIndex: number, renderedPage: PdfRenderedPage): string {
        return renderPdfPageHtml(renderedPage, pageIndex, this.pageSearchTextCache.get(pageIndex) || '')
    }

    private storeRenderedPage(pageIndex: number, renderedPage: PdfRenderedPage): void {
        const previousRenderedPage = this.renderedPageCache.get(pageIndex)
        if (previousRenderedPage && previousRenderedPage.imageUrl !== renderedPage.imageUrl) {
            this.activeImageUrls.delete(previousRenderedPage.imageUrl)
            URL.revokeObjectURL(previousRenderedPage.imageUrl)
        }
        this.renderedPageCache.set(pageIndex, renderedPage)
        this.activeImageUrls.add(renderedPage.imageUrl)
    }

    private releasePageCacheEntry(pageIndex: number): void {
        const renderedPage = this.renderedPageCache.get(pageIndex)
        if (renderedPage) {
            this.activeImageUrls.delete(renderedPage.imageUrl)
            URL.revokeObjectURL(renderedPage.imageUrl)
            this.renderedPageCache.delete(pageIndex)
        }
        this.pageHtmlCache.delete(pageIndex)
    }

    private clearRenderedPageCache(): void {
        Array.from(this.renderedPageCache.keys()).forEach((pageIndex) => {
            this.releasePageCacheEntry(pageIndex)
        })
    }

    private scheduleNextPagePrerender(pageIndex: number): void {
        if (!this.hasForegroundNavigation) return
        const nextPageIndex = pageIndex + ADJACENT_PAGE_DELTA
        if (nextPageIndex < 0 || nextPageIndex >= this.pageCount) return
        if (this.lastForegroundRenderDurationMs === null || this.lastForegroundRenderDurationMs > FAST_FOREGROUND_RENDER_THRESHOLD_MS) {
            return
        }
        if (this.pageHtmlCache.has(nextPageIndex) || this.pendingPageLoads.has(nextPageIndex)) return

        this.cancelPendingPrerender()
        this.prerenderPendingPageIndex = nextPageIndex
        this.prerenderTimerId = window.setTimeout(() => {
            const candidatePage = this.prerenderPendingPageIndex
            this.prerenderTimerId = null
            this.prerenderPendingPageIndex = null
            if (candidatePage === null) return
            if (this.pendingPageLoads.size > 0) return
            if (this.pageHtmlCache.has(candidatePage) || this.pendingPageLoads.has(candidatePage)) return

            this.loadPageHtml(candidatePage, 'prerender')
                .then(() => undefined)
                .catch((error) => {
                    console.warn(`[PdfProvider] Failed to prerender page ${candidatePage + 1}:`, error)
                })
        }, PRERENDER_IDLE_DELAY_MS)
    }

    private cancelPendingPrerender(): void {
        if (this.prerenderTimerId !== null) {
            window.clearTimeout(this.prerenderTimerId)
            this.prerenderTimerId = null
        }
        this.prerenderPendingPageIndex = null
    }

    private async searchInCurrentDoc(keyword: string): Promise<SearchResult[]> {
        const doc = this.ensureDocument()
        const results: SearchResult[] = []
        const normalizedKeyword = keyword.toLowerCase()

        for (let pageNumber = 1; pageNumber <= this.pageCount; pageNumber += 1) {
            const pageIndex = pageNumber - 1
            let text = this.pageSearchTextCache.get(pageIndex) || ''
            if (!text) {
                const page = await doc.getPage(pageNumber)
                text = await extractPdfPageSearchText(page, pageIndex)
                if (text) {
                    this.pageSearchTextCache.set(pageIndex, text)
                    this.pageHtmlCache.delete(pageIndex)
                }
            }
            if (!text) continue
            const lowerText = text.toLowerCase()
            let position = lowerText.indexOf(normalizedKeyword)
            while (position !== -1) {
                results.push({
                    cfi: `vitra:${pageIndex}:0`,
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
