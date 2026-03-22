import { describe, expect, it } from 'vitest'
import { preprocessChapterCore } from '../engine/render/chapterPreprocessCore'

describe('chapterPreprocessCore', () => {
    it('大章节向量化后不再同时返回三份 HTML 载荷', () => {
        const repeatedParagraph = '<p>这是用于压力测试的大章节内容。</p>'
        const htmlContent = repeatedParagraph.repeat(30_000)

        const result = preprocessChapterCore({
            chapterId: 'chapter-1',
            spineIndex: 0,
            htmlContent,
            externalStyles: [],
            vectorize: true,
            vectorConfig: {
                targetChars: 4_000,
                fontSize: 16,
                pageWidth: 900,
                lineHeight: 1.6,
                paragraphSpacing: 12,
            },
        })

        expect(result.segmentMetas?.length ?? 0).toBeGreaterThan(1)
        expect(result.htmlContent).toBe('')
        expect(result.htmlFragments).toEqual([])
        expect(result.segmentMetas?.every((segment) => segment.htmlContent.length > 0)).toBe(true)
    })
})
