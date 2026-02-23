import type { ContentProvider, TocItem, SpineItemInfo, SearchResult } from '../contentProvider'

interface Chapter {
    title: string
    html: string
}

export class HtmlContentProvider implements ContentProvider {
    private chapters: Chapter[] = []

    constructor(private data: ArrayBuffer) {}

    async init() {
        let text: string
        try {
            text = new TextDecoder('utf-8', { fatal: true }).decode(this.data)
        } catch {
            text = new TextDecoder('gbk').decode(this.data)
        }

        // 取 <body> 内容，fallback 为全文
        const bodyMatch = text.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
        const body = bodyMatch ? bodyMatch[1] : text

        // 按 h1/h2/h3 标签分割章节
        const headingRe = /<(h[123])[^>]*>([\s\S]*?)<\/\1>/gi
        const splits: { title: string; pos: number }[] = []
        let m: RegExpExecArray | null
        while ((m = headingRe.exec(body)) !== null) {
            splits.push({
                title: stripTags(m[2]).trim() || `第 ${splits.length + 1} 章`,
                pos: m.index,
            })
        }

        if (splits.length === 0) {
            // 没有标题，整篇作为一章
            this.chapters = [{ title: '正文', html: body }]
        } else {
            // 第一个标题前如有内容，作为"前言"
            if (splits[0].pos > 0) {
                const pre = body.slice(0, splits[0].pos).trim()
                if (pre) this.chapters.push({ title: '前言', html: pre })
            }
            for (let i = 0; i < splits.length; i++) {
                const start = splits[i].pos
                const end = i + 1 < splits.length ? splits[i + 1].pos : body.length
                this.chapters.push({ title: splits[i].title, html: body.slice(start, end) })
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
        return this.chapters[i]?.html ?? ''
    }

    async extractChapterStyles(): Promise<string[]> { return [] }
    unloadChapter() {}

    async search(keyword: string): Promise<SearchResult[]> {
        const results: SearchResult[] = []
        const lk = keyword.toLowerCase()
        for (let i = 0; i < this.chapters.length; i++) {
            const plain = stripTags(this.chapters[i].html).toLowerCase()
            let pos = plain.indexOf(lk)
            while (pos !== -1) {
                const start = Math.max(0, pos - 20)
                const end = Math.min(plain.length, pos + keyword.length + 20)
                results.push({ cfi: `bdise:${i}:0`, excerpt: stripTags(this.chapters[i].html).slice(start, end) })
                pos = plain.indexOf(lk, pos + 1)
            }
        }
        return results
    }
}

function stripTags(html: string): string {
    return html.replace(/<[^>]+>/g, '')
}

export async function parseHtmlMetadata(data: ArrayBuffer, filename: string) {
    let text: string
    try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(data)
    } catch {
        text = new TextDecoder('gbk').decode(data)
    }
    const titleMatch = text.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
    const title = titleMatch ? stripTags(titleMatch[1]).trim() : filename.replace(/\.(htm|html|xhtml)$/i, '')
    return { title: title || filename, author: '未知作者' }
}
