import ePub, { Book } from 'epubjs'
import type { ContentProvider, TocItem, SpineItemInfo, SearchResult } from '../contentProvider'
import {
    getSpineItems as epubGetSpineItems,
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
        const nav = await this.book.loaded.navigation
        this.tocItems = nav.toc as TocItem[]
        this.spineItems = epubGetSpineItems(this.book)
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
