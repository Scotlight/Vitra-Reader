import * as pdfjsLib from 'pdfjs-dist'
import type { ContentProvider, TocItem, SpineItemInfo, SearchResult } from '../contentProvider'

// Worker 路径设置
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
).toString()

export class PdfContentProvider implements ContentProvider {
    private doc: pdfjsLib.PDFDocumentProxy | null = null
    private pageCount = 0
    private outline: TocItem[] = []

    constructor(private data: ArrayBuffer) {}

    private getPdfBinary(): Uint8Array {
        const cloned = this.data.slice(0)
        return new Uint8Array(cloned)
    }

    async init() {
        this.doc = await pdfjsLib.getDocument({ data: this.getPdfBinary() }).promise
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
    const doc = await pdfjsLib.getDocument({ data: new Uint8Array(data.slice(0)) }).promise
    const meta = await doc.getMetadata()
    const info = meta?.info as any
    const title = info?.Title || ''
    const author = info?.Author || '未知作者'
    doc.destroy()
    return { title, author }
}
