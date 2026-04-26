import { describe, expect, it } from 'vitest'
import { VitraContentAdapter } from '@/engine/pipeline/vitraContentAdapter'
import { VitraTxtParser } from '@/engine/parsers/vitraProviderParsers'
import type {
    VitraBook,
    VitraBookFormat,
    VitraBookSection,
} from '@/engine/types/vitraBook'

function toArrayBuffer(text: string): ArrayBuffer {
    const bytes = new TextEncoder().encode(text)
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
}

function createBook(format: VitraBookFormat, html: string): VitraBook {
    const section: VitraBookSection = {
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

describe('Vitra 章节清洗集成', () => {
    it('TXT 经 pipeline section 加载后会清理章节首尾空白', async () => {
        const parser = new VitraTxtParser(toArrayBuffer('\n\n第一章\n正文\n\n'), 'blank.txt')
        const book = await parser.parse()

        const html = await book.sections[0].load()

        expect(html).toMatch(/^<p>第一章<\/p>/)
        expect(html).toContain('<p>正文</p>')
        expect(html).not.toMatch(/^(\s|<br\s*\/?>)/)
        expect(html).not.toMatch(/<br\s*\/?>\s*$/)
    })

    it('adapter 对非 PDF 章节做兜底清洗', async () => {
        const adapter = new VitraContentAdapter(
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
        const adapter = new VitraContentAdapter(
            createBook('PDF', rawHtml),
            'cleanup-pdf',
            new ArrayBuffer(0),
        )

        const html = await adapter.extractChapterHtml(0)
        adapter.unloadChapter(0)

        expect(html).toBe(rawHtml)
    })
})
