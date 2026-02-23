export type BookFormat = 'epub' | 'pdf' | 'txt' | 'mobi' | 'azw' | 'azw3' | 'html' | 'xml' | 'md' | 'fb2'

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
}

export function detectFormat(filename: string): BookFormat {
    const ext = filename.split('.').pop()?.toLowerCase()
    if (ext === 'pdf') return 'pdf'
    if (ext === 'txt') return 'txt'
    if (ext === 'mobi') return 'mobi'
    if (ext === 'azw') return 'azw'
    if (ext === 'azw3') return 'azw3'
    if (['htm', 'html', 'xhtml'].includes(ext ?? '')) return 'html'
    if (ext === 'xml') return 'xml'
    if (ext === 'md') return 'md'
    if (ext === 'fb2') return 'fb2'
    return 'epub'
}

export function stripBookExtension(filename: string): string {
    return filename.replace(/\.(epub|pdf|txt|mobi|azw3?|htm|html|xhtml|xml|md|fb2)$/i, '')
}
