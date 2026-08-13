export type BookFormat =
    | 'epub' | 'pdf' | 'txt' | 'mobi' | 'azw' | 'azw3'
    | 'html' | 'xml' | 'md' | 'fb2'
    | 'docx' | 'djvu' | 'cbz' | 'cbt' | 'cbr' | 'cb7'

export interface TocItem {
    id: string
    href: string
    label: string
    subitems?: TocItem[]
}

export interface SpineItemInfo {
    index: number
    href: string
    id: string
    linear: boolean
    /** EPUB3 目录文档（manifest properties 含 nav）。保留在 spine 里占位保序，阅读流跳过不停留 */
    isNavDoc?: boolean
}

export interface SearchResult {
    cfi: string
    excerpt: string
}

export interface ContentProvider {
    init(): Promise<void>
    destroy(): void
    getToc(): TocItem[]
    getSpineItems(): SpineItemInfo[]
    getSpineIndexByHref(href: string): number
    extractChapterHtml(spineIndex: number): Promise<string>
    extractChapterStyles(spineIndex: number): Promise<string[]>
    unloadChapter(spineIndex: number): void
    search(keyword: string): Promise<SearchResult[]>
    isAssetUrlAvailable?(url: string): boolean
    releaseAssetSession?(): void
}

export function stripBookExtension(filename: string): string {
    return filename.replace(/\.(epub|pdf|txt|mobi|azw3?|htm|html|xhtml|mhtml|xml|md|fb2|docx|djvu?|cbz|cbt|cbr|cb7)$/i, '')
}
