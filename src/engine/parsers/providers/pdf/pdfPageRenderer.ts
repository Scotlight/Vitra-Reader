import type { PdfDocumentProxy, PdfPageProxy } from '@/types/pdfjs'
import { extractPdfPageLinks } from './pdfNavigation'
import type { PdfRenderedPage } from './pdfTypes'

const MIN_RENDER_SCALE = 1
const MAX_RENDER_AREA_PX = 1_600_000
const MAX_RENDER_WIDTH_PX = 1_400
const MAX_RENDER_HEIGHT_PX = 1_800
const JPEG_QUALITY = 0.88
const WEBP_DEBUG_QUALITY = 0.92
const JPEG_MIME_TYPE = 'image/jpeg'
const WEBP_MIME_TYPE = 'image/webp'
const PNG_MIME_TYPE = 'image/png'

type PdfImageMimeType = typeof JPEG_MIME_TYPE | typeof WEBP_MIME_TYPE | typeof PNG_MIME_TYPE
type PdfDebugImageFormat = 'jpeg' | 'webp' | 'png'

interface PdfImageEncoding {
    mimeType: PdfImageMimeType
    quality?: number
}

export function computePdfRenderScale(baseWidth: number, baseHeight: number, devicePixelRatio: number): number {
    const safeWidth = Number.isFinite(baseWidth) && baseWidth > 0 ? baseWidth : 1
    const safeHeight = Number.isFinite(baseHeight) && baseHeight > 0 ? baseHeight : 1
    const safeDpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1
    const requestedScale = Math.max(MIN_RENDER_SCALE, safeDpr)
    const areaLimitedScale = Math.sqrt(MAX_RENDER_AREA_PX / (safeWidth * safeHeight))
    const widthLimitedScale = MAX_RENDER_WIDTH_PX / safeWidth
    const heightLimitedScale = MAX_RENDER_HEIGHT_PX / safeHeight
    const resolvedScale = Math.min(
        requestedScale,
        areaLimitedScale,
        widthLimitedScale,
        heightLimitedScale,
    )

    if (!Number.isFinite(resolvedScale)) return MIN_RENDER_SCALE
    return Math.max(MIN_RENDER_SCALE, resolvedScale)
}

export function resolvePdfRenderScale(
    baseWidth: number,
    baseHeight: number,
    devicePixelRatio: number,
    _previousRenderDurationMs: number | null,
): number {
    return computePdfRenderScale(baseWidth, baseHeight, devicePixelRatio)
}

function getPdfRenderScale(baseWidth: number, baseHeight: number, previousRenderDurationMs: number | null): number {
    const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1
    return resolvePdfRenderScale(baseWidth, baseHeight, dpr, previousRenderDurationMs)
}

function readPdfDebugImageFormat(): PdfDebugImageFormat | null {
    if (!import.meta.env.DEV) return null
    const value = (globalThis as typeof globalThis & { __VITRA_PDF_DEBUG_IMAGE_FORMAT__?: unknown }).__VITRA_PDF_DEBUG_IMAGE_FORMAT__
    if (value === 'jpeg' || value === 'webp' || value === 'png') return value
    return null
}

function shouldLogPdfRenderMetrics(): boolean {
    if (!import.meta.env.DEV) return false
    return Boolean((globalThis as typeof globalThis & { __VITRA_PDF_DEBUG_RENDER_METRICS__?: unknown }).__VITRA_PDF_DEBUG_RENDER_METRICS__)
}

function getPdfImageEncoding(): PdfImageEncoding {
    const debugFormat = readPdfDebugImageFormat()
    if (debugFormat === 'webp') {
        return { mimeType: WEBP_MIME_TYPE, quality: WEBP_DEBUG_QUALITY }
    }
    if (debugFormat === 'png') {
        return { mimeType: PNG_MIME_TYPE }
    }
    return { mimeType: JPEG_MIME_TYPE, quality: JPEG_QUALITY }
}

async function canvasToBlob(
    canvas: HTMLCanvasElement,
    mimeType: PdfImageMimeType,
    quality?: number,
): Promise<Blob | null> {
    if (typeof canvas.toBlob !== 'function') {
        throw new Error('[PdfProvider] canvas.toBlob is unavailable in current runtime')
    }

    return new Promise<Blob | null>((resolve) => {
        canvas.toBlob((value) => resolve(value), mimeType, quality)
    })
}

async function canvasToImageUrl(canvas: HTMLCanvasElement): Promise<string> {
    const preferredEncoding = getPdfImageEncoding()
    const blob = await canvasToBlob(canvas, preferredEncoding.mimeType, preferredEncoding.quality)
        ?? (preferredEncoding.mimeType === PNG_MIME_TYPE
            ? null
            : await canvasToBlob(canvas, PNG_MIME_TYPE))
    if (!blob) {
        throw new Error('[PdfProvider] failed to encode rendered page into blob')
    }

    if (blob.type !== preferredEncoding.mimeType) {
        console.warn(`[PdfProvider] ${preferredEncoding.mimeType} encode unavailable, fell back to ${blob.type || PNG_MIME_TYPE}`)
    }

    return URL.createObjectURL(blob)
}

export async function extractPdfPageSearchText(page: PdfPageProxy, pageIndex: number): Promise<string> {
    try {
        const content = await page.getTextContent()
        return content.items
            .map((item) => item.str || '')
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim()
    } catch (error) {
        console.warn(`[PdfProvider] Failed to extract text content for page ${pageIndex + 1}:`, error)
        return ''
    }
}

export async function renderPdfPage(
    doc: PdfDocumentProxy,
    pageIndex: number,
    previousRenderDurationMs: number | null = null,
): Promise<PdfRenderedPage> {
    if (typeof document === 'undefined') {
        throw new Error('[PdfProvider] document is unavailable in current runtime')
    }

    const page = await doc.getPage(pageIndex + 1)
    const baseViewport = page.getViewport({ scale: 1 })
    const renderScale = getPdfRenderScale(baseViewport.width, baseViewport.height, previousRenderDurationMs)
    const viewport = page.getViewport({ scale: renderScale })
    const pageWidthPx = Math.ceil(viewport.width)
    const pageHeightPx = Math.ceil(viewport.height)
    const pixelArea = pageWidthPx * pageHeightPx
    const canvas = document.createElement('canvas')
    canvas.width = pageWidthPx
    canvas.height = pageHeightPx

    const context = canvas.getContext('2d')
    if (!context) throw new Error('[PdfProvider] canvas 2d context is unavailable')

    try {
        const renderStart = performance.now()
        await page.render({ canvasContext: context, viewport }).promise
        const renderMs = performance.now() - renderStart
        if (shouldLogPdfRenderMetrics()) {
            console.info(
                `[PdfProvider] Render metrics page=${pageIndex + 1} scale=${renderScale.toFixed(3)} pixelArea=${pixelArea} renderMs=${renderMs.toFixed(2)}`,
            )
        }
        const [imageUrl, links] = await Promise.all([
            canvasToImageUrl(canvas),
            extractPdfPageLinks(doc, page, viewport, pageIndex),
        ])
        return { imageUrl, links, pageWidthPx, pageHeightPx }
    } finally {
        canvas.width = 0
        canvas.height = 0
    }
}
