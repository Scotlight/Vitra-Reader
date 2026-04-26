import type { ContentProvider, TocItem, SpineItemInfo, SearchResult } from '@/engine/core/contentProvider'
import { stripBookExtension } from '@/engine/core/contentProvider'
import { VitraSectionSplitter } from '@/engine/core/vitraSectionSplitter'
import { decodeTextBuffer } from './textDecoding'
import { EMPTY_SECTION_HTML, DEFAULT_DOCUMENT_LABEL } from '@/engine/render/chapterTitleDetector'
import { searchPlainChapterTexts, stripHtmlTags } from './chapterSearch'
import {
    buildFlatChapterSpineItems,
    buildFlatChapterToc,
    parseFlatChapterHrefIndex,
} from './flatChapterProvider'

interface Chapter {
    title: string
    html: string
    plain: string
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
            plain: stripHtmlTags(chunk.html || ''),
        }))

        if (this.chapters.length === 0) {
            this.chapters = [{ title: DEFAULT_DOCUMENT_LABEL, html: EMPTY_SECTION_HTML, plain: '' }]
        }
    }

    destroy() { this.chapters = [] }

    getToc(): TocItem[] {
        return buildFlatChapterToc(this.chapters)
    }

    getSpineItems(): SpineItemInfo[] {
        return buildFlatChapterSpineItems(this.chapters.length)
    }

    getSpineIndexByHref(href: string): number {
        return parseFlatChapterHrefIndex(href)
    }

    async extractChapterHtml(i: number): Promise<string> {
        return this.chapters[i]?.html ?? ''
    }

    async extractChapterStyles(): Promise<string[]> { return [] }
    unloadChapter() {}

    async search(keyword: string): Promise<SearchResult[]> {
        return searchPlainChapterTexts(keyword, this.chapters.length, (index) => this.chapters[index].plain)
    }
}

export async function parseHtmlMetadata(data: ArrayBuffer, filename: string) {
    const text = decodeTextBuffer(data, 'html').text
    const titleMatch = text.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
    const title = titleMatch ? stripHtmlTags(titleMatch[1]).trim() : stripBookExtension(filename)
    return { title: title || filename, author: '未知作者' }
}
