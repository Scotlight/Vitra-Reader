import type { PdfDocumentProxy } from '@/types/pdfjs'

export type PdfRuntimeKind = 'modern' | 'legacy'

export interface PdfJsRuntime {
    GlobalWorkerOptions: { workerSrc: string }
    getDocument: (src: unknown) => { promise: Promise<PdfDocumentProxy> }
}

export interface PdfPageLink {
    targetPage: number
    left: number
    top: number
    width: number
    height: number
}

export interface PdfRenderedPage {
    imageUrl: string
    links: readonly PdfPageLink[]
    pageWidthPx: number
    pageHeightPx: number
}
