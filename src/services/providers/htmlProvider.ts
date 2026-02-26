import type { ContentProvider, TocItem, SpineItemInfo, SearchResult } from '../contentProvider'
import { VitraSectionSplitter } from '../vitraSectionSplitter'
import { decodeTextBuffer } from './textDecoding'
import { EMPTY_SECTION_HTML, DEFAULT_DOCUMENT_LABEL } from '../../utils/chapterTitleDetector'

interface Chapter {
    title: string
    html: string
}

export class HtmlContentProvider implements ContentProvider {
    private chapters: Chapter[] = []

    constructor(private data: ArrayBuffer) {}

    async init() {
        const text = decodeTextBuffer(this.data, 'html').text

        // 取 <body> 内容，fallback 为全文
        const bodyMatch = text.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
        const body = bodyMatch ? bodyMatch[1] : text

        const chunks = VitraSectionSplitter.split(body)
        this.chapters = chunks.map((chunk, index) => ({
            title: chunk.label || `第 ${index + 1} 章`,
            html: chunk.html || EMPTY_SECTION_HTML,
        }))

        if (this.chapters.length === 0) {
            this.chapters = [{ title: DEFAULT_DOCUMENT_LABEL, html: EMPTY_SECTION_HTML }]
        }
    }

    destroy() { this.chapters = [] }

    getToc(): TocItem[] {
        return this.chapters.map((ch, i) => ({
            id: `ch-${i}`, href: `ch-${i}`, label: ch.title,
        }))
    }

    getSpineItems(): SpineItemInfo[] {
        return this.chapters.map((_, i) => ({
            index: i, href: `ch-${i}`, id: `ch-${i}`, linear: true,
        }))
    }

    getSpineIndexByHref(href: string): number {
        const m = href.match(/ch-(\d+)/)
        return m ? parseInt(m[1], 10) : -1
    }

    async extractChapterHtml(i: number): Promise<string> {
        return this.chapters[i]?.html ?? ''
    }

    async extractChapterStyles(): Promise<string[]> { return [] }
    unloadChapter() {}

    async search(keyword: string): Promise<SearchResult[]> {
        const results: SearchResult[] = []
        const lk = keyword.toLowerCase()
        for (let i = 0; i < this.chapters.length; i++) {
            const plain = stripTags(this.chapters[i].html).toLowerCase()
            let pos = plain.indexOf(lk)
            while (pos !== -1) {
                const start = Math.max(0, pos - 20)
                const end = Math.min(plain.length, pos + keyword.length + 20)
                results.push({ cfi: `bdise:${i}:0`, excerpt: stripTags(this.chapters[i].html).slice(start, end) })
                pos = plain.indexOf(lk, pos + 1)
            }
        }
        return results
    }
}

function stripTags(html: string): string {
    return html.replace(/<[^>]+>/g, '')
}

export async function parseHtmlMetadata(data: ArrayBuffer, filename: string) {
    const text = decodeTextBuffer(data, 'html').text
    const titleMatch = text.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
    const title = titleMatch ? stripTags(titleMatch[1]).trim() : filename.replace(/\.(htm|html|xhtml)$/i, '')
    return { title: title || filename, author: '未知作者' }
}
