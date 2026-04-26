import { marked } from 'marked'
import type { ContentProvider, TocItem, SpineItemInfo, SearchResult } from '@/engine/core/contentProvider'
import { stripBookExtension } from '@/engine/core/contentProvider'
import { VitraSectionSplitter } from '@/engine/core/vitraSectionSplitter'
import { decodeTextBuffer } from './textDecoding'
import { EMPTY_SECTION_HTML, DEFAULT_DOCUMENT_LABEL } from '@/engine/render/chapterTitleDetector'
import { searchPlainChapterTexts, stripHtmlTags } from './chapterSearch'

interface Chapter {
    title: string
    html: string
    plain: string
}

export class MdContentProvider implements ContentProvider {
    private chapters: Chapter[] = []

    constructor(private data: ArrayBuffer) {}

    async init() {
        const text = decodeTextBuffer(this.data, 'md').text
        const rendered = await marked.parse(text)
        const html = typeof rendered === 'string' ? rendered : String(rendered)
        const chunks = VitraSectionSplitter.split(html)
        this.chapters = chunks.map((chunk, index) => ({
            title: chunk.label || `第 ${index + 1} 章`,
            html: chunk.html || EMPTY_SECTION_HTML,
            plain: stripHtmlTags(chunk.html || ''),
        }))

        if (this.chapters.length === 0) {
            this.chapters = [{ title: DEFAULT_DOCUMENT_LABEL, html: EMPTY_SECTION_HTML, plain: '' }]
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
        const ch = this.chapters[i]
        if (!ch) return ''
        return ch.html
    }

    async extractChapterStyles(): Promise<string[]> { return [] }
    unloadChapter() {}

    async search(keyword: string): Promise<SearchResult[]> {
        return searchPlainChapterTexts(keyword, this.chapters.length, (index) => this.chapters[index].plain)
    }
}

export async function parseMdMetadata(data: ArrayBuffer, filename: string) {
    const text = decodeTextBuffer(data, 'md').text
    const m = text.match(/^#\s+(.+)/m)
    const title = m ? m[1].trim() : stripBookExtension(filename)
    return { title: title || filename, author: '未知作者' }
}
