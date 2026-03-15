import type { ContentProvider, TocItem, SpineItemInfo, SearchResult } from '../../core/contentProvider'
import { escapeHtmlAttribute as escapeAttr } from '../../core/contentSanitizer'
import type { PdfDocumentProxy, PdfPageProxy, PdfPageViewport, PdfOutlineItem, PdfAnnotation } from '../../../types/pdfjs'

type PdfJsRuntime = {
    GlobalWorkerOptions: { workerSrc: string }
    getDocument: (src: unknown) => { promise: Promise<PdfDocumentProxy> }
}

interface PdfPageLink {
    targetPage: number
    left: number
    top: number
    width: number
    height: number
}

interface RenderedPdfPage {
    imageUrl: string
    links: readonly PdfPageLink[]
    pageWidthPx: number
    pageHeightPx: number
    textLayerHtml?: string
}

/** 根据设备 DPR 计算合适的 PDF 渲染缩放比例 */
function getPdfRenderScale(): number {
    const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1
    // 上限 1.6：平衡清晰度与性能，避免高 DPR 设备内存爆炸
    return Math.min(1.6, Math.max(1.3, dpr * 1.2))
}

let cachedPdfRuntime: PdfJsRuntime | null = null
let cachedRuntimeKind: 'modern' | 'legacy' | null = null
let forceLegacyRuntime = false

async function getPdfRuntime(forceLegacy = false): Promise<PdfJsRuntime> {
    const useLegacy = forceLegacy || forceLegacyRuntime
    if (cachedPdfRuntime && cachedRuntimeKind && (!useLegacy || cachedRuntimeKind === 'legacy')) {
        return cachedPdfRuntime
    }

    if (!useLegacy) {
        try {
            const modern = await import('pdfjs-dist') as unknown as PdfJsRuntime
            modern.GlobalWorkerOptions.workerSrc = new URL(
                'pdfjs-dist/build/pdf.worker.min.mjs',
                import.meta.url
            ).toString()
            cachedPdfRuntime = modern
            cachedRuntimeKind = 'modern'
            return modern
        } catch (error) {
            console.warn('[PdfProvider] modern runtime load failed, fallback to legacy:', error)
        }
    }

    const legacy = await import('pdfjs-dist/legacy/build/pdf.mjs') as unknown as PdfJsRuntime
    legacy.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/legacy/build/pdf.worker.mjs',
        import.meta.url
    ).toString()
    cachedPdfRuntime = legacy
    cachedRuntimeKind = 'legacy'
    return legacy
}

function shouldFallbackToLegacy(error: unknown): boolean {
    const text = String(error instanceof Error ? error.message : error || '').toLowerCase()
    // 只对已知可恢复的错误降级，避免无限循环
    return text.includes('tohex is not a function')
        || text.includes('unknownerrorexception')
}

function promoteLegacyRuntime(reason: string, error: unknown): void {
    if (!forceLegacyRuntime) {
        console.warn(`[PdfProvider] switch runtime to legacy: ${reason}`, error)
    }
    forceLegacyRuntime = true
    if (cachedRuntimeKind === 'modern') {
        cachedPdfRuntime = null
        cachedRuntimeKind = null
    }
}

async function openPdfDocument(data: ArrayBuffer, forceLegacy = false): Promise<PdfDocumentProxy> {
    const runtime = await getPdfRuntime(forceLegacy || forceLegacyRuntime)
    // 直接传递 data，避免复制（PDF.js 只读）
    return runtime.getDocument({
        data: new Uint8Array(data),
        disableAutoFetch: true,
        disableStream: true,
    }).promise
}

async function openPdfDocumentWithFallback(data: ArrayBuffer): Promise<PdfDocumentProxy> {
    try {
        return await openPdfDocument(data, false)
    } catch (error) {
        if (!shouldFallbackToLegacy(error)) {
            throw error
        }
        promoteLegacyRuntime('document open parser error', error)
        return openPdfDocument(data, true)
    }
}

export class PdfContentProvider implements ContentProvider {
    private doc: PdfDocumentProxy | null = null
    private pageCount = 0
    private outline: TocItem[] = []
    private pageHtmlCache = new Map<number, string>()
    private pageImageUrlCache = new Map<number, string>()

    constructor(private data: ArrayBuffer) {}

    async init() {
        this.doc = await openPdfDocumentWithFallback(this.data)

        this.pageCount = this.doc.numPages
        try {
            const raw = await this.doc.getOutline()
            if (raw) {
                this.outline = raw.map((item: PdfOutlineItem, i: number) => ({
                    id: `outline-${i}`, href: `page-${i}`, label: item.title || `第 ${i + 1} 节`,
                }))
            }
        } catch { /* no outline */ }
    }

    private clearRenderedPageCache() {
        this.pageHtmlCache.clear()
        this.pageImageUrlCache.forEach((url) => {
            if (url.startsWith('blob:')) URL.revokeObjectURL(url)
        })
        this.pageImageUrlCache.clear()
    }

    private async reopenLegacyDocument(reason: string, error: unknown): Promise<void> {
        promoteLegacyRuntime(reason, error)
        this.clearRenderedPageCache()
        if (this.doc) {
            this.doc.destroy()
            this.doc = null
        }
        this.doc = await openPdfDocument(this.data, true)
        this.pageCount = this.doc.numPages
    }

    destroy() {
        this.clearRenderedPageCache()
        this.doc?.destroy()
        this.doc = null
    }

    getToc(): TocItem[] {
        if (this.outline.length) return this.outline
        // 无大纲时每10页一个条目
        const items: TocItem[] = []
        for (let i = 0; i < this.pageCount; i += 10) {
            items.push({ id: `p-${i}`, href: `page-${i}`, label: `第 ${i + 1} 页` })
        }
        return items
    }

    getSpineItems(): SpineItemInfo[] {
        return Array.from({ length: this.pageCount }, (_, i) => ({
            index: i, href: `page-${i}`, id: `page-${i}`, linear: true,
        }))
    }

    getSpineIndexByHref(href: string): number {
        const m = href.match(/page-(\d+)/)
        return m ? parseInt(m[1], 10) : -1
    }

    async extractChapterHtml(pageIndex: number): Promise<string> {
        if (!this.doc) return ''
        const cached = this.pageHtmlCache.get(pageIndex)
        if (cached) return cached

        let renderedPage: RenderedPdfPage
        try {
            renderedPage = await renderPdfPage(this.doc, pageIndex)
        } catch (error) {
            if (!shouldFallbackToLegacy(error)) throw error
            await this.reopenLegacyDocument('page render parser error', error)
            if (!this.doc) return ''
            renderedPage = await renderPdfPage(this.doc, pageIndex)
        }
        const imageUrl = renderedPage.imageUrl
        this.pageImageUrlCache.set(pageIndex, imageUrl)
        const html = renderPdfPageHtml(
            imageUrl,
            renderedPage.links,
            pageIndex,
            renderedPage.pageWidthPx,
            renderedPage.pageHeightPx,
            renderedPage.textLayerHtml,
        )
        this.pageHtmlCache.set(pageIndex, html)
        return html
    }

    async extractChapterStyles(): Promise<string[]> { return [] }
    unloadChapter() {}

    private async searchInCurrentDoc(keyword: string): Promise<SearchResult[]> {
        if (!this.doc) return []
        const results: SearchResult[] = []
        const lk = keyword.toLowerCase()
        for (let i = 1; i <= this.pageCount; i++) {
            const page = await this.doc.getPage(i)
            const content = await page.getTextContent()
            const text = content.items.map(it => it.str).join('')
            if (!text.toLowerCase().includes(lk)) continue
            const pos = text.toLowerCase().indexOf(lk)
            const start = Math.max(0, pos - 20)
            const end = Math.min(text.length, pos + keyword.length + 20)
            results.push({ cfi: `vitra:${i - 1}:0`, excerpt: text.slice(start, end) })
        }
        return results
    }

    async search(keyword: string): Promise<SearchResult[]> {
        try {
            return await this.searchInCurrentDoc(keyword)
        } catch (error) {
            if (!shouldFallbackToLegacy(error)) throw error
            await this.reopenLegacyDocument('search parser error', error)
            return this.searchInCurrentDoc(keyword)
        }
    }
}

async function renderPdfPage(doc: PdfDocumentProxy, pageIndex: number): Promise<RenderedPdfPage> {
    if (typeof document === 'undefined') {
        throw new Error('[PdfProvider] document is unavailable in current runtime')
    }

    const page = await doc.getPage(pageIndex + 1)
    const scale = getPdfRenderScale()
    const viewport = page.getViewport({ scale })
    const pageWidthPx = Math.ceil(viewport.width)
    const pageHeightPx = Math.ceil(viewport.height)

    const canvas = document.createElement('canvas')
    canvas.width = pageWidthPx
    canvas.height = pageHeightPx

    const context = canvas.getContext('2d')
    if (!context) throw new Error('[PdfProvider] canvas 2d context is unavailable')

    // 并行执行：页面渲染 + 文字层提取 + 链接提取
    // 【紧急修复】暂时禁用文字层，排查 CPU 占用问题
    const [_, textLayerHtml, links] = await Promise.all([
        page.render({ canvasContext: context, viewport }).promise,
        Promise.resolve(''), // renderPdfTextLayer(page, viewport).catch(() => ''),
        extractPdfPageLinks(doc, page, viewport, pageIndex),
    ])

    const imageUrl = await canvasToImageUrl(canvas)
    return { imageUrl, links, pageWidthPx, pageHeightPx, textLayerHtml }
}

async function canvasToImageUrl(canvas: HTMLCanvasElement): Promise<string> {
    if (typeof canvas.toBlob !== 'function') {
        return canvas.toDataURL('image/png')
    }

    const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((value) => resolve(value), 'image/png')
    })
    if (!blob) {
        return canvas.toDataURL('image/png')
    }
    return URL.createObjectURL(blob)
}

async function extractPdfPageLinks(
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

    const targetPage = await resolvePdfDestPageIndex(doc, annotation?.dest, currentPageIndex)
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
    if (head && typeof head === 'object' && typeof head.num === 'number') {
        const index = await doc.getPageIndex(head)
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
    if (!viewport || typeof viewport.width !== 'number' || typeof viewport.height !== 'number') return null
    if (viewport.width <= 0 || viewport.height <= 0) return null

    const rectNums = rect.map(Number)
    if (rectNums.some((value) => !Number.isFinite(value))) return null

    const useConverted = typeof viewport.convertToViewportRectangle === 'function'
    const [x1, y1, x2, y2] = useConverted
        ? viewport.convertToViewportRectangle!(rectNums)
        : rectNums

    const leftPx = Math.min(x1, x2)
    const rightPx = Math.max(x1, x2)
    const topPx = Math.min(y1, y2)
    const bottomPx = Math.max(y1, y2)
    const widthPx = rightPx - leftPx
    const heightPx = bottomPx - topPx
    if (widthPx <= 0 || heightPx <= 0) return null

    const left = clampPercent((leftPx / viewport.width) * 100)
    const top = clampPercent((topPx / viewport.height) * 100)
    const width = clampPercent((widthPx / viewport.width) * 100)
    const height = clampPercent((heightPx / viewport.height) * 100)
    if (width <= 0 || height <= 0) return null
    return { left, top, width, height }
}

function clampPercent(value: number): number {
    return Math.max(0, Math.min(100, Number(value.toFixed(4))))
}


function renderPdfPageHtml(
    imageUrl: string,
    links: readonly PdfPageLink[],
    pageIndex: number,
    pageWidthPx: number,
    pageHeightPx: number,
    textLayerHtml?: string,
): string {
    const safeUrl = escapeAttr(imageUrl)
    const imageTag = `<img src="${safeUrl}" width="${pageWidthPx}" height="${pageHeightPx}" alt="PDF page ${pageIndex + 1}" style="display:block;width:100%;height:auto;"/>`

    const content = imageTag + (textLayerHtml || '')
    if (links.length === 0) {
        return `<div class="pdf-page-layer" style="position:relative;width:100%;line-height:0;">${content}</div>`
    }

    const linkTags = links
        .map((link) => `<a data-pdf-page="${link.targetPage}" href="#pdf-page-${link.targetPage}" aria-label="PDF jump to page ${link.targetPage + 1}" style="position:absolute;left:${link.left}%;top:${link.top}%;width:${link.width}%;height:${link.height}%;display:block;z-index:2;background:transparent;text-decoration:none;"></a>`)
        .join('')

    return `<div class="pdf-page-layer" style="position:relative;width:100%;line-height:0;">${content}${linkTags}</div>`
}

export async function parsePdfMetadata(data: ArrayBuffer) {
    const doc = await openPdfDocumentWithFallback(data)
    const meta = await doc.getMetadata()
    const info = meta?.info
    const title = (info?.Title as string) || ''
    const author = (info?.Author as string) || '未知作者'
    doc.destroy()
    return { title, author, format: 'pdf' as const }
}
