import { describe, expect, it } from 'vitest'
import { preprocessChapterCore, vectorizeHtmlToSegmentMetas } from '@/engine/render/chapterPreprocessCore'

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

    it('流式向量化不会把切点之后的媒体标记污染到前一段', () => {
        const html = `${'<p>alpha</p>'.repeat(600)}<img src="cover.jpg">${'<p>omega</p>'.repeat(600)}`
        const segments = vectorizeHtmlToSegmentMetas(html, {
            targetChars: 4_000,
            fontSize: 16,
            pageWidth: 900,
            lineHeight: 1.6,
            paragraphSpacing: 12,
        })

        expect(segments.length).toBeGreaterThan(1)
        expect(segments.some((segment) => segment.hasMedia)).toBe(true)
        const firstMediaIndex = segments.findIndex((segment) => segment.hasMedia)
        expect(firstMediaIndex).toBeGreaterThan(0)
        expect(segments.slice(0, firstMediaIndex).every((segment) => !segment.hasMedia)).toBe(true)
    })

    it('单段回退时保留原始 html 载荷，避免大章节空白', () => {
        const htmlContent = `<p>${'x'.repeat(500_000)}</p>`

        const result = preprocessChapterCore({
            chapterId: 'chapter-2',
            spineIndex: 1,
            htmlContent,
            externalStyles: [],
            vectorize: true,
            vectorConfig: {
                targetChars: 16_000,
                fontSize: 16,
                pageWidth: 900,
                lineHeight: 1.6,
                paragraphSpacing: 12,
            },
        })

        expect(result.segmentMetas?.length).toBe(1)
        expect(result.htmlContent).toBe(htmlContent)
        expect(result.htmlFragments.length).toBeGreaterThan(0)
    })
})
