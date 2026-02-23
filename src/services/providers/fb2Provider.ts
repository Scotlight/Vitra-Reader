import type { ContentProvider, TocItem, SpineItemInfo, SearchResult } from '../contentProvider'

interface Chapter {
    title: string
    html: string
}

export class Fb2ContentProvider implements ContentProvider {
    private chapters: Chapter[] = []

    constructor(private data: ArrayBuffer) {}

    async init() {
        let text: string
        try {
            text = new TextDecoder('utf-8', { fatal: true }).decode(this.data)
        } catch {
            text = new TextDecoder('windows-1251').decode(this.data)
        }

        const parser = new DOMParser()
        const doc = parser.parseFromString(text, 'application/xml')

        // 取所有 <section> 作为章节
        const sections = Array.from(doc.querySelectorAll('body > section, body section'))
        if (sections.length === 0) {
            // 没有 section，整个 body 作为一章
            const body = doc.querySelector('body')
            this.chapters = [{ title: '正文', html: fb2NodeToHtml(body ?? doc.documentElement) }]
            return
        }

        for (const sec of sections) {
            const titleEl = sec.querySelector(':scope > title')
            const label = titleEl ? titleEl.textContent?.trim() || '章节' : '章节'
            // 转换 section 内容为 HTML，跳过 <title>（已作为章名）
            let html = ''
            for (const child of Array.from(sec.childNodes)) {
                if (child === titleEl) continue
                html += fb2NodeToHtml(child)
            }
            this.chapters.push({ title: label, html: html || '<p>(空章节)</p>' })
        }

        if (this.chapters.length === 0) {
            this.chapters = [{ title: '正文', html: '<p>(无内容)</p>' }]
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
            const plain = this.chapters[i].html.replace(/<[^>]+>/g, '').toLowerCase()
            let pos = plain.indexOf(lk)
            while (pos !== -1) {
                const start = Math.max(0, pos - 20)
                const end = Math.min(plain.length, pos + keyword.length + 20)
                const raw = this.chapters[i].html.replace(/<[^>]+>/g, '')
                results.push({ cfi: `bdise:${i}:0`, excerpt: raw.slice(start, end) })
                pos = plain.indexOf(lk, pos + 1)
            }
        }
        return results
    }
}

/** 将 FB2 XML 节点递归转换为 HTML 字符串 */
function fb2NodeToHtml(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) {
        return escapeHtml(node.textContent ?? '')
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return ''
    const el = node as Element
    const tag = el.localName.toLowerCase()
    const inner = Array.from(el.childNodes).map(fb2NodeToHtml).join('')

    switch (tag) {
        case 'p':          return `<p>${inner}</p>`
        case 'emphasis':   return `<em>${inner}</em>`
        case 'strong':     return `<strong>${inner}</strong>`
        case 'strikethrough': return `<s>${inner}</s>`
        case 'sup':        return `<sup>${inner}</sup>`
        case 'sub':        return `<sub>${inner}</sub>`
        case 'code':       return `<code>${inner}</code>`
        case 'v':          return `<p class="verse">${inner}</p>`
        case 'stanza':     return `<div class="stanza">${inner}</div>`
        case 'poem':       return `<blockquote>${inner}</blockquote>`
        case 'cite':       return `<blockquote>${inner}</blockquote>`
        case 'epigraph':   return `<blockquote><em>${inner}</em></blockquote>`
        case 'title':      return `<h3>${inner}</h3>`
        case 'subtitle':   return `<h4>${inner}</h4>`
        case 'section':    return inner
        case 'empty-line': return `<br/>`
        case 'image': {
            const href = el.getAttribute('l:href') ?? el.getAttribute('xlink:href') ?? ''
            // 内嵌 base64 图片：#id 格式指向 <binary> 元素
            if (href.startsWith('#')) return `<span>[图片]</span>`
            return `<img src="${href}" style="max-width:100%"/>`
        }
        default:           return inner
    }
}

function escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export async function parseFb2Metadata(data: ArrayBuffer, filename: string) {
    let text: string
    try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(data)
    } catch {
        text = new TextDecoder('windows-1251').decode(data)
    }
    const titleMatch = text.match(/<book-title[^>]*>([\s\S]*?)<\/book-title>/i)
    const firstMatch = text.match(/<first-name[^>]*>([\s\S]*?)<\/first-name>/i)
    const lastMatch = text.match(/<last-name[^>]*>([\s\S]*?)<\/last-name>/i)
    const title = titleMatch?.[1]?.trim() || filename.replace(/\.fb2$/i, '')
    const author = [firstMatch?.[1]?.trim(), lastMatch?.[1]?.trim()].filter(Boolean).join(' ') || '未知作者'
    return { title, author }
}
