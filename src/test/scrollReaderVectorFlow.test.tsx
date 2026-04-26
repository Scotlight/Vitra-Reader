import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, waitFor } from '@testing-library/react'
import type { ContentProvider, SearchResult, SpineItemInfo, TocItem } from '@/engine/core/contentProvider'
import type { SegmentMeta } from '@/engine/types/vectorRender'
import type { ReaderStyleConfig } from '@/components/Reader/ShadowRenderer'

const mocks = vi.hoisted(() => ({
    preprocessChapterContentMock: vi.fn(),
    progressPutMock: vi.fn(),
    shadowRendererSpy: vi.fn(),
}))

vi.mock('@/engine/render/chapterPreprocessService', () => ({
    preprocessChapterContent: mocks.preprocessChapterContentMock,
}))

vi.mock('@/hooks/useScrollInertia', () => ({
    useScrollInertia: () => ({
        velocity: 0,
        addImpulse: vi.fn(),
        fling: vi.fn(),
        stop: vi.fn(),
        setDragging: vi.fn(),
    }),
}))

vi.mock('@/hooks/useScrollEvents', () => ({
    useScrollEvents: vi.fn(),
}))

vi.mock('@/hooks/useSelectionMenu', () => ({
    useSelectionMenu: () => ({
        selectionMenu: { visible: false, x: 0, y: 0, text: '', spineIndex: -1 },
        setSelectionMenu: vi.fn(),
        renderedHighlightsRef: { current: new Set<string>() },
        renderSelectionUI: () => null,
    }),
}))

vi.mock('@/services/storageService', () => ({
    db: {
        progress: {
            put: mocks.progressPutMock,
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
        ShadowRenderer: (props: {
            chapterId: string
            htmlContent: string
            segmentMetas?: SegmentMeta[]
            onReady: (node: HTMLElement, height: number) => void
        }) => {
            mocks.shadowRendererSpy(props.chapterId)
            React.useEffect(() => {
                const node = document.createElement('div')
                if (props.segmentMetas && props.segmentMetas.length > 1) {
                    node.setAttribute('data-vitra-vectorized', 'true')
                }
                node.innerHTML = props.htmlContent || '<p>shadow-fallback</p>'
                props.onReady(node, 600)
            }, [props])
            return null
        },
    }
})

import { ScrollReaderView } from '@/components/Reader/ScrollReaderView'

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

function createSegment(index: number, charCount: number): SegmentMeta {
    return {
        index,
        charCount,
        estimatedHeight: 120,
        realHeight: null,
        offsetY: index * 120,
        measured: false,
        htmlContent: `<p>segment-${index}</p>`,
        hasMedia: false,
    }
}

function createVectorizedPreprocessResult(fontSize: number) {
    return {
        htmlContent: '',
        htmlFragments: [],
        externalStyles: [`[data-font="${fontSize}"]{}`],
        removedTagCount: 0,
        removedAttributeCount: 0,
        usedFallback: false,
        stylesScoped: true,
        segmentMetas: [
            createSegment(0, 200_000),
            createSegment(1, 200_000),
            createSegment(2, 200_000),
        ],
    }
}

function createNonVectorPreprocessResult() {
    return {
        htmlContent: '<p>small chapter</p>',
        htmlFragments: ['<p>small chapter</p>'],
        externalStyles: ['p{}'],
        removedTagCount: 0,
        removedAttributeCount: 0,
        usedFallback: false,
        stylesScoped: true,
        segmentMetas: [createSegment(0, 20_000)],
    }
}

function createProvider(options?: {
    spineItems?: SpineItemInfo[]
    getSpineIndexByHref?: (href: string) => number
    extractChapterHtml?: (spineIndex: number) => Promise<string>
}) {
    const spineItems: SpineItemInfo[] = [
        ...(options?.spineItems ?? [
            { index: 0, href: 'chapter-1.xhtml', id: 'chapter-1', linear: true },
        ]),
    ]

    const provider: ContentProvider = {
        init: async () => undefined,
        destroy: () => undefined,
        getToc: (): TocItem[] => [],
        getSpineItems: () => spineItems,
        getSpineIndexByHref: options?.getSpineIndexByHref ?? (() => 0),
        extractChapterHtml: vi.fn(options?.extractChapterHtml ?? (async () => '<p>body</p>')),
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

describe('ScrollReaderView vector flow', () => {
    beforeEach(() => {
        mocks.preprocessChapterContentMock.mockReset()
        mocks.progressPutMock.mockReset()
        mocks.shadowRendererSpy.mockReset()
        vi.stubGlobal('ResizeObserver', ResizeObserverMock)
        vi.stubGlobal('requestAnimationFrame', ((callback: FrameRequestCallback) => {
            return window.setTimeout(() => callback(performance.now()), 0)
        }) as typeof requestAnimationFrame)
        vi.stubGlobal('cancelAnimationFrame', ((handle: number) => {
            window.clearTimeout(handle)
        }) as typeof cancelAnimationFrame)
        if (!('scrollTo' in HTMLElement.prototype)) {
            Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
                configurable: true,
                value(options: ScrollToOptions | number) {
                    if (typeof options === 'number') {
                        this.scrollTop = options
                        return
                    }
                    this.scrollTop = options.top ?? this.scrollTop
                },
            })
        }
    })

    afterEach(() => {
        vi.restoreAllMocks()
        vi.unstubAllGlobals()
    })

    it('大章节初次加载直接进入向量章节外壳', async () => {
        const provider = createProvider()
        mocks.preprocessChapterContentMock.mockResolvedValue(createVectorizedPreprocessResult(16))

        const view = render(
            <ScrollReaderView
                provider={provider}
                bookId="book-1"
                readerStyles={DEFAULT_READER_STYLES}
            />
        )

        await flushUi()

        await waitFor(() => {
            expect(view.container.querySelector('[data-vitra-vectorized="true"]')).not.toBeNull()
        })

        expect(mocks.shadowRendererSpy).not.toHaveBeenCalled()
        expect(provider.extractChapterHtml).toHaveBeenCalledTimes(1)
        expect(mocks.preprocessChapterContentMock).toHaveBeenCalledTimes(1)
    })

    it('样式切换后重新预处理向量章节，并继续走直接外壳路径', async () => {
        const provider = createProvider()
        mocks.preprocessChapterContentMock.mockImplementation(async (input: { vectorConfig: { fontSize: number } }) => (
            createVectorizedPreprocessResult(input.vectorConfig.fontSize)
        ))

        const view = render(
            <ScrollReaderView
                provider={provider}
                bookId="book-1"
                readerStyles={DEFAULT_READER_STYLES}
            />
        )

        await flushUi()

        view.rerender(
            <ScrollReaderView
                provider={provider}
                bookId="book-1"
                readerStyles={{ ...DEFAULT_READER_STYLES, fontSize: 20 }}
            />
        )

        await flushUi()

        await waitFor(() => {
            expect(mocks.preprocessChapterContentMock).toHaveBeenCalledTimes(2)
        })

        const lastCall = mocks.preprocessChapterContentMock.mock.calls.at(-1)?.[0] as { vectorConfig: { fontSize: number } }
        expect(lastCall.vectorConfig.fontSize).toBe(20)
        expect(provider.extractChapterHtml).toHaveBeenCalledTimes(2)
        expect(mocks.shadowRendererSpy).not.toHaveBeenCalled()
    })

    it('小章节不命中向量化计划时仍然走 ShadowRenderer', async () => {
        const provider = createProvider()
        mocks.preprocessChapterContentMock.mockResolvedValue(createNonVectorPreprocessResult())

        render(
            <ScrollReaderView
                provider={provider}
                bookId="book-1"
                readerStyles={DEFAULT_READER_STYLES}
            />
        )

        await flushUi()

        await waitFor(() => {
            expect(mocks.shadowRendererSpy).toHaveBeenCalled()
        })

        expect(provider.extractChapterHtml).toHaveBeenCalledTimes(1)
        expect(mocks.preprocessChapterContentMock).toHaveBeenCalledTimes(1)
    })

    it('正文内目录链接点击后跳转到目标章节', async () => {
        mocks.preprocessChapterContentMock.mockImplementation(async (input: { htmlContent: string }) => ({
            htmlContent: input.htmlContent,
            htmlFragments: [input.htmlContent],
            externalStyles: ['p{}'],
            removedTagCount: 0,
            removedAttributeCount: 0,
            usedFallback: false,
            stylesScoped: true,
            hasRenderableContent: true,
            segmentMetas: [createSegment(0, 20_000)],
        }))
        const provider = createProvider({
            spineItems: [
                { index: 0, href: 'chapter-1.xhtml', id: 'chapter-1', linear: true },
                { index: 1, href: 'chapter-2.xhtml', id: 'chapter-2', linear: true },
            ],
            getSpineIndexByHref: (href) => href === 'filepos:200' ? 1 : -1,
            extractChapterHtml: async (spineIndex) => (
                spineIndex === 0
                    ? '<p><a href="filepos:200">目录跳转</a></p>'
                    : '<p>第二章</p>'
            ),
        })

        const view = render(
            <ScrollReaderView
                provider={provider}
                bookId="book-1"
                readerStyles={DEFAULT_READER_STYLES}
            />
        )

        await flushUi()

        await waitFor(() => {
            expect(view.container.querySelector('a[href="filepos:200"]')).not.toBeNull()
        })
        const anchor = view.container.querySelector('a[href="filepos:200"]') as HTMLAnchorElement | null

        await act(async () => {
            anchor?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
            await new Promise((resolve) => window.setTimeout(resolve, 200))
        })

        await waitFor(() => {
            expect(provider.extractChapterHtml).toHaveBeenNthCalledWith(2, 1)
        })
    })
})
