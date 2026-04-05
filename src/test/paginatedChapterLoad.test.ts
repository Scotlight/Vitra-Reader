import { describe, expect, it } from 'vitest'
import {
    createPaginatedShadowData,
    hasRenderableChapterContent,
    resolvePaginatedFallbackIndex,
} from '../components/Reader/paginatedChapterLoad'

describe('paginatedChapterLoad', () => {
    it('识别可渲染的文本章节', () => {
        expect(hasRenderableChapterContent('<p>hello</p>')).toBe(true)
        expect(hasRenderableChapterContent('<div><img src="a.png"></div>')).toBe(true)
        expect(hasRenderableChapterContent('<style>p{}</style>   ')).toBe(false)
    })

    it('根据方向计算 fallback 章节索引', () => {
        expect(resolvePaginatedFallbackIndex(3, false, 10)).toBe(4)
        expect(resolvePaginatedFallbackIndex(3, true, 10)).toBe(2)
        expect(resolvePaginatedFallbackIndex(0, true, 10)).toBeNull()
    })

    it('装配分页 shadowData', () => {
        expect(createPaginatedShadowData('pch-1', {
            htmlContent: '<p>body</p>',
            htmlFragments: ['<p>body</p>'],
            externalStyles: ['p{}'],
        })).toEqual({
            chapterId: 'pch-1',
            htmlContent: '<p>body</p>',
            htmlFragments: ['<p>body</p>'],
            externalStyles: ['p{}'],
        })
    })
})
