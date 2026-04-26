import { describe, expect, it } from 'vitest'
import {
    buildFlatChapterHref,
    buildFlatChapterSpineItems,
    buildFlatChapterToc,
    parseFlatChapterHrefIndex,
} from '@/engine/parsers/providers/flatChapterProvider'

describe('flatChapterProvider', () => {
    it('生成统一的 flat chapter href', () => {
        expect(buildFlatChapterHref(3)).toBe('ch-3')
    })

    it('从 href 解析章节索引', () => {
        expect(parseFlatChapterHrefIndex('ch-12')).toBe(12)
        expect(parseFlatChapterHrefIndex('chapter-12')).toBe(-1)
    })

    it('生成平铺章节 toc 与 spine', () => {
        const chapters = [{ title: '第一章' }, { title: '第二章' }]

        expect(buildFlatChapterToc(chapters)).toEqual([
            { id: 'ch-0', href: 'ch-0', label: '第一章' },
            { id: 'ch-1', href: 'ch-1', label: '第二章' },
        ])

        expect(buildFlatChapterSpineItems(chapters.length)).toEqual([
            { index: 0, href: 'ch-0', id: 'ch-0', linear: true },
            { index: 1, href: 'ch-1', id: 'ch-1', linear: true },
        ])
    })
})
