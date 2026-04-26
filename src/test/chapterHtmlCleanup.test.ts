import { describe, expect, it } from 'vitest'
import {
    cleanChapterHtmlForFormat,
    trimChapterEdgeWhitespace,
} from '@/engine/render/chapterHtmlCleanup'

describe('chapterHtmlCleanup', () => {
    it('清理章节首尾空白块并保留正文中间空行', () => {
        const html = [
            '\n  ',
            '<p>&nbsp;</p>',
            '<div> </div>',
            '<br>',
            '<h1>第一章</h1>',
            '<p>第一段</p>',
            '<p>&nbsp;</p>',
            '<p>第二段</p>',
            '<blockquote> </blockquote>',
            '<br>',
            '\n',
        ].join('')

        const cleaned = trimChapterEdgeWhitespace(html)

        expect(cleaned).toMatch(/^<h1>第一章<\/h1>/)
        expect(cleaned).toContain('<p></p>')
        expect(cleaned).toContain('<p>第二段</p>')
        expect(cleaned).not.toMatch(/(<p>(&nbsp;|\s)*<\/p>|<div>\s*<\/div>|<br>)$/)
    })

    it('保留图片章节与边缘锚点', () => {
        const html = [
            '<div id="cover-anchor"></div>',
            '<p><span><img src="blob:cover"></span></p>',
            '<p>&nbsp;</p>',
        ].join('')

        const cleaned = trimChapterEdgeWhitespace(html)

        expect(cleaned).toContain('id="cover-anchor"')
        expect(cleaned).toContain('<img src="blob:cover">')
        expect(cleaned).not.toMatch(/<p>(&nbsp;|\s)*<\/p>$/)
    })

    it('PDF 保持原始页面结构不变', () => {
        const html = '<div></div><div style="position:absolute"></div>'

        expect(cleanChapterHtmlForFormat(html, 'PDF')).toBe(html)
    })
})
