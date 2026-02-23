import type { ContentProvider, TocItem, SpineItemInfo, SearchResult } from '../contentProvider'

/**
 * 简易 MOBI/PalmDOC 解析器（浏览器端，从 ArrayBuffer 解析）
 * 支持无压缩(1) 和 PalmDOC 压缩(2)
 */

function readString(view: DataView, offset: number, length: number): string {
    let s = ''
    for (let i = 0; i < length; i++) {
        const c = view.getUint8(offset + i)
        if (c === 0) break
        s += String.fromCharCode(c)
    }
    return s
}

function palmDocDecompress(data: Uint8Array): string {
    let result = ''
    let i = 0
    while (i < data.length) {
        const byte = data[i++]
        if (byte === 0) {
            result += '\0'
        } else if (byte >= 1 && byte <= 8) {
            for (let j = 0; j < byte && i < data.length; j++) result += String.fromCharCode(data[i++])
        } else if (byte < 128) {
            result += String.fromCharCode(byte)
        } else if (byte >= 192) {
            result += ' ' + String.fromCharCode(byte ^ 128)
        } else {
            if (i >= data.length) break
            const concat = (byte << 8) | data[i++]
            const distance = (concat >> 3) & 0x07FF
            const length = (concat & 7) + 3
            for (let j = 0; j < length; j++) {
                result += result.charAt(result.length - distance)
            }
        }
    }
    return result
}

interface MobiParsed { title: string; author: string; content: string }

function parseMobiBuffer(buf: ArrayBuffer): MobiParsed {
    const view = new DataView(buf)
    const u8 = new Uint8Array(buf)

    // PDB header
    const name = readString(view, 0, 32)
    const recordCount = view.getUint16(0x4C)

    // Record offsets
    const records: number[] = []
    for (let i = 0; i < recordCount; i++) {
        records.push(view.getUint32(0x4E + i * 8))
    }

    // Record 0 = MOBI header
    const r0 = records[0]
    const compression = view.getUint16(r0)
    const textRecordCount = view.getUint16(r0 + 8)
    const mobiHeaderLength = view.getUint32(r0 + 20)
    const fullNameOffset = view.getUint32(r0 + 0x54)
    const fullNameLength = view.getUint32(r0 + 0x58)
    const title = readString(view, r0 + fullNameOffset, fullNameLength) || name

    // EXTH parsing for author
    let author = '未知作者'
    const exthFlag = view.getUint32(r0 + 0x80)
    if (exthFlag & 0x40) {
        const exthOffset = r0 + 16 + mobiHeaderLength
        if (exthOffset + 12 < buf.byteLength) {
            const exthId = readString(view, exthOffset, 4)
            if (exthId === 'EXTH') {
                const exthCount = view.getUint32(exthOffset + 8)
                let pos = exthOffset + 12
                for (let i = 0; i < exthCount && pos + 8 < buf.byteLength; i++) {
                    const type = view.getUint32(pos)
                    const len = view.getUint32(pos + 4)
                    if (type === 100 && len > 8) { // author
                        author = new TextDecoder('utf-8').decode(u8.slice(pos + 8, pos + len))
                    }
                    pos += len
                }
            }
        }
    }

    // Extract text records
    let content = ''
    for (let i = 1; i <= textRecordCount && i < records.length; i++) {
        const start = records[i]
        const end = i + 1 < records.length ? records[i + 1] : buf.byteLength
        const data = u8.slice(start, end)
        if (compression === 1) {
            content += new TextDecoder('utf-8').decode(data)
        } else if (compression === 2) {
            content += palmDocDecompress(data)
        }
    }

    return { title, author, content }
}
export class MobiContentProvider implements ContentProvider {
    private chapters: { label: string; html: string }[] = []

    constructor(private data: ArrayBuffer) {}

    async init() {
        const { content } = parseMobiBuffer(this.data)
        // 按 <h1>/<h2>/<mbp:pagebreak> 分割章节
        const parts = content.split(/<(?:h[12][^>]*>|mbp:pagebreak[^/]*\/?>)/i).filter(p => p.trim())
        const headings = content.match(/<(?:h[12][^>]*>)(.*?)<\/h[12]>/gi) || []
        if (parts.length === 0) parts.push(content || '<p>(空内容)</p>')
        for (let i = 0; i < parts.length; i++) {
            const labelMatch = headings[i - 1]?.replace(/<[^>]+>/g, '').trim()
            this.chapters.push({
                label: labelMatch || `第 ${i + 1} 章`,
                html: parts[i],
            })
        }
    }

    destroy() { this.chapters = [] }

    getToc(): TocItem[] {
        return this.chapters.map((ch, i) => ({
            id: `ch-${i}`, href: `ch-${i}`, label: ch.label,
        }))
    }

    getSpineItems(): SpineItemInfo[] {
        return this.chapters.map((_, i) => ({
            index: i, href: `ch-${i}`, id: `ch-${i}`, linear: true,
        }))
    }

    getSpineIndexByHref(href: string): number {
        const m = href.match(/ch-(\d+)/)
        return m ? parseInt(m[1], 10) : -1
    }

    async extractChapterHtml(i: number): Promise<string> {
        return this.chapters[i]?.html ?? ''
    }

    async extractChapterStyles(): Promise<string[]> { return [] }
    unloadChapter() {}

    async search(keyword: string): Promise<SearchResult[]> {
        const results: SearchResult[] = []
        const lk = keyword.toLowerCase()
        for (let i = 0; i < this.chapters.length; i++) {
            const text = this.chapters[i].html.replace(/<[^>]+>/g, '')
            const lt = text.toLowerCase()
            let pos = lt.indexOf(lk)
            while (pos !== -1) {
                const start = Math.max(0, pos - 20)
                const end = Math.min(text.length, pos + keyword.length + 20)
                results.push({ cfi: `bdise:${i}:0`, excerpt: text.slice(start, end) })
                pos = lt.indexOf(lk, pos + 1)
            }
        }
        return results
    }
}

export async function parseMobiMetadata(data: ArrayBuffer) {
    const { title, author } = parseMobiBuffer(data)
    return { title, author }
}
