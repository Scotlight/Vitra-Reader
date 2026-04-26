import type { ContentProvider, TocItem, SpineItemInfo, SearchResult } from '@/engine/core/contentProvider'
import { parseMobiBuffer } from './mobiParser'
import { renderMobiChapters, type MobiRenderedChapter } from './mobiHtmlRenderer'

const SEARCH_CONTEXT_CHARS = 20

export class MobiContentProvider implements ContentProvider {
    private chapters: MobiRenderedChapter[] = []
    private activeAssetUrls = new Set<string>()

    constructor(private data: ArrayBuffer) {}

    async init() {
        const parsed = parseMobiBuffer(this.data, {
            coverMode: 'blob-url',
            includeContent: true,
            includeCoverInContent: true,
            includeResources: true,
        })
        this.activeAssetUrls = new Set(parsed.resources.map((resource) => resource.url))
        if (parsed.cover) this.activeAssetUrls.add(parsed.cover)
        this.chapters = renderMobiChapters({
            content: parsed.content,
            resources: parsed.resources,
        })
    }

    destroy() {
        this.releaseAssetSession()
        this.chapters = []
    }

    isAssetUrlAvailable(url: string): boolean {
        return !url.startsWith('blob:') || this.activeAssetUrls.has(url)
    }

    releaseAssetSession(): void {
        this.activeAssetUrls.forEach((url) => URL.revokeObjectURL(url))
        this.activeAssetUrls.clear()
    }

    getToc(): TocItem[] {
        return this.chapters.map((chapter, index) => ({
            id: `ch-${index}`,
            href: chapter.href,
            label: chapter.label,
        }))
    }

    getSpineItems(): SpineItemInfo[] {
        return this.chapters.map((chapter, index) => ({
            index,
            href: chapter.href,
            id: chapter.href,
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

    async extractChapterStyles(index: number): Promise<string[]> {
        return [...(this.chapters[index]?.styles ?? [])]
    }

    unloadChapter() {}

    async search(keyword: string): Promise<SearchResult[]> {
        if (!keyword.trim()) return []
        const results: SearchResult[] = []
        const needle = keyword.toLowerCase()
        for (let i = 0; i < this.chapters.length; i += 1) {
            const text = this.chapters[i].plainText
            const lowerText = text.toLowerCase()
            let pos = lowerText.indexOf(needle)
            while (pos !== -1) {
                const start = Math.max(0, pos - SEARCH_CONTEXT_CHARS)
                const end = Math.min(text.length, pos + keyword.length + SEARCH_CONTEXT_CHARS)
                results.push({ cfi: `vitra:${i}:0`, excerpt: text.slice(start, end) })
                pos = lowerText.indexOf(needle, pos + 1)
            }
        }
        return results
    }
}

export async function parseMobiMetadata(data: ArrayBuffer) {
    const { title, author, cover } = parseMobiBuffer(data, {
        coverMode: 'data-url',
        includeContent: false,
        includeCoverInContent: false,
        includeResources: false,
    })
    return { title, author, cover: cover || '' }
}
