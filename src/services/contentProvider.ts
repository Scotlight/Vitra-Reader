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

const ZIP_MAGIC_1 = [0x50, 0x4b, 0x03, 0x04]
const ZIP_MAGIC_2 = [0x50, 0x4b, 0x05, 0x06]
const ZIP_MAGIC_3 = [0x50, 0x4b, 0x07, 0x08]
const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46]
const MOBI_MAGIC_OFFSET = 60
const MOBI_MAGIC = 'BOOKMOBI'

type BinarySource = ArrayBuffer | Uint8Array

function hasMagic(bytes: Uint8Array, magic: number[]): boolean {
    if (bytes.length < magic.length) return false
    for (let i = 0; i < magic.length; i += 1) {
        if (bytes[i] !== magic[i]) return false
    }
    return true
}

function readAscii(bytes: Uint8Array, start: number, len: number): string {
    if (start < 0 || len <= 0 || start + len > bytes.length) return ''
    return new TextDecoder('ascii').decode(bytes.slice(start, start + len))
}

function toBytes(data?: BinarySource): Uint8Array | null {
    if (!data) return null
    return data instanceof Uint8Array ? data : new Uint8Array(data)
}

function detectByMagic(bytes: Uint8Array): 'pdf' | 'epub' | 'mobi' | null {
    if (hasMagic(bytes, PDF_MAGIC)) return 'pdf'

    if (
        hasMagic(bytes, ZIP_MAGIC_1) ||
        hasMagic(bytes, ZIP_MAGIC_2) ||
        hasMagic(bytes, ZIP_MAGIC_3)
    ) {
        return 'epub'
    }

    const mobiMagic = readAscii(bytes, MOBI_MAGIC_OFFSET, MOBI_MAGIC.length)
    if (mobiMagic === MOBI_MAGIC) return 'mobi'

    return null
}

function detectTextLikeFormat(bytes: Uint8Array): BookFormat | null {
    if (bytes.length === 0) return null

    const headBytes = bytes.slice(0, 8192)
    const head = new TextDecoder('utf-8').decode(headBytes).replace(/^\uFEFF/, '')
    const lower = head.toLowerCase()

    if (/<fictionbook[\s>]/i.test(head)) return 'fb2'
    if (/<!doctype\s+html|<html[\s>]/i.test(head)) return 'html'
    if (/^\s*<\?xml[\s>]/i.test(head)) return 'xml'
    if (/^\s*#{1,6}\s+\S+/m.test(head) || /^\s*[-*+]\s+\S+/m.test(head)) return 'md'
    if (lower.includes('<body') && lower.includes('</body>')) return 'html'
    return null
}

function detectByExtension(filename: string): BookFormat {
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

export function detectFormat(filename: string, data?: BinarySource): BookFormat {
    const ext = filename.split('.').pop()?.toLowerCase()
    const bytes = toBytes(data)

    if (bytes) {
        const magicFormat = detectByMagic(bytes)
        if (magicFormat === 'pdf') return 'pdf'
        if (magicFormat === 'epub') return 'epub'
        if (magicFormat === 'mobi') {
            if (ext === 'azw3') return 'azw3'
            if (ext === 'azw') return 'azw'
            return 'mobi'
        }

        const textLikeFormat = detectTextLikeFormat(bytes)
        if (textLikeFormat) return textLikeFormat
    }

    return detectByExtension(filename)
}

export function stripBookExtension(filename: string): string {
    return filename.replace(/\.(epub|pdf|txt|mobi|azw3?|htm|html|xhtml|xml|md|fb2)$/i, '')
}
