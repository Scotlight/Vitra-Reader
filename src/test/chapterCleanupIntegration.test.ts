import { describe, expect, it } from 'vitest'
import { BookContentAdapter } from '@/engine/pipeline/contentAdapter'
import { TxtParser } from '@/engine/parsers/providerParsers'
import type {
    ParsedBook,
    EngineBookFormat,
    BookSection,
} from '@/engine/types/book'

function toArrayBuffer(text: string): ArrayBuffer {
    const bytes = new TextEncoder().encode(text)
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
}

function createBook(format: EngineBookFormat, html: string): ParsedBook {
    const section: BookSection = {
        id: 'section-0',
        href: 'section-0',
        linear: true,
        size: html.length,
        load: async () => html,
        unload: () => {},
    }

    return {
        format,
        metadata: { title: '测试书籍', author: ['未知作者'], cover: null },
        sections: [section],
        toc: [{ label: '正文', href: 'section-0', children: [] }],
        layout: 'reflowable',
        direction: 'auto',
        resolveHref: (href) => (href === 'section-0' ? { index: 0 } : null),
        getCover: async () => null,
        destroy: () => {},
        search: () => [],
    }
}

describe('章节清洗集成', () => {
    it('TXT 经 pipeline section 加载后会清理章节首尾空白', async () => {
        const parser = new TxtParser(toArrayBuffer('\n\n第一章\n正文\n\n'), 'blank.txt')
        const book = await parser.parse()

        const html = await book.sections[0].load()

        expect(html).toMatch(/^<p>第一章<\/p>/)
        expect(html).toContain('<p>正文</p>')
        expect(html).not.toMatch(/^(\s|<br\s*\/?>)/)
        expect(html).not.toMatch(/<br\s*\/?>\s*$/)
    })

    it('adapter 对非 PDF 章节做兜底清洗', async () => {
        const adapter = new BookContentAdapter(
            createBook('HTML', '<p>&nbsp;</p><p>正文</p><br>'),
            'cleanup-html',
            new ArrayBuffer(0),
        )

        const html = await adapter.extractChapterHtml(0)
        adapter.unloadChapter(0)

        expect(html).toBe('<p>正文</p>')
    })

    it('adapter 不清洗 PDF 页面结构', async () => {
        const rawHtml = '<div></div><div style="position:absolute"></div>'
        const adapter = new BookContentAdapter(
            createBook('PDF', rawHtml),
            'cleanup-pdf',
            new ArrayBuffer(0),
        )

        const html = await adapter.extractChapterHtml(0)
        adapter.unloadChapter(0)

        expect(html).toBe(rawHtml)
    })
})
