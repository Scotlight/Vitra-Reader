import { describe, expect, it, vi } from 'vitest'
import { buildScrollChapterVectorConfig, fetchAndPreprocessChapter } from '../components/Reader/scrollChapterFetch'

describe('scrollChapterFetch', () => {
    it('构建章节预处理向量配置', () => {
        expect(buildScrollChapterVectorConfig({
            fontSize: 16,
            lineHeight: 1.6,
            pageWidth: 900,
            paragraphSpacing: 12,
        })).toEqual({
            targetChars: 16_000,
            fontSize: 16,
            lineHeight: 1.6,
            pageWidth: 900,
            paragraphSpacing: 12,
        })
    })

    it('抓取正文、样式并调用预处理', async () => {
        const preprocess = vi.fn().mockResolvedValue({
            htmlContent: '<p>done</p>',
            htmlFragments: [],
            externalStyles: ['p{}'],
            removedTagCount: 0,
            removedAttributeCount: 0,
            usedFallback: false,
            stylesScoped: true,
            segmentMetas: [],
        })

        const result = await fetchAndPreprocessChapter({
            chapterId: 'ch-1',
            chapterHref: 'chapter-1.xhtml',
            provider: {
                extractChapterHtml: vi.fn().mockResolvedValue('<p>body</p>'),
                extractChapterStyles: vi.fn().mockResolvedValue(['p{}']),
            },
            readerStyles: {
                fontSize: 16,
                lineHeight: 1.6,
                pageWidth: 900,
                paragraphSpacing: 12,
            },
            spineIndex: 1,
            preprocess,
        })

        expect(preprocess).toHaveBeenCalledWith(expect.objectContaining({
            chapterId: 'ch-1',
            chapterHref: 'chapter-1.xhtml',
            htmlContent: '<p>body</p>',
            externalStyles: ['p{}'],
            vectorize: true,
        }))
        expect(result.htmlContent).toBe('<p>done</p>')
    })

    it('样式抓取失败时用空数组继续预处理', async () => {
        const preprocess = vi.fn().mockResolvedValue({
            htmlContent: '',
            htmlFragments: [],
            externalStyles: [],
            removedTagCount: 0,
            removedAttributeCount: 0,
            usedFallback: false,
            stylesScoped: true,
        })

        await fetchAndPreprocessChapter({
            chapterId: 'ch-2',
            provider: {
                extractChapterHtml: vi.fn().mockResolvedValue('<p>body</p>'),
                extractChapterStyles: vi.fn().mockRejectedValue(new Error('style failed')),
            },
            readerStyles: {
                fontSize: 16,
                lineHeight: 1.6,
                pageWidth: 900,
                paragraphSpacing: 12,
            },
            spineIndex: 2,
            preprocess,
        })

        expect(preprocess).toHaveBeenCalledWith(expect.objectContaining({
            externalStyles: [],
        }))
    })

    it('非向量化调用时不注入 vectorConfig', async () => {
        const preprocess = vi.fn().mockResolvedValue({
            htmlContent: '<p>done</p>',
            htmlFragments: [],
            externalStyles: [],
            removedTagCount: 0,
            removedAttributeCount: 0,
            usedFallback: false,
            stylesScoped: true,
        })

        await fetchAndPreprocessChapter({
            chapterId: 'pch-1',
            provider: {
                extractChapterHtml: vi.fn().mockResolvedValue('<p>body</p>'),
                extractChapterStyles: vi.fn().mockResolvedValue([]),
            },
            readerStyles: {
                fontSize: 18,
                lineHeight: 1.8,
                pageWidth: 880,
                paragraphSpacing: 10,
            },
            spineIndex: 0,
            preprocess,
            vectorize: false,
        })

        expect(preprocess).toHaveBeenCalledWith(expect.objectContaining({
            vectorize: false,
            vectorConfig: undefined,
        }))
    })
})
