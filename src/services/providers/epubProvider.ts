import ePub, { Book } from 'epubjs'
import type { ContentProvider, TocItem, SpineItemInfo, SearchResult } from '../contentProvider'
import {
    getSpineItems as epubGetSpineItems,
    extractChapterHeading as epubExtractHeading,
    extractChapterHtml as epubExtractHtml,
    extractChapterStyles as epubExtractStyles,
    unloadChapter as epubUnloadChapter,
} from '../epubContentExtractor'

export class EpubContentProvider implements ContentProvider {
    private book: Book
    private tocItems: TocItem[] = []
    private spineItems: SpineItemInfo[] = []

    constructor(data: ArrayBuffer) {
        this.book = ePub(data as any)
    }

    async init() {
        await this.book.ready
        this.spineItems = epubGetSpineItems(this.book)
        this.tocItems = []
        try {
            const nav = await this.book.loaded.navigation
            this.tocItems = normalizeToc(nav.toc as TocItem[])
        } catch (error) {
            console.warn('[EpubProvider] Navigation load failed, use spine fallback:', error)
        }

        if (this.tocItems.length === 0) {
            this.tocItems = await buildFallbackTocFromSpine(this.book, this.spineItems)
        }
    }

    destroy() { this.book.destroy() }
    getToc() { return this.tocItems }
    getSpineItems() { return this.spineItems }

    getSpineIndexByHref(href: string): number {
        const item = this.book.spine?.get(href)
        return item ? item.index : -1
    }

    extractChapterHtml(i: number) { return epubExtractHtml(this.book, i) }
    extractChapterStyles(i: number) { return epubExtractStyles(this.book, i) }
    unloadChapter(i: number) { epubUnloadChapter(this.book, i) }

    async search(keyword: string): Promise<SearchResult[]> {
        const spineItems = (this.book.spine as any).spineItems
        const results = await Promise.all(
            spineItems.map((item: any) =>
                item.load(this.book.load.bind(this.book))
                    .then(item.find.bind(item, keyword))
                    .finally(item.unload.bind(item))
            )
        )
        return [].concat(...results as any)
    }
}

export async function parseEpubMetadata(data: ArrayBuffer) {
    const { parseEpub } = await import('../epubService')
    return parseEpub(data)
}

function normalizeToc(items: TocItem[]): TocItem[] {
    if (!Array.isArray(items)) return []
    return items
        .map((item, index) => ({
            id: item.id || `toc-${index}`,
            href: item.href || '',
            label: (item.label || '').trim(),
            subitems: item.subitems ? normalizeToc(item.subitems) : [],
        }))
        .filter((item) => item.href && item.label)
}

async function buildFallbackTocFromSpine(
    book: Book,
    spineItems: SpineItemInfo[],
): Promise<TocItem[]> {
    const tocItems: TocItem[] = []
    for (let index = 0; index < spineItems.length; index += 1) {
        const spine = spineItems[index]
        const heading = await safeExtractHeading(book, spine.index)
        tocItems.push({
            id: spine.id || `spine-${index}`,
            href: spine.href,
            label: heading || labelFromHref(spine.href, index),
        })
    }
    return tocItems
}

async function safeExtractHeading(book: Book, spineIndex: number): Promise<string> {
    try {
        return await epubExtractHeading(book, spineIndex)
    } catch (error) {
        console.warn(`[EpubProvider] Extract heading failed for spine ${spineIndex}:`, error)
        return ''
    }
}

function labelFromHref(href: string, index: number): string {
    const fallback = `Chapter ${index + 1}`
    if (!href) return fallback

    const [pathPart] = href.split('#', 2)
    const filePart = pathPart.split('/').pop() || ''
    const decoded = decodeURIComponentSafe(filePart)
    const withoutExt = decoded.replace(/\.[^.]+$/, '')
    const cleaned = withoutExt
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()

    return cleaned || fallback
}

function decodeURIComponentSafe(value: string): string {
    try {
        return decodeURIComponent(value)
    } catch {
        return value
    }
}
