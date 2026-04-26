import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
    renderPdfPageMock: vi.fn(),
    extractPdfPageSearchTextMock: vi.fn(),
    loadPdfOutlineMock: vi.fn(),
    openPdfDocumentMock: vi.fn(),
    openPdfDocumentWithFallbackMock: vi.fn(),
    renderPdfPageHtmlMock: vi.fn(),
    promoteLegacyRuntimeMock: vi.fn(),
}))

vi.mock('@/engine/parsers/providers/pdf/pdfPageRenderer', () => ({
    renderPdfPage: mocks.renderPdfPageMock,
    extractPdfPageSearchText: mocks.extractPdfPageSearchTextMock,
}))

vi.mock('@/engine/parsers/providers/pdf/pdfNavigation', () => ({
    buildFallbackPdfToc: (pageCount: number) => Array.from({ length: pageCount }, (_, pageIndex) => ({ id: `page-${pageIndex}`, href: `page-${pageIndex}`, label: `Page ${pageIndex + 1}` })),
    buildPdfHref: (pageIndex: number) => `page-${pageIndex}`,
    loadPdfOutline: mocks.loadPdfOutlineMock,
}))

vi.mock('@/engine/parsers/providers/pdf/pdfPageHtml', () => ({
    renderPdfPageHtml: mocks.renderPdfPageHtmlMock,
}))

vi.mock('@/engine/parsers/providers/pdf/pdfRuntime', () => ({
    openPdfDocument: mocks.openPdfDocumentMock,
    openPdfDocumentWithFallback: mocks.openPdfDocumentWithFallbackMock,
    promoteLegacyRuntime: mocks.promoteLegacyRuntimeMock,
    shouldFallbackToLegacy: () => false,
}))

import { PdfContentProvider } from '@/engine/parsers/providers/pdf/pdfContentProvider'

function createMockDoc(pageCount: number) {
    return {
        numPages: pageCount,
        destroy: vi.fn(),
        getPage: vi.fn(async () => ({ getTextContent: vi.fn(async () => ({ items: [] })) })),
    }
}

function mockPerformanceNow(values: number[]): void {
    let index = 0
    vi.spyOn(performance, 'now').mockImplementation(() => values[Math.min(index++, values.length - 1)])
}

describe('PdfContentProvider prerender backpressure', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        const doc = createMockDoc(3)
        mocks.openPdfDocumentWithFallbackMock.mockResolvedValue({ doc, kind: 'modern' })
        mocks.openPdfDocumentMock.mockResolvedValue(doc)
        mocks.loadPdfOutlineMock.mockResolvedValue([])
        mocks.extractPdfPageSearchTextMock.mockResolvedValue('')
        mocks.renderPdfPageHtmlMock.mockImplementation((_renderedPage: unknown, pageIndex: number) => `<page-${pageIndex}>`)
        mocks.renderPdfPageMock.mockImplementation(async (_doc: unknown, pageIndex: number) => ({
            imageUrl: `blob:${pageIndex}`,
            links: [],
            pageWidthPx: 640,
            pageHeightPx: 960,
        }))
    })

    afterEach(() => {
        vi.useRealTimers()
        vi.restoreAllMocks()
        vi.clearAllMocks()
    })

    it('前景翻页后 900ms idle 只预渲下一页', async () => {
        mockPerformanceNow([0, 90, 90, 180, 180, 270])
        const provider = new PdfContentProvider(new ArrayBuffer(8))
        await provider.init()

        await provider.extractChapterHtml(0)
        expect(mocks.renderPdfPageMock).toHaveBeenCalledTimes(1)
        expect(mocks.renderPdfPageMock).toHaveBeenNthCalledWith(1, expect.any(Object), 0, null)

        await provider.extractChapterHtml(1)
        expect(mocks.renderPdfPageMock).toHaveBeenCalledTimes(2)
        expect(mocks.renderPdfPageMock).toHaveBeenNthCalledWith(2, expect.any(Object), 1, 90)

        await vi.advanceTimersByTimeAsync(899)
        expect(mocks.renderPdfPageMock).toHaveBeenCalledTimes(2)

        await vi.advanceTimersByTimeAsync(1)
        expect(mocks.renderPdfPageMock).toHaveBeenCalledTimes(3)
        expect(mocks.renderPdfPageMock).toHaveBeenNthCalledWith(3, expect.any(Object), 2, 90)
    })

    it('慢页不触发邻页预渲', async () => {
        mockPerformanceNow([0, 181])
        const provider = new PdfContentProvider(new ArrayBuffer(8))
        await provider.init()

        await provider.extractChapterHtml(0)
        await vi.advanceTimersByTimeAsync(500)

        expect(mocks.renderPdfPageMock).toHaveBeenCalledTimes(1)
    })

    it('新的前景翻页会取消已排队预渲', async () => {
        const doc = createMockDoc(2)
        mocks.openPdfDocumentWithFallbackMock.mockResolvedValue({ doc, kind: 'modern' })
        mocks.openPdfDocumentMock.mockResolvedValue(doc)
        mockPerformanceNow([0, 90, 100, 190])
        const provider = new PdfContentProvider(new ArrayBuffer(8))
        await provider.init()

        await provider.extractChapterHtml(0)
        await vi.advanceTimersByTimeAsync(200)
        await provider.extractChapterHtml(1)
        await vi.advanceTimersByTimeAsync(500)

        expect(mocks.renderPdfPageMock).toHaveBeenCalledTimes(2)
        expect(mocks.renderPdfPageMock).toHaveBeenNthCalledWith(2, expect.any(Object), 1, 90)
    })

    it('页图 Blob 在文档会话内保活，卸载与搜索重建 HTML 都不重复渲染', async () => {
        const doc = createMockDoc(1)
        mocks.openPdfDocumentWithFallbackMock.mockResolvedValue({ doc, kind: 'modern' })
        mocks.openPdfDocumentMock.mockResolvedValue(doc)
        mocks.extractPdfPageSearchTextMock.mockResolvedValue('关键字')
        mocks.renderPdfPageHtmlMock.mockImplementation((renderedPage: { imageUrl: string }, pageIndex: number, searchText = '') => (
            `<page-${pageIndex} src="${renderedPage.imageUrl}" search="${searchText}">`
        ))
        mockPerformanceNow([0, 90])

        const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
        const provider = new PdfContentProvider(new ArrayBuffer(8))
        await provider.init()

        const firstHtml = await provider.extractChapterHtml(0)
        provider.unloadChapter(0)
        const secondHtml = await provider.extractChapterHtml(0)

        expect(firstHtml).toContain('blob:0')
        expect(secondHtml).toContain('blob:0')
        expect(mocks.renderPdfPageMock).toHaveBeenCalledTimes(1)
        expect(provider.isAssetUrlAvailable('blob:0')).toBe(true)
        expect(revokeSpy).not.toHaveBeenCalled()

        const results = await provider.search('关键字')
        const htmlWithSearch = await provider.extractChapterHtml(0)

        expect(results).toEqual([{ cfi: 'vitra:0:0', excerpt: '关键字' }])
        expect(htmlWithSearch).toContain('search="关键字"')
        expect(mocks.renderPdfPageMock).toHaveBeenCalledTimes(1)

        provider.destroy()

        expect(revokeSpy).toHaveBeenCalledWith('blob:0')
        expect(provider.isAssetUrlAvailable('blob:0')).toBe(false)
    })
})
