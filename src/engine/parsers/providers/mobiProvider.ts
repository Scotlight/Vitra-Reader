import type { ContentProvider, TocItem, SpineItemInfo, SearchResult } from '../../core/contentProvider'
import { parseMobiBuffer } from './mobiParser'
import { EMPTY_SECTION_HTML } from '../../render/chapterTitleDetector'

interface Chapter {
    label: string
    html: string
}

function splitMobiChapters(content: string): Chapter[] {
    const parts = content.split(/<(?:h[12][^>]*>|mbp:pagebreak[^/]*\/?>)/i).filter((part) => part.trim())
    const headings = content.match(/<(?:h[12][^>]*>)(.*?)<\/h[12]>/gi) || []
    if (parts.length === 0) parts.push(content || EMPTY_SECTION_HTML)
    return parts.map((html, index) => {
        const heading = headings[index - 1]?.replace(/<[^>]+>/g, '').trim()
        return { label: heading || `第 ${index + 1} 章`, html }
    })
}

export class MobiContentProvider implements ContentProvider {
    private chapters: Chapter[] = []

    constructor(private data: ArrayBuffer) {}

    async init() {
        const { content } = parseMobiBuffer(this.data)
        this.chapters = splitMobiChapters(content)
    }

    destroy() {
        this.chapters = []
    }

    getToc(): TocItem[] {
        return this.chapters.map((chapter, index) => ({
            id: `ch-${index}`,
            href: `ch-${index}`,
            label: chapter.label,
        }))
    }

    getSpineItems(): SpineItemInfo[] {
        return this.chapters.map((_, index) => ({
            index,
            href: `ch-${index}`,
            id: `ch-${index}`,
            linear: true,
        }))
    }

    getSpineIndexByHref(href: string): number {
        const match = href.match(/ch-(\d+)/)
        return match ? parseInt(match[1], 10) : -1
    }

    async extractChapterHtml(index: number): Promise<string> {
        return this.chapters[index]?.html ?? ''
    }

    async extractChapterStyles(): Promise<string[]> {
        return []
    }

    unloadChapter() {}

    async search(keyword: string): Promise<SearchResult[]> {
        const results: SearchResult[] = []
        const needle = keyword.toLowerCase()
        for (let i = 0; i < this.chapters.length; i += 1) {
            const text = this.chapters[i].html.replace(/<[^>]+>/g, '')
            const lowerText = text.toLowerCase()
            let pos = lowerText.indexOf(needle)
            while (pos !== -1) {
                const start = Math.max(0, pos - 20)
                const end = Math.min(text.length, pos + keyword.length + 20)
                results.push({ cfi: `vitra:${i}:0`, excerpt: text.slice(start, end) })
                pos = lowerText.indexOf(needle, pos + 1)
            }
        }
        return results
    }
}

export async function parseMobiMetadata(data: ArrayBuffer) {
    const { title, author, cover } = parseMobiBuffer(data)
    return { title, author, cover: cover || '' }
}
