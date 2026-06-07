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
