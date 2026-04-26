import { describe, expect, it } from 'vitest'
import { searchPlainChapterTexts, stripHtmlTags } from '@/engine/parsers/providers/chapterSearch'

describe('chapterSearch', () => {
    it('去除 HTML 标签并保留纯文本顺序', () => {
        expect(stripHtmlTags('<h1>标题</h1><p>正文</p>')).toBe('标题正文')
    })

    it('按章节纯文本生成搜索结果', () => {
        const chapters = ['第一章 开头内容', '第二章 命中关键字 以及更多内容']
        const results = searchPlainChapterTexts('关键字', chapters.length, (index) => chapters[index])

        expect(results).toHaveLength(1)
        expect(results[0]).toEqual({
            cfi: 'vitra:1:0',
            excerpt: '第二章 命中关键字 以及更多内容',
        })
    })

    it('忽略空关键词并返回空结果', () => {
        const results = searchPlainChapterTexts('   ', 1, () => '正文')
        expect(results).toEqual([])
    })
})
