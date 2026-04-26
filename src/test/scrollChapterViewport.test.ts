import { describe, expect, it } from 'vitest'
import {
    findAncestorChapterSpineIndex,
    findChapterAtViewportOffset,
    parseChapterSpineIndex,
    resolveViewportChapterState,
    resolveViewportChapterProgress,
} from '@/components/Reader/scrollChapterViewport'

describe('scrollChapterViewport', () => {
    it('正确解析章节 data 属性里的 spineIndex', () => {
        expect(parseChapterSpineIndex('ch-12')).toBe(12)
        expect(parseChapterSpineIndex('chapter-12')).toBeNull()
        expect(parseChapterSpineIndex(null)).toBeNull()
    })

    it('沿 DOM 父链回溯章节 spineIndex', () => {
        const chapterEl = document.createElement('div')
        chapterEl.setAttribute('data-chapter-id', 'ch-7')
        const paragraph = document.createElement('p')
        const text = document.createTextNode('hello')
        paragraph.appendChild(text)
        chapterEl.appendChild(paragraph)

        expect(findAncestorChapterSpineIndex(text, document.body)).toBe(7)
        expect(findAncestorChapterSpineIndex(text, chapterEl)).toBe(-1)
    })

    it('根据视口偏移匹配章节', () => {
        const matched = findChapterAtViewportOffset([
            { spineIndex: 0, top: 0, bottom: 300 },
            { spineIndex: 1, top: 300, bottom: 600 },
        ], 450)

        expect(matched?.spineIndex).toBe(1)
    })

    it('根据视口中心计算整本书进度', () => {
        const resolved = resolveViewportChapterProgress([
            { spineIndex: 0, top: 0, bottom: 400 },
            { spineIndex: 1, top: 400, bottom: 800 },
        ], 600, 4)

        expect(resolved).toEqual({
            spineIndex: 1,
            progress: 0.375,
        })
    })

    it('未命中章节时返回空值', () => {
        const resolved = resolveViewportChapterProgress([
            { spineIndex: 0, top: 0, bottom: 400 },
        ], 999, 3)

        expect(resolved).toBeNull()
    })

    it('一次返回当前章节和进度状态', () => {
        const resolved = resolveViewportChapterState([
            { spineIndex: 0, top: 0, bottom: 400 },
            { spineIndex: 1, top: 400, bottom: 800 },
        ], 120, 600, 4)

        expect(resolved).toEqual({
            currentChapter: {
                spineIndex: 0,
                top: 0,
                bottom: 400,
            },
            progress: {
                spineIndex: 1,
                progress: 0.375,
            },
        })
    })
})
