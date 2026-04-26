import type { ContentProvider, TocItem, SpineItemInfo, SearchResult } from '@/engine/core/contentProvider'
import { stripBookExtension } from '@/engine/core/contentProvider'
import { VitraSectionSplitter } from '@/engine/core/vitraSectionSplitter'
import { decodeTextBuffer } from './textDecoding'
import { EMPTY_SECTION_HTML, DEFAULT_DOCUMENT_LABEL } from '@/engine/render/chapterTitleDetector'
import { escapeHtml } from '@/engine/core/contentSanitizer'
import { searchPlainChapterTexts, stripHtmlTags } from './chapterSearch'

interface Chapter {
    title: string
    html: string
    plain: string
}

export class Fb2ContentProvider implements ContentProvider {
    private chapters: Chapter[] = []

    constructor(private data: ArrayBuffer) {}

    async init() {
        const text = decodeTextBuffer(this.data, 'fb2').text

        const parser = new DOMParser()
        const doc = parser.parseFromString(text, 'application/xml')
        const body = doc.querySelector('body')
        const fullHtml = fb2NodeToHtml(body ?? doc.documentElement)
        const chunks = VitraSectionSplitter.split(fullHtml)
        this.chapters = chunks.map((chunk, index) => ({
            title: chunk.label || `第 ${index + 1} 章`,
            html: chunk.html || EMPTY_SECTION_HTML,
            plain: stripHtmlTags(chunk.html || ''),
        }))

        if (this.chapters.length === 0) {
            this.chapters = [{ title: DEFAULT_DOCUMENT_LABEL, html: EMPTY_SECTION_HTML, plain: '' }]
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
        return searchPlainChapterTexts(keyword, this.chapters.length, (index) => this.chapters[index].plain)
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
            const safeHref = href.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            return `<img src="${safeHref}" style="max-width:100%"/>`
        }
        default:           return inner
    }
}


export async function parseFb2Metadata(data: ArrayBuffer, filename: string) {
    const text = decodeTextBuffer(data, 'fb2').text
    const titleMatch = text.match(/<book-title[^>]*>([\s\S]*?)<\/book-title>/i)
    const firstMatch = text.match(/<first-name[^>]*>([\s\S]*?)<\/first-name>/i)
    const lastMatch = text.match(/<last-name[^>]*>([\s\S]*?)<\/last-name>/i)
    const title = titleMatch?.[1]?.trim() || stripBookExtension(filename)
    const author = [firstMatch?.[1]?.trim(), lastMatch?.[1]?.trim()].filter(Boolean).join(' ') || '未知作者'
    return { title, author }
}
