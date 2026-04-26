import type { ContentProvider, TocItem, SpineItemInfo, SearchResult } from '@/engine/core/contentProvider'
import { parseMobiBuffer } from './mobiParser'
import {
    filterRenderableMobiChapters,
    renderMobiChapters,
    type MobiRenderedChapter,
} from './mobiHtmlRenderer'
import { isLikelyMobiMojibake } from './mobiTextDecoding'
import {
    loadLingoMobiBook,
    parseLingoMobiMetadata,
    type LingoMobiFormat,
} from './lingoMobiAdapter'

const SEARCH_CONTEXT_CHARS = 20

function buildChapterTextSample(chapters: readonly MobiRenderedChapter[]): string {
    return chapters
        .slice(0, 3)
        .map((chapter) => chapter.plainText.trim())
        .filter(Boolean)
        .join('\n')
}

function buildTocFromChapters(chapters: readonly MobiRenderedChapter[]): TocItem[] {
    return chapters.map((chapter, index) => ({
        id: chapter.href || `ch-${index}`,
        href: chapter.href,
        label: chapter.label || `第 ${index + 1} 章`,
    }))
}

export class MobiContentProvider implements ContentProvider {
    private chapters: MobiRenderedChapter[] = []
    private activeAssetUrls = new Set<string>()
    private tocItems: TocItem[] = []
    private spineItems: SpineItemInfo[] = []
    private resolveHrefToIndex: (href: string) => number = () => -1
    private releaseAssets: (() => void) | null = null

    constructor(
        private data: ArrayBuffer,
        private format: LingoMobiFormat = 'mobi',
    ) {}

    async init() {
        try {
            const book = await loadLingoMobiBook(this.data, this.format)
            if (book.kind === 'mobi' && isLikelyMobiMojibake(buildChapterTextSample(book.chapters))) {
                book.destroy()
                throw new Error('[MobiProvider] Lingo MOBI text looks mojibake')
            }
            this.chapters = [...book.chapters]
            this.tocItems = [...book.tocItems]
            this.spineItems = [...book.spineItems]
            this.activeAssetUrls = new Set(book.activeAssetUrls)
            this.resolveHrefToIndex = book.resolveHref
            this.releaseAssets = () => {
                book.destroy()
            }
            return
        } catch (error) {
            console.warn('[MobiProvider] Lingo parser failed, fallback to legacy parser:', error)
        }

        const parsed = parseMobiBuffer(this.data, {
            coverMode: 'blob-url',
            includeContent: true,
            includeCoverInContent: true,
            includeResources: true,
        })
        this.activeAssetUrls = new Set(parsed.resources.map((resource) => resource.url))
        if (parsed.cover) this.activeAssetUrls.add(parsed.cover)
        this.chapters = filterRenderableMobiChapters(renderMobiChapters({
            content: parsed.content,
            resources: parsed.resources,
        }))
        this.tocItems = buildTocFromChapters(this.chapters)
        this.spineItems = this.chapters.map((chapter, index) => ({
            index,
            href: chapter.href,
            id: chapter.href,
            linear: true,
        }))
        this.resolveHrefToIndex = (href: string) => {
            const match = href.match(/ch-(\d+)/)
            return match ? parseInt(match[1], 10) : -1
        }
        this.releaseAssets = () => {
            this.activeAssetUrls.forEach((url) => URL.revokeObjectURL(url))
        }
    }

    destroy() {
        this.releaseAssetSession()
        this.chapters = []
        this.tocItems = []
        this.spineItems = []
        this.resolveHrefToIndex = () => -1
    }

    isAssetUrlAvailable(url: string): boolean {
        return !url.startsWith('blob:') || this.activeAssetUrls.has(url)
    }

    releaseAssetSession(): void {
        this.releaseAssets?.()
        this.releaseAssets = null
        this.activeAssetUrls.clear()
    }

    getToc(): TocItem[] {
        return [...this.tocItems]
    }

    getSpineItems(): SpineItemInfo[] {
        return [...this.spineItems]
    }

    getSpineIndexByHref(href: string): number {
        return this.resolveHrefToIndex(href)
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

export async function parseMobiMetadata(
    data: ArrayBuffer,
    format: LingoMobiFormat = 'mobi',
) {
    try {
        const metadata = await parseLingoMobiMetadata(data, format)
        if (format !== 'azw3' && isLikelyMobiMojibake(`${metadata.title} ${metadata.author}`, 'short')) {
            throw new Error('[MobiProvider] Lingo metadata looks mojibake')
        }
        return metadata
    } catch (error) {
        console.warn('[MobiProvider] Lingo metadata parser failed, fallback to legacy parser:', error)
    }

    const { title, author, cover } = parseMobiBuffer(data, {
        coverMode: 'data-url',
        includeContent: false,
        includeCoverInContent: false,
        includeResources: false,
    })
    return { title, author, cover: cover || '' }
}
