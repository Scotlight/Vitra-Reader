import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { scrollMountedChapterIntoView } from '@/components/Reader/scrollReader/tocJumpMountedChapter'
import type { LoadedChapter } from '@/components/Reader/scrollReader/scrollReaderTypes'

function createMountedChapter(): LoadedChapter {
    return {
        spineIndex: 2,
        id: 'ch-2',
        htmlContent: '',
        htmlFragments: [],
        externalStyles: [],
        domNode: null,
        height: 300,
        status: 'mounted',
    }
}

describe('tocJumpMountedChapter', () => {
    beforeEach(() => {
        vi.stubGlobal('requestAnimationFrame', ((callback: FrameRequestCallback) => {
            callback(16)
            return 1
        }) as typeof requestAnimationFrame)
    })

    afterEach(() => {
        document.body.innerHTML = ''
        vi.unstubAllGlobals()
    })

    it('已挂载章节会立即滚动并在下一帧复位到章节顶部', () => {
        const listEl = document.createElement('div')
        const chapterEl = document.createElement('article')
        chapterEl.setAttribute('data-chapter-id', 'ch-2')
        Object.defineProperty(chapterEl, 'offsetTop', { configurable: true, value: 240 })
        listEl.appendChild(chapterEl)

        const viewport = document.createElement('div')
        Object.defineProperty(viewport, 'clientHeight', { configurable: true, value: 600 })
        const lastScrollTopRef = { current: 0 }
        const syncViewportState = vi.fn()

        scrollMountedChapterIntoView({
            listEl,
            viewport,
            targetSpineIndex: 2,
            existing: createMountedChapter(),
            generation: 3,
            jumpGenerationRef: { current: 3 },
            pendingSearchTextRef: { current: null },
            lastScrollTopRef,
            syncViewportState,
            materializeAllVirtualSegments: vi.fn(),
            forceHydrateSegment: vi.fn(),
        })

        expect(viewport.scrollTop).toBe(240)
        expect(lastScrollTopRef.current).toBe(240)
        expect(syncViewportState).toHaveBeenCalledTimes(2)
        expect(syncViewportState).toHaveBeenLastCalledWith(240, 600, { commitProgress: true })
    })

    it('下一帧代数过期时不再复位滚动位置', () => {
        const listEl = document.createElement('div')
        const chapterEl = document.createElement('article')
        chapterEl.setAttribute('data-chapter-id', 'ch-2')
        Object.defineProperty(chapterEl, 'offsetTop', { configurable: true, value: 120 })
        listEl.appendChild(chapterEl)

        const viewport = document.createElement('div')
        const syncViewportState = vi.fn()

        scrollMountedChapterIntoView({
            listEl,
            viewport,
            targetSpineIndex: 2,
            existing: createMountedChapter(),
            generation: 1,
            jumpGenerationRef: { current: 2 },
            pendingSearchTextRef: { current: null },
            lastScrollTopRef: { current: 0 },
            syncViewportState,
            materializeAllVirtualSegments: vi.fn(),
            forceHydrateSegment: vi.fn(),
        })

        expect(syncViewportState).toHaveBeenCalledTimes(1)
    })

    it('携带搜索文本时会实体化虚拟段、强制 hydrate 并滚动到文本位置', () => {
        const listEl = document.createElement('div')
        const chapterEl = document.createElement('article')
        chapterEl.setAttribute('data-chapter-id', 'ch-2')
        chapterEl.innerHTML = `
            <section data-shadow-segment-state="placeholder">before</section>
            <p>target text</p>
        `
        Object.defineProperty(chapterEl, 'offsetTop', { configurable: true, value: 100 })
        listEl.appendChild(chapterEl)

        const viewport = document.createElement('div')
        Object.defineProperty(viewport, 'clientHeight', { configurable: true, value: 500 })
        viewport.getBoundingClientRect = vi.fn(() => ({
            x: 0,
            y: 10,
            top: 10,
            left: 0,
            bottom: 510,
            right: 800,
            width: 800,
            height: 500,
            toJSON: () => undefined,
        } as DOMRect))
        const rangeRect = {
            x: 0,
            y: 40,
            top: 40,
            left: 0,
            bottom: 60,
            right: 100,
            width: 100,
            height: 20,
            toJSON: () => undefined,
        } as DOMRect
        Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
            configurable: true,
            value: vi.fn(() => rangeRect),
        })
        const pendingSearchTextRef = { current: 'target text' as string | null }
        const materializeAllVirtualSegments = vi.fn()
        const forceHydrateSegment = vi.fn()

        scrollMountedChapterIntoView({
            listEl,
            viewport,
            targetSpineIndex: 2,
            existing: createMountedChapter(),
            searchText: 'target text',
            generation: 1,
            jumpGenerationRef: { current: 1 },
            pendingSearchTextRef,
            lastScrollTopRef: { current: 0 },
            syncViewportState: vi.fn(),
            materializeAllVirtualSegments,
            forceHydrateSegment,
        })

        expect(pendingSearchTextRef.current).toBeNull()
        expect(materializeAllVirtualSegments).toHaveBeenCalledWith('ch-2')
        expect(forceHydrateSegment).toHaveBeenCalledTimes(1)
        expect(viewport.scrollTop).toBe(130)
    })

    it('目标章节 DOM 不存在时不触发滚动和回调', () => {
        const viewport = document.createElement('div')
        const syncViewportState = vi.fn()

        scrollMountedChapterIntoView({
            listEl: document.createElement('div'),
            viewport,
            targetSpineIndex: 2,
            existing: createMountedChapter(),
            generation: 1,
            jumpGenerationRef: { current: 1 },
            pendingSearchTextRef: { current: null },
            lastScrollTopRef: { current: 0 },
            syncViewportState,
            materializeAllVirtualSegments: vi.fn(),
            forceHydrateSegment: vi.fn(),
        })

        expect(viewport.scrollTop).toBe(0)
        expect(syncViewportState).not.toHaveBeenCalled()
    })
})
