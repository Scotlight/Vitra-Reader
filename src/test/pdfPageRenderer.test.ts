import { afterEach, describe, expect, it, vi } from 'vitest'
import { computePdfRenderScale, resolvePdfRenderScale, renderPdfPage } from '../engine/parsers/providers/pdf/pdfPageRenderer'
import { renderPdfPageHtml } from '../engine/parsers/providers/pdf/pdfPageHtml'

describe('pdfPageRenderer', () => {
    const originalDevicePixelRatio = window.devicePixelRatio

    afterEach(() => {
        Object.defineProperty(window, 'devicePixelRatio', {
            configurable: true,
            value: originalDevicePixelRatio,
        })
        delete (globalThis as typeof globalThis & { __VITRA_PDF_DEBUG_IMAGE_FORMAT__?: 'jpeg' | 'webp' | 'png' }).__VITRA_PDF_DEBUG_IMAGE_FORMAT__
        delete (globalThis as typeof globalThis & { __VITRA_PDF_DEBUG_RENDER_METRICS__?: boolean }).__VITRA_PDF_DEBUG_RENDER_METRICS__
        vi.restoreAllMocks()
    })

    it.each([
        { label: '高 DPR 紧凑页受面积上限约束', baseWidth: 600, baseHeight: 900, dpr: 2.5, expectedScale: 1.72132593164774 },
        { label: '高 DPR 标准书页受面积上限约束', baseWidth: 816, baseHeight: 1056, dpr: 2.5, expectedScale: 1.36264570868277 },
        { label: '低 DPR 页面跟随请求值', baseWidth: 600, baseHeight: 900, dpr: 1.25, expectedScale: 1.25 },
    ])('computePdfRenderScale 为 $label 返回预期候选缩放', ({ baseWidth, baseHeight, dpr, expectedScale }) => {
        expect(computePdfRenderScale(baseWidth, baseHeight, dpr)).toBeCloseTo(expectedScale, 6)
    })

    it.each([
        { label: '无历史渲染耗时', baseWidth: 600, baseHeight: 900, dpr: 2.5, previousRenderDurationMs: null, expectedScale: 1.72132593164774 },
        { label: '快速页不影响缩放', baseWidth: 600, baseHeight: 900, dpr: 2.5, previousRenderDurationMs: 90, expectedScale: 1.72132593164774 },
        { label: '标准书页不看历史耗时', baseWidth: 816, baseHeight: 1056, dpr: 2.5, previousRenderDurationMs: 150, expectedScale: 1.36264570868277 },
        { label: '慢页也不因历史耗时回落', baseWidth: 600, baseHeight: 900, dpr: 2.5, previousRenderDurationMs: 220, expectedScale: 1.72132593164774 },
    ])('resolvePdfRenderScale 在 $label 下返回预期缩放', ({ baseWidth, baseHeight, dpr, previousRenderDurationMs, expectedScale }) => {
        expect(resolvePdfRenderScale(baseWidth, baseHeight, dpr, previousRenderDurationMs)).toBeCloseTo(expectedScale, 6)
    })

    it('renderPdfPage 默认走 JPEG 热路径，并按 DPR+限幅选择缩放', async () => {
        Object.defineProperty(window, 'devicePixelRatio', {
            configurable: true,
            value: 2.5,
        })

        const context = {} as CanvasRenderingContext2D
        const toBlob = vi.fn((callback: BlobCallback, mimeType?: string) => {
            callback(new Blob(['pdf'], { type: mimeType || 'image/jpeg' }))
        })
        const canvas = {
            width: 0,
            height: 0,
            getContext: vi.fn(() => context),
            toBlob,
        } as unknown as HTMLCanvasElement
        const originalCreateElement = document.createElement.bind(document)
        vi.spyOn(document, 'createElement').mockImplementation(((tagName: string) => {
            if (tagName === 'canvas') return canvas as unknown as HTMLElement
            return originalCreateElement(tagName)
        }) as typeof document.createElement)
        vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:pdf-page')

        const page = {
            getViewport: vi.fn(({ scale }: { scale: number }) => ({
                width: 600 * scale,
                height: 900 * scale,
                convertToViewportRectangle: (rect: number[]) => rect,
            })),
            render: vi.fn(() => ({ promise: Promise.resolve() })),
            getTextContent: vi.fn(async () => ({ items: [{ str: '不该被调用' }] })),
            getAnnotations: vi.fn(async () => []),
        }
        const doc = {
            getPage: vi.fn(async () => page),
        }

        const rendered = await renderPdfPage(doc as any, 0)
        const renderScale = page.getViewport.mock.calls[1]?.[0]?.scale as number

        expect(page.getTextContent).not.toHaveBeenCalled()
        expect(page.getViewport).toHaveBeenNthCalledWith(1, { scale: 1 })
        expect(renderScale).toBeCloseTo(1.72132593164774, 6)
        expect(toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/jpeg', 0.88)
        expect(rendered).toEqual({
            imageUrl: 'blob:pdf-page',
            links: [],
            pageWidthPx: 1033,
            pageHeightPx: 1550,
        })
    })

    it('renderPdfPage 保留第三个参数，但本版不参与缩放决策', async () => {
        Object.defineProperty(window, 'devicePixelRatio', {
            configurable: true,
            value: 2.5,
        })

        const context = {} as CanvasRenderingContext2D
        const canvas = {
            width: 0,
            height: 0,
            getContext: vi.fn(() => context),
            toBlob: vi.fn((callback: BlobCallback, mimeType?: string) => {
                callback(new Blob(['pdf'], { type: mimeType || 'image/jpeg' }))
            }),
        } as unknown as HTMLCanvasElement
        const originalCreateElement = document.createElement.bind(document)
        vi.spyOn(document, 'createElement').mockImplementation(((tagName: string) => {
            if (tagName === 'canvas') return canvas as unknown as HTMLElement
            return originalCreateElement(tagName)
        }) as typeof document.createElement)
        vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:pdf-page')

        const page = {
            getViewport: vi.fn(({ scale }: { scale: number }) => ({ width: 600 * scale, height: 900 * scale, convertToViewportRectangle: (rect: number[]) => rect })),
            render: vi.fn(() => ({ promise: Promise.resolve() })),
            getTextContent: vi.fn(async () => ({ items: [] })),
            getAnnotations: vi.fn(async () => []),
        }
        const doc = {
            getPage: vi.fn(async () => page),
        }

        await renderPdfPage(doc as any, 0, 90)

        expect(page.getViewport).toHaveBeenNthCalledWith(1, { scale: 1 })
        expect(page.getViewport.mock.calls[1]?.[0]?.scale).toBeCloseTo(1.72132593164774, 6)
    })

    it('开发调试时可切到 WebP 编码覆盖', async () => {
        ;(globalThis as typeof globalThis & { __VITRA_PDF_DEBUG_IMAGE_FORMAT__?: 'jpeg' | 'webp' | 'png' }).__VITRA_PDF_DEBUG_IMAGE_FORMAT__ = 'webp'

        const context = {} as CanvasRenderingContext2D
        const toBlob = vi.fn((callback: BlobCallback, mimeType?: string) => {
            callback(new Blob(['pdf'], { type: mimeType || 'image/webp' }))
        })
        const canvas = {
            width: 0,
            height: 0,
            getContext: vi.fn(() => context),
            toBlob,
        } as unknown as HTMLCanvasElement
        const originalCreateElement = document.createElement.bind(document)
        vi.spyOn(document, 'createElement').mockImplementation(((tagName: string) => {
            if (tagName === 'canvas') return canvas as unknown as HTMLElement
            return originalCreateElement(tagName)
        }) as typeof document.createElement)
        vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:pdf-page')

        const page = {
            getViewport: vi.fn(({ scale }: { scale: number }) => ({ width: 600 * scale, height: 900 * scale, convertToViewportRectangle: (rect: number[]) => rect })),
            render: vi.fn(() => ({ promise: Promise.resolve() })),
            getTextContent: vi.fn(async () => ({ items: [] })),
            getAnnotations: vi.fn(async () => []),
        }
        const doc = {
            getPage: vi.fn(async () => page),
        }

        await renderPdfPage(doc as any, 0)

        expect(toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/webp', 0.92)
    })

    it('JPEG 编码失败时明确回退到 PNG', async () => {
        const context = {} as CanvasRenderingContext2D
        const toBlob = vi.fn((callback: BlobCallback, mimeType?: string) => {
            if (mimeType === 'image/jpeg') {
                callback(null)
                return
            }
            callback(new Blob(['pdf'], { type: mimeType || 'image/png' }))
        })
        const canvas = {
            width: 0,
            height: 0,
            getContext: vi.fn(() => context),
            toBlob,
        } as unknown as HTMLCanvasElement
        const originalCreateElement = document.createElement.bind(document)
        vi.spyOn(document, 'createElement').mockImplementation(((tagName: string) => {
            if (tagName === 'canvas') return canvas as unknown as HTMLElement
            return originalCreateElement(tagName)
        }) as typeof document.createElement)
        vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:pdf-page')
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

        const page = {
            getViewport: vi.fn(({ scale }: { scale: number }) => ({ width: 640 * scale, height: 960 * scale, convertToViewportRectangle: (rect: number[]) => rect })),
            render: vi.fn(() => ({ promise: Promise.resolve() })),
            getTextContent: vi.fn(async () => ({ items: [] })),
            getAnnotations: vi.fn(async () => []),
        }
        const doc = {
            getPage: vi.fn(async () => page),
        }

        await renderPdfPage(doc as any, 0, 90)

        expect(toBlob).toHaveBeenNthCalledWith(1, expect.any(Function), 'image/jpeg', 0.88)
        expect(toBlob).toHaveBeenNthCalledWith(2, expect.any(Function), 'image/png', undefined)
        expect(warnSpy).toHaveBeenCalledWith('[PdfProvider] image/jpeg encode unavailable, fell back to image/png')
    })

    it('开发者调试标志开启时输出缩放、像素面积与渲染耗时', async () => {
        ;(globalThis as typeof globalThis & { __VITRA_PDF_DEBUG_RENDER_METRICS__?: boolean }).__VITRA_PDF_DEBUG_RENDER_METRICS__ = true

        Object.defineProperty(window, 'devicePixelRatio', {
            configurable: true,
            value: 2.5,
        })

        vi.spyOn(performance, 'now').mockReturnValueOnce(10).mockReturnValueOnce(100)

        const context = {} as CanvasRenderingContext2D
        const canvas = {
            width: 0,
            height: 0,
            getContext: vi.fn(() => context),
            toBlob: vi.fn((callback: BlobCallback, mimeType?: string) => {
                callback(new Blob(['pdf'], { type: mimeType || 'image/jpeg' }))
            }),
        } as unknown as HTMLCanvasElement
        const originalCreateElement = document.createElement.bind(document)
        vi.spyOn(document, 'createElement').mockImplementation(((tagName: string) => {
            if (tagName === 'canvas') return canvas as unknown as HTMLElement
            return originalCreateElement(tagName)
        }) as typeof document.createElement)
        vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:pdf-page')
        const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined)

        const page = {
            getViewport: vi.fn(({ scale }: { scale: number }) => ({ width: 600 * scale, height: 900 * scale, convertToViewportRectangle: (rect: number[]) => rect })),
            render: vi.fn(() => ({ promise: Promise.resolve() })),
            getTextContent: vi.fn(async () => ({ items: [] })),
            getAnnotations: vi.fn(async () => []),
        }
        const doc = {
            getPage: vi.fn(async () => page),
        }

        await renderPdfPage(doc as any, 0, 90)

        expect(infoSpy).toHaveBeenCalledWith(expect.stringMatching(/^\[PdfProvider\] Render metrics page=1 scale=1\.721 pixelArea=1601150 renderMs=90\.00$/))
    })

    it('仅在显式提供搜索文本时才注入隐藏文本层', () => {
        const renderedPage = {
            imageUrl: 'blob:pdf-page',
            links: [],
            pageWidthPx: 640,
            pageHeightPx: 960,
        }

        expect(renderPdfPageHtml(renderedPage, 0)).not.toContain('pdf-page-search-text')
        expect(renderPdfPageHtml(renderedPage, 0, '关键字')).toContain('pdf-page-search-text')
    })
})
