import type { ContentProvider, TocItem, SpineItemInfo, SearchResult } from '../contentProvider'

type PdfJsRuntime = {
    GlobalWorkerOptions: { workerSrc: string }
    getDocument: (src: unknown) => { promise: Promise<any> }
}

let cachedPdfRuntime: PdfJsRuntime | null = null
let cachedRuntimeKind: 'modern' | 'legacy' | null = null

async function getPdfRuntime(forceLegacy = false): Promise<PdfJsRuntime> {
    if (cachedPdfRuntime && cachedRuntimeKind && (!forceLegacy || cachedRuntimeKind === 'legacy')) {
        return cachedPdfRuntime
    }

    if (!forceLegacy) {
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
    const text = String((error as any)?.message || error || '').toLowerCase()
    return text.includes('tohex is not a function')
        || text.includes('unknownerrorexception')
        || text.includes('baseexceptionclosure')
}

async function openPdfDocument(data: ArrayBuffer, forceLegacy = false): Promise<any> {
    const runtime = await getPdfRuntime(forceLegacy)
    return runtime.getDocument({
        data: new Uint8Array(data.slice(0)),
        disableAutoFetch: true,
        disableStream: true,
    }).promise
}

export class PdfContentProvider implements ContentProvider {
    private doc: any | null = null
    private pageCount = 0
    private outline: TocItem[] = []

    constructor(private data: ArrayBuffer) {}

    async init() {
        try {
            this.doc = await openPdfDocument(this.data, false)
        } catch (error) {
            if (!shouldFallbackToLegacy(error)) {
                throw error
            }
            console.warn('[PdfProvider] retry with legacy runtime due to parser error:', error)
            this.doc = await openPdfDocument(this.data, true)
        }

        this.pageCount = this.doc.numPages
        try {
            const raw = await this.doc.getOutline()
            if (raw) {
                this.outline = raw.map((item: any, i: number) => ({
                    id: `outline-${i}`, href: `page-${i}`, label: item.title || `第 ${i + 1} 节`,
                }))
            }
        } catch { /* no outline */ }
    }

    destroy() { this.doc?.destroy(); this.doc = null }

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
        const page = await this.doc.getPage(pageIndex + 1) // 1-based
        const content = await page.getTextContent()
        let html = ''
        let lastY: number | null = null
        for (const item of content.items as any[]) {
            if (!item.str?.trim()) continue
            const y = item.transform?.[5]
            if (lastY !== null && Math.abs(y - lastY) > 2) {
                html += '</p><p>'
            }
            html += escapeHtml(item.str)
            lastY = y
        }
        return `<p>${html}</p>`
    }

    async extractChapterStyles(): Promise<string[]> { return [] }
    unloadChapter() {}

    async search(keyword: string): Promise<SearchResult[]> {
        if (!this.doc) return []
        const results: SearchResult[] = []
        const lk = keyword.toLowerCase()
        for (let i = 1; i <= this.pageCount; i++) {
            const page = await this.doc.getPage(i)
            const content = await page.getTextContent()
            const text = (content.items as any[]).map(it => it.str).join('')
            if (text.toLowerCase().includes(lk)) {
                const pos = text.toLowerCase().indexOf(lk)
                const start = Math.max(0, pos - 20)
                const end = Math.min(text.length, pos + keyword.length + 20)
                results.push({ cfi: `bdise:${i - 1}:0`, excerpt: text.slice(start, end) })
            }
        }
        return results
    }
}

function escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export async function parsePdfMetadata(data: ArrayBuffer) {
    let doc: any
    try {
        doc = await openPdfDocument(data, false)
    } catch (error) {
        if (!shouldFallbackToLegacy(error)) {
            throw error
        }
        doc = await openPdfDocument(data, true)
    }
    const meta = await doc.getMetadata()
    const info = meta?.info as any
    const title = info?.Title || ''
    const author = info?.Author || '未知作者'
    doc.destroy()
    return { title, author }
}
