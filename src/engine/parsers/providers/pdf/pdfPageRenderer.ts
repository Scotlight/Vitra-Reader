import type { PdfDocumentProxy, PdfPageProxy } from '../../../../types/pdfjs'
import { extractPdfPageLinks } from './pdfNavigation'
import type { PdfRenderedPage } from './pdfTypes'

const MIN_RENDER_SCALE = 1
const MAX_RENDER_SCALE = 1.3
const JPEG_QUALITY = 0.88

function getPdfRenderScale(): number {
    const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1
    return Math.min(MAX_RENDER_SCALE, Math.max(MIN_RENDER_SCALE, dpr))
}

async function canvasToImageUrl(canvas: HTMLCanvasElement): Promise<string> {
    if (typeof canvas.toBlob !== 'function') {
        throw new Error('[PdfProvider] canvas.toBlob is unavailable in current runtime')
    }

    const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((value) => resolve(value), 'image/jpeg', JPEG_QUALITY)
    })
    if (!blob) {
        throw new Error('[PdfProvider] failed to encode rendered page into blob')
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

export async function renderPdfPage(doc: PdfDocumentProxy, pageIndex: number): Promise<PdfRenderedPage> {
    if (typeof document === 'undefined') {
        throw new Error('[PdfProvider] document is unavailable in current runtime')
    }

    const page = await doc.getPage(pageIndex + 1)
    const viewport = page.getViewport({ scale: getPdfRenderScale() })
    const pageWidthPx = Math.ceil(viewport.width)
    const pageHeightPx = Math.ceil(viewport.height)
    const canvas = document.createElement('canvas')
    canvas.width = pageWidthPx
    canvas.height = pageHeightPx

    const context = canvas.getContext('2d')
    if (!context) throw new Error('[PdfProvider] canvas 2d context is unavailable')

    try {
        await page.render({ canvasContext: context, viewport }).promise
        const [imageUrl, links, searchText] = await Promise.all([
            canvasToImageUrl(canvas),
            extractPdfPageLinks(doc, page, viewport, pageIndex),
            extractPdfPageSearchText(page, pageIndex),
        ])
        return { imageUrl, links, pageWidthPx, pageHeightPx, searchText }
    } finally {
        canvas.width = 0
        canvas.height = 0
    }
}
