import { marked } from 'marked'
import type { ContentProvider, TocItem, SpineItemInfo, SearchResult } from '../contentProvider'

interface Chapter {
    title: string
    md: string
}

export class MdContentProvider implements ContentProvider {
    private chapters: Chapter[] = []

    constructor(private data: ArrayBuffer) {}

    async init() {
        const text = new TextDecoder('utf-8').decode(this.data)
        const lines = text.split('\n')

        const splits: { title: string; lineIdx: number }[] = []
        for (let i = 0; i < lines.length; i++) {
            const m = lines[i].match(/^(#{1,2})\s+(.+)/)
            if (m) splits.push({ title: m[2].trim(), lineIdx: i })
        }

        if (splits.length === 0) {
            this.chapters = [{ title: '正文', md: text }]
        } else {
            if (splits[0].lineIdx > 0) {
                const pre = lines.slice(0, splits[0].lineIdx).join('\n').trim()
                if (pre) this.chapters.push({ title: '前言', md: pre })
            }
            for (let i = 0; i < splits.length; i++) {
                const start = splits[i].lineIdx
                const end = i + 1 < splits.length ? splits[i + 1].lineIdx : lines.length
                this.chapters.push({ title: splits[i].title, md: lines.slice(start, end).join('\n') })
            }
        }
    }

    destroy() { this.chapters = [] }

    getToc(): TocItem[] {
        return this.chapters.map((ch, i) => ({
            id: `ch-${i}`, href: `ch-${i}`, label: ch.title,
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
        const ch = this.chapters[i]
        if (!ch) return ''
        return await marked.parse(ch.md)
    }

    async extractChapterStyles(): Promise<string[]> { return [] }
    unloadChapter() {}

    async search(keyword: string): Promise<SearchResult[]> {
        const results: SearchResult[] = []
        const lk = keyword.toLowerCase()
        for (let i = 0; i < this.chapters.length; i++) {
            const plain = this.chapters[i].md.toLowerCase()
            let pos = plain.indexOf(lk)
            while (pos !== -1) {
                const start = Math.max(0, pos - 20)
                const end = Math.min(plain.length, pos + keyword.length + 20)
                results.push({ cfi: `bdise:${i}:0`, excerpt: this.chapters[i].md.slice(start, end) })
                pos = plain.indexOf(lk, pos + 1)
            }
        }
        return results
    }
}

export async function parseMdMetadata(data: ArrayBuffer, filename: string) {
    const text = new TextDecoder('utf-8').decode(data)
    const m = text.match(/^#\s+(.+)/m)
    const title = m ? m[1].trim() : filename.replace(/\.md$/i, '')
    return { title: title || filename, author: '未知作者' }
}
