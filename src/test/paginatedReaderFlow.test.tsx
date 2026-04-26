import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, waitFor } from '@testing-library/react'
import type { ContentProvider, SearchResult, SpineItemInfo, TocItem } from '@/engine/core/contentProvider'
import type { ReaderStyleConfig } from '@/components/Reader/ShadowRenderer'
import type { PageBoundary } from '@/engine/types/vitraPagination'

const mocks = vi.hoisted(() => ({
    preprocessChapterContentMock: vi.fn(),
    setSelectionMenuMock: vi.fn(),
    startMeasureMock: vi.fn(),
    shadowRendererSpy: vi.fn(),
}))

vi.mock('@/engine/render/chapterPreprocessService', () => ({
    preprocessChapterContent: mocks.preprocessChapterContentMock,
}))

vi.mock('@/engine', async () => {
    const actual = await vi.importActual<typeof import('@/engine')>('@/engine')
    return {
        ...actual,
        startMeasure: mocks.startMeasureMock,
    }
})

vi.mock('@/hooks/useSelectionMenu', () => ({
    useSelectionMenu: () => ({
        selectionMenu: { visible: false, x: 0, y: 0, text: '', spineIndex: -1 },
        setSelectionMenu: mocks.setSelectionMenuMock,
        renderedHighlightsRef: { current: new Set<string>() },
        renderSelectionUI: () => null,
    }),
}))

vi.mock('@/services/storageService', () => ({
    db: {
        progress: {
            put: async () => undefined,
        },
        highlights: {
            where: () => ({
                equals: () => ({
                    toArray: async () => [],
                }),
            }),
        },
    },
}))

vi.mock('@/utils/mediaResourceCleanup', () => ({
    releaseMediaResources: vi.fn(),
}))

vi.mock('@/utils/idleScheduler', () => ({
    scheduleIdleTask: (task: () => void) => window.setTimeout(task, 0),
    cancelIdleTask: (handle: number) => window.clearTimeout(handle),
}))

vi.mock('@/components/Reader/ShadowRenderer', async () => {
    const React = await import('react')
    const actual = await vi.importActual<typeof import('@/components/Reader/ShadowRenderer')>('@/components/Reader/ShadowRenderer')
    return {
        ...actual,
        ShadowRenderer: (props: { chapterId: string; htmlContent: string; onReady: (node: HTMLElement, height: number) => void }) => {
            mocks.shadowRendererSpy(props.chapterId)
            React.useEffect(() => {
                const node = document.createElement('div')
                node.setAttribute('data-shadow-ready', props.chapterId)
                node.innerHTML = props.htmlContent || '<p>fallback</p>'
                props.onReady(node, 600)
            }, [props])
            return null
        },
    }
})

import { PaginatedReaderView } from '@/components/Reader/PaginatedReaderView'

const DEFAULT_READER_STYLES: ReaderStyleConfig = {
    textColor: '#111',
    bgColor: '#fff',
    fontSize: 16,
    fontFamily: 'Georgia',
    lineHeight: 1.6,
    paragraphSpacing: 12,
    textIndentEm: 0,
    letterSpacing: 0,
    textAlign: 'left',
    pageWidth: 900,
}

class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
}

function createProvider(spineItems: SpineItemInfo[] = [
    { index: 0, href: 'chapter-1.xhtml', id: 'chapter-1', linear: true },
]) {

    const provider: ContentProvider = {
        init: async () => undefined,
        destroy: () => undefined,
        getToc: (): TocItem[] => [],
        getSpineItems: () => spineItems,
        getSpineIndexByHref: () => 0,
        extractChapterHtml: vi.fn(async () => '<p>body</p>'),
        extractChapterStyles: vi.fn(async () => ['p{}']),
        unloadChapter: vi.fn(),
        search: async (): Promise<SearchResult[]> => [],
        isAssetUrlAvailable: () => true,
    }

    return provider
}

async function flushUi(): Promise<void> {
    for (let index = 0; index < 4; index += 1) {
        await act(async () => {
            await Promise.resolve()
            await new Promise((resolve) => window.setTimeout(resolve, 0))
        })
    }
}

describe('PaginatedReaderView flow', () => {
    beforeEach(() => {
        mocks.preprocessChapterContentMock.mockReset()
        mocks.setSelectionMenuMock.mockReset()
        mocks.startMeasureMock.mockReset()
        mocks.shadowRendererSpy.mockReset()
        mocks.preprocessChapterContentMock.mockResolvedValue({
            htmlContent: '<p>body</p>',
            htmlFragments: [],
            externalStyles: ['p{}'],
            removedTagCount: 0,
            removedAttributeCount: 0,
            usedFallback: false,
            stylesScoped: true,
        })
        mocks.startMeasureMock.mockReturnValue({
            abort: vi.fn(),
            result: Promise.resolve<PageBoundary[]>([]),
        })
        vi.stubGlobal('ResizeObserver', ResizeObserverMock)
        vi.stubGlobal('requestAnimationFrame', ((callback: FrameRequestCallback) => {
            return window.setTimeout(() => callback(performance.now()), 0)
        }) as typeof requestAnimationFrame)
        vi.stubGlobal('cancelAnimationFrame', ((handle: number) => {
            window.clearTimeout(handle)
        }) as typeof cancelAnimationFrame)
        Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
            configurable: true,
            get() { return 1200 },
        })
        Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
            configurable: true,
            get() { return 800 },
        })
        Object.defineProperty(HTMLElement.prototype, 'scrollWidth', {
            configurable: true,
            get() { return 1200 },
        })
    })

    afterEach(() => {
        vi.restoreAllMocks()
        vi.unstubAllGlobals()
    })

    it('初次加载会抓取章节并执行预处理', async () => {
        const provider = createProvider()

        render(
            <PaginatedReaderView
                provider={provider}
                bookId="book-1"
                pageTurnMode="paginated-single"
                readerStyles={DEFAULT_READER_STYLES}
            />
        )

        await flushUi()

        await waitFor(() => {
            expect(mocks.preprocessChapterContentMock).toHaveBeenCalledTimes(1)
        })

        expect(provider.extractChapterHtml).toHaveBeenCalledWith(0)
        expect(mocks.shadowRendererSpy).toHaveBeenCalled()
    })

    it('样式切换后重新抓取当前章节', async () => {
        const provider = createProvider()
        const view = render(
            <PaginatedReaderView
                provider={provider}
                bookId="book-1"
                pageTurnMode="paginated-single"
                readerStyles={DEFAULT_READER_STYLES}
            />
        )

        await flushUi()

        view.rerender(
            <PaginatedReaderView
                provider={provider}
                bookId="book-1"
                pageTurnMode="paginated-single"
                readerStyles={{ ...DEFAULT_READER_STYLES, fontSize: 20 }}
            />
        )

        await flushUi()

        await waitFor(() => {
            expect(mocks.preprocessChapterContentMock).toHaveBeenCalledTimes(2)
        })
    })

    it('逻辑页图少于视觉页数时，右翻页直接进入下一章', async () => {
        const provider = createProvider([
            { index: 0, href: 'chapter-1.xhtml', id: 'chapter-1', linear: true },
            { index: 1, href: 'chapter-2.xhtml', id: 'chapter-2', linear: true },
        ])

        mocks.startMeasureMock.mockReturnValue({
            abort: vi.fn(),
            result: Promise.resolve<PageBoundary[]>([
                { sectionIndex: 0, startBlock: 0, endBlock: 1, startOffset: 0, endOffset: 760 },
            ]),
        })

        Object.defineProperty(HTMLElement.prototype, 'scrollWidth', {
            configurable: true,
            get() { return 2400 },
        })

        render(
            <PaginatedReaderView
                provider={provider}
                bookId="book-1"
                pageTurnMode="paginated-single"
                readerStyles={DEFAULT_READER_STYLES}
            />
        )

        await flushUi()

        await waitFor(() => {
            expect(mocks.startMeasureMock).toHaveBeenCalledTimes(1)
        })
        await flushUi()

        await act(async () => {
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
            await new Promise((resolve) => window.setTimeout(resolve, 200))
        })
        await flushUi()

        await waitFor(() => {
            expect(provider.extractChapterHtml).toHaveBeenNthCalledWith(2, 1)
        })
    })

    it('空章节会自动 fallback 到相邻章节', async () => {
        const provider = createProvider([
            { index: 0, href: 'chapter-1.xhtml', id: 'chapter-1', linear: true },
            { index: 1, href: 'chapter-2.xhtml', id: 'chapter-2', linear: true },
        ])

        mocks.preprocessChapterContentMock
            .mockResolvedValueOnce({
                htmlContent: '',
                htmlFragments: [],
                externalStyles: [],
                removedTagCount: 0,
                removedAttributeCount: 0,
                usedFallback: false,
                stylesScoped: true,
            })
            .mockResolvedValueOnce({
                htmlContent: '<p>chapter-2</p>',
                htmlFragments: ['<p>chapter-2</p>'],
                externalStyles: [],
                removedTagCount: 0,
                removedAttributeCount: 0,
                usedFallback: false,
                stylesScoped: true,
            })

        render(
            <PaginatedReaderView
                provider={provider}
                bookId="book-1"
                pageTurnMode="paginated-single"
                readerStyles={DEFAULT_READER_STYLES}
            />
        )

        await flushUi()

        await waitFor(() => {
            expect(mocks.preprocessChapterContentMock).toHaveBeenCalledTimes(2)
        })

        expect(mocks.preprocessChapterContentMock.mock.calls[0][0]).toMatchObject({ spineIndex: 0 })
        expect(mocks.preprocessChapterContentMock.mock.calls[1][0]).toMatchObject({ spineIndex: 1 })
    })

    it('文本选择后通过统一 helper 设置选择菜单状态', async () => {
        const provider = createProvider()
        const view = render(
            <PaginatedReaderView
                provider={provider}
                bookId="book-1"
                pageTurnMode="paginated-single"
                readerStyles={DEFAULT_READER_STYLES}
            />
        )

        await flushUi()

        const viewport = view.container.querySelector('[class*="viewport"]') as HTMLElement
        const column = view.container.querySelector('[class*="columnContainer"]') as HTMLElement
        const textNode = document.createTextNode('hello world')
        column.appendChild(textNode)

        const selection = window.getSelection()
        const range = document.createRange()
        range.setStart(textNode, 0)
        range.setEnd(textNode, 5)
        Object.defineProperty(range, 'getBoundingClientRect', {
            value: () => ({
                left: 10,
                top: 20,
                width: 30,
                height: 8,
                right: 40,
                bottom: 28,
                x: 10,
                y: 20,
                toJSON: () => ({}),
            }),
        })
        selection?.removeAllRanges()
        selection?.addRange(range)

        await act(async () => {
            viewport.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
            await Promise.resolve()
        })

        expect(mocks.setSelectionMenuMock).toHaveBeenCalledWith({
            visible: true,
            x: 25,
            y: 10,
            text: 'hello',
            spineIndex: 0,
        })
    })
})
