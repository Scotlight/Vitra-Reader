import { describe, expect, it } from 'vitest'
import {
    filterRenderableMobiChapters,
    renderMobiChapters,
} from '@/engine/parsers/providers/mobiHtmlRenderer'

describe('renderMobiChapters', () => {
    it('按标题切分时保留标题节点和章节标签', () => {
        const chapters = renderMobiChapters({
            content: '<h1>第一章</h1><p>甲</p><h2>第二章</h2><p>乙</p>',
        })

        expect(chapters).toHaveLength(2)
        expect(chapters[0].label).toBe('第一章')
        expect(chapters[0].html).toContain('<h1>第一章</h1>')
        expect(chapters[1].label).toBe('第二章')
        expect(chapters[1].plainText).toBe('第二章 乙')
    })

    it('按 MOBI pagebreak 切分并移除原始 pagebreak 标签', () => {
        const chapters = renderMobiChapters({
            content: '<p>第一页</p><mbp:pagebreak/><p>第二页</p>',
        })

        expect(chapters).toHaveLength(2)
        expect(chapters[0].plainText).toBe('第一页')
        expect(chapters[1].plainText).toBe('第二页')
        expect(chapters.map((chapter) => chapter.html).join('')).not.toContain('mbp:pagebreak')
    })

    it('移除转义后的 MOBI 私有 pagebreak 标签，避免正文显示原始标签', () => {
        const chapters = renderMobiChapters({
            content: '<p>第一页</p>&lt;mbp:pagebreak/&gt;<p>第二页</p>',
        })

        const html = chapters.map((chapter) => chapter.html).join('')
        expect(chapters).toHaveLength(2)
        expect(html).not.toContain('mbp:pagebreak')
        expect(html).toContain('第一页')
        expect(html).toContain('第二页')
    })

    it('提取 style 并把 recindex 图片重写为资源 URL', () => {
        const chapters = renderMobiChapters({
            content: '<style>.cover{width:100%}</style><p><img recindex="0" /></p>',
            resources: [{
                recordIndex: 12,
                relativeIndex: 0,
                mime: 'image/png',
                url: 'blob:mobi-image',
            }],
        })

        expect(chapters).toHaveLength(1)
        expect(chapters[0].styles).toEqual(['.cover{width:100%}'])
        expect(chapters[0].html).toContain('src="blob:mobi-image"')
        expect(chapters[0].html).not.toContain('recindex')
    })

    it('空内容返回占位章节', () => {
        const chapters = renderMobiChapters({ content: '' })

        expect(chapters).toHaveLength(1)
        expect(chapters[0].label).toBe('正文')
        expect(chapters[0].plainText).toContain('空章节')
    })

    it('过滤不可阅读空章节但保留图片章节', () => {
        const chapters = [
            ...renderMobiChapters({ content: '' }),
            ...renderMobiChapters({ content: '<p><img src="blob:cover" /></p>' }),
            ...renderMobiChapters({ content: '<h1>第一章</h1><p>正文</p>' }),
        ]

        const filtered = filterRenderableMobiChapters(chapters)

        expect(filtered).toHaveLength(2)
        expect(filtered[0].html).toContain('<img')
        expect(filtered[1].label).toBe('第一章')
    })

    it('清理章节首尾空段落，保留正文中间空行', () => {
        const chapters = renderMobiChapters({
            content: [
                '<p>&nbsp;</p>',
                '<br>',
                '<h1>第一章</h1>',
                '<p>第一段</p>',
                '<p>&nbsp;</p>',
                '<p>第二段</p>',
                '<p>&nbsp;</p>',
                '<div> </div>',
                '<br>',
            ].join(''),
        })

        expect(chapters).toHaveLength(1)
        expect(chapters[0].html).toMatch(/^<h1>第一章<\/h1>/)
        expect(chapters[0].html).toContain('<p></p>')
        expect(chapters[0].html).toContain('<p>第二段</p>')
        expect(chapters[0].html).not.toMatch(/(<p>(&nbsp;|\s)*<\/p>|<div>\s*<\/div>|<br>)$/)
    })
})
