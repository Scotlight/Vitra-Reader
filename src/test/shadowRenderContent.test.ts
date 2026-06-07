import { afterEach, describe, expect, it, vi } from 'vitest'
import {
    appendRenderedContent,
    createChapterWrapper,
    createFlowRootDiv,
} from '@/components/Reader/shadowRenderer/renderContent'
import type { ChapterVectorSegment } from '@/components/Reader/shadowRenderer/shadowRendererTypes'

function createVectorSegment(index: number, estimatedHeight = 140): ChapterVectorSegment {
    const paragraph = document.createElement('p')
    paragraph.textContent = `segment-${index}`
    return {
        index,
        nodes: [paragraph],
        charCount: 20,
        estimatedHeight,
    }
}

describe('shadow renderContent', () => {
    afterEach(() => {
        document.body.innerHTML = ''
        vi.restoreAllMocks()
    })

    it('创建章节 wrapper 与 flow-root 内容容器', () => {
        const wrapper = createChapterWrapper('ch-1')
        const content = createFlowRootDiv()

        expect(wrapper.getAttribute('data-chapter-id')).toBe('ch-1')
        expect(wrapper.className).toBe('chapter-content')
        expect(wrapper.style.display).toBe('flow-root')
        expect(content.style.display).toBe('flow-root')
    })

    it('向量化渲染时只实体化初始段并保留后续占位段', async () => {
        const content = document.createElement('div')
        const segments = [createVectorSegment(0), createVectorSegment(1)]

        const segmentEls = await appendRenderedContent(content, {
            canUseVectorized: true,
            vectorSegments: segments,
            initialSegmentCount: 1,
            normalizedFragments: [],
            isLargeChapter: true,
            sanitizedHtml: '',
        })

        expect(segmentEls).toHaveLength(2)
        expect(content.querySelectorAll('[data-shadow-segment-index]')).toHaveLength(2)
        expect(segmentEls[0]!.getAttribute('data-shadow-segment-state')).toBe('hydrated')
        expect(segmentEls[0]!.innerHTML).toContain('segment-0')
        expect(segmentEls[1]!.getAttribute('data-shadow-segment-state')).toBe('placeholder')
        expect(segmentEls[1]!.innerHTML).toBe('')
    })

    it('普通小章节直接写入已消毒 HTML', async () => {
        const content = document.createElement('div')

        const segmentEls = await appendRenderedContent(content, {
            canUseVectorized: false,
            vectorSegments: [],
            initialSegmentCount: 0,
            normalizedFragments: [],
            isLargeChapter: false,
            sanitizedHtml: '<p>clean</p>',
        })

        expect(segmentEls).toEqual([])
        expect(content.innerHTML).toBe('<p>clean</p>')
    })

    it('多 fragment 章节按顺序追加内容', async () => {
        const content = document.createElement('div')

        await appendRenderedContent(content, {
            canUseVectorized: false,
            vectorSegments: [],
            initialSegmentCount: 0,
            normalizedFragments: ['<p>one</p>', '<p>two</p>'],
            isLargeChapter: false,
            sanitizedHtml: '',
        })

        expect(content.textContent).toBe('onetwo')
    })

    it('大章节走分块追加路径并避免直接 innerHTML 一次性写入', async () => {
        vi.useFakeTimers()
        const content = document.createElement('div')
        const promise = appendRenderedContent(content, {
            canUseVectorized: false,
            vectorSegments: [],
            initialSegmentCount: 0,
            normalizedFragments: [],
            isLargeChapter: true,
            sanitizedHtml: '<p>large</p>',
        })

        await vi.runAllTimersAsync()
        await promise
        vi.useRealTimers()

        expect(content.textContent).toBe('large')
    })
})
