import type { ContentProvider, TocItem, SpineItemInfo, SearchResult } from '../contentProvider'

const CHAPTER_SIZE = 5000 // ~5000 字符一章

export class TxtContentProvider implements ContentProvider {
    private chapters: string[] = []
    private fullText = ''

    constructor(private data: ArrayBuffer) {}

    async init() {
        this.fullText = new TextDecoder('utf-8').decode(this.data)
        // 按双换行分段，再按大小合并为章节
        const paragraphs = this.fullText.split(/\n\s*\n/).filter(p => p.trim())
        let current = ''
        for (const p of paragraphs) {
            if (current.length + p.length > CHAPTER_SIZE && current) {
                this.chapters.push(current)
                current = ''
            }
            current += (current ? '\n\n' : '') + p
        }
        if (current) this.chapters.push(current)
        if (this.chapters.length === 0) this.chapters.push(this.fullText || '(空文件)')
    }

    destroy() { this.chapters = []; this.fullText = '' }

    getToc(): TocItem[] {
        return this.chapters.map((_, i) => ({
            id: `ch-${i}`, href: `ch-${i}`, label: `第 ${i + 1} 节`,
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
        const text = this.chapters[i] ?? ''
        return text.split(/\n/).map(line => `<p>${escapeHtml(line)}</p>`).join('\n')
    }

    async extractChapterStyles(): Promise<string[]> { return [] }
    unloadChapter() {}

    async search(keyword: string): Promise<SearchResult[]> {
        const results: SearchResult[] = []
        const lk = keyword.toLowerCase()
        for (let i = 0; i < this.chapters.length; i++) {
            const ch = this.chapters[i].toLowerCase()
            let pos = ch.indexOf(lk)
            while (pos !== -1) {
                const start = Math.max(0, pos - 20)
                const end = Math.min(ch.length, pos + keyword.length + 20)
                results.push({ cfi: `bdise:${i}:0`, excerpt: this.chapters[i].slice(start, end) })
                pos = ch.indexOf(lk, pos + 1)
            }
        }
        return results
    }
}

function escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export async function parseTxtMetadata(_data: ArrayBuffer, filename: string) {
    return { title: filename.replace(/\.txt$/i, ''), author: '未知作者' }
}
