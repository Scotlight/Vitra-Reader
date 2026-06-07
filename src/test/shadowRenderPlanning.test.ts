import { describe, expect, it } from 'vitest'
import {
    buildHydrateAssetLoadOptions,
    buildRenderAssetLoadOptions,
    buildVectorSegments,
    resolveChapterRenderTraits,
} from '@/components/Reader/shadowRenderer/renderPlanning'
import {
    HYDRATE_MEDIA_LOAD_TIMEOUT_MS,
    HYDRATE_MEDIA_MAX_TRACKED_IMAGES,
    LARGE_CHAPTER_HTML_THRESHOLD,
    MEDIA_SENSITIVE_LOAD_TIMEOUT_MS,
    MEDIA_SENSITIVE_MAX_TRACKED_IMAGES,
    RENDER_LARGE_CHAPTER_LOAD_TIMEOUT_MS,
    RENDER_LARGE_MAX_TRACKED_IMAGES,
    RENDER_NORMAL_MAX_TRACKED_IMAGES,
    RENDER_VECTORIZED_LOAD_TIMEOUT_MS,
    RENDER_VECTORIZED_MAX_TRACKED_IMAGES,
} from '@/components/Reader/shadowRenderer/shadowRendererConstants'
import type { SegmentMeta } from '@/engine/types/vectorRender'

const readerStyles = {
    fontSize: 16,
    pageWidth: 800,
    lineHeight: 1.6,
    paragraphSpacing: 1,
    textIndentEm: 0,
    letterSpacing: 0,
    textAlign: 'left',
    fontFamily: 'serif',
    textColor: '#000',
    bgColor: '#fff',
    isPdfDarkMode: false,
}

function createSegmentMeta(index: number, charCount: number, htmlContent = '<p>segment</p>'): SegmentMeta {
    return {
        index,
        charCount,
        estimatedHeight: 120,
        realHeight: null,
        offsetY: index * 120,
        measured: false,
        htmlContent,
        hasMedia: false,
    }
}

describe('shadow renderPlanning', () => {
    it('按章节特征生成渲染阶段资源加载参数', () => {
        const resourceExists = () => true

        expect(buildRenderAssetLoadOptions({
            cleanedHtmlLength: 100,
            mediaSensitiveChapter: true,
            canUseVectorized: false,
            isLargeChapter: false,
            resourceExists,
        })).toMatchObject({
            chapterSizeHint: 100,
            timeoutMs: MEDIA_SENSITIVE_LOAD_TIMEOUT_MS,
            maxTrackedImages: MEDIA_SENSITIVE_MAX_TRACKED_IMAGES,
            largeChapterThreshold: Number.POSITIVE_INFINITY,
            resourceExists,
        })

        expect(buildRenderAssetLoadOptions({
            cleanedHtmlLength: 100,
            mediaSensitiveChapter: false,
            canUseVectorized: true,
            isLargeChapter: true,
        })).toMatchObject({
            timeoutMs: RENDER_VECTORIZED_LOAD_TIMEOUT_MS,
            maxTrackedImages: RENDER_VECTORIZED_MAX_TRACKED_IMAGES,
            largeChapterThreshold: LARGE_CHAPTER_HTML_THRESHOLD,
        })

        expect(buildRenderAssetLoadOptions({
            cleanedHtmlLength: 100,
            mediaSensitiveChapter: false,
            canUseVectorized: false,
            isLargeChapter: true,
        })).toMatchObject({
            timeoutMs: RENDER_LARGE_CHAPTER_LOAD_TIMEOUT_MS,
            maxTrackedImages: RENDER_LARGE_MAX_TRACKED_IMAGES,
        })

        expect(buildRenderAssetLoadOptions({
            cleanedHtmlLength: 100,
            mediaSensitiveChapter: false,
            canUseVectorized: false,
            isLargeChapter: false,
        })).toMatchObject({
            timeoutMs: undefined,
            maxTrackedImages: RENDER_NORMAL_MAX_TRACKED_IMAGES,
        })
    })

    it('生成 hydrate 阶段资源加载参数', () => {
        const segment = {
            index: 0,
            nodes: [],
            charCount: 320,
            estimatedHeight: 120,
        }
        const resourceExists = () => false

        expect(buildHydrateAssetLoadOptions(segment, resourceExists)).toMatchObject({
            chapterSizeHint: 320,
            timeoutMs: HYDRATE_MEDIA_LOAD_TIMEOUT_MS,
            maxTrackedImages: HYDRATE_MEDIA_MAX_TRACKED_IMAGES,
            largeChapterThreshold: LARGE_CHAPTER_HTML_THRESHOLD,
            resourceExists,
        })
    })

    it('从清洗后 HTML 或 SegmentMeta 解析章节大小和媒体敏感性', () => {
        expect(resolveChapterRenderTraits('<p>text</p><img src="a.png">')).toMatchObject({
            chapterSize: '<p>text</p><img src="a.png">'.length,
            isLargeChapter: false,
            mediaSensitiveChapter: true,
        })

        const metas = [
            { ...createSegmentMeta(0, 150), hasMedia: false },
            { ...createSegmentMeta(1, 200), hasMedia: true },
        ]

        expect(resolveChapterRenderTraits('', metas)).toMatchObject({
            chapterSize: 350,
            isLargeChapter: false,
            mediaSensitiveChapter: true,
        })
    })

    it('仅滚动模式大章节会生成向量段，并优先使用 Worker SegmentMeta', () => {
        const metas = [
            createSegmentMeta(0, 100, '<p>a</p>'),
            createSegmentMeta(1, 120, '<p>b</p>'),
        ]

        expect(buildVectorSegments({
            mode: 'paginated',
            isLargeChapter: true,
            segmentMetas: metas,
            cleanedHtml: '',
            readerStyles,
        })).toEqual([])

        expect(buildVectorSegments({
            mode: 'scroll',
            isLargeChapter: false,
            segmentMetas: metas,
            cleanedHtml: '',
            readerStyles,
        })).toEqual([])

        expect(buildVectorSegments({
            mode: 'scroll',
            isLargeChapter: true,
            segmentMetas: metas,
            cleanedHtml: '',
            readerStyles,
        })).toEqual([
            {
                index: 0,
                nodes: [],
                charCount: 100,
                estimatedHeight: 120,
                _htmlContent: '<p>a</p>',
            },
            {
                index: 1,
                nodes: [],
                charCount: 120,
                estimatedHeight: 120,
                _htmlContent: '<p>b</p>',
            },
        ])
    })

    it('没有 Worker SegmentMeta 时回退到主线程 HTML 向量化', () => {
        const segments = buildVectorSegments({
            mode: 'scroll',
            isLargeChapter: true,
            cleanedHtml: '<p>alpha</p><p>beta</p>',
            readerStyles,
        })

        expect(segments.length).toBeGreaterThan(0)
        expect(segments[0]!.charCount).toBeGreaterThan(0)
        expect(segments[0]!.nodes.length).toBeGreaterThan(0)
    })
})
