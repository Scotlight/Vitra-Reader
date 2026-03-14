/** pdfjs-dist 内部类型的最小声明，供 pdfProvider.ts 使用 */

export interface PdfOutlineItem {
    title?: string
    dest?: unknown
    items?: PdfOutlineItem[]
}

export interface PdfTextItem {
    str: string
    transform?: number[]   // [scaleX, skewX, skewY, scaleY, translateX, translateY]
    width?: number
    height?: number
    fontName?: string
    dir?: string
}

export interface PdfTextContent {
    items: PdfTextItem[]
}

export interface PdfAnnotation {
    subtype?: string
    rect?: unknown[]
    dest?: unknown
}

export interface PdfPageViewport {
    width: number
    height: number
    convertToViewportRectangle?: (rect: number[]) => number[]
}

export interface PdfPageProxy {
    getViewport(params: { scale: number }): PdfPageViewport
    render(params: { canvasContext: CanvasRenderingContext2D; viewport: PdfPageViewport }): { promise: Promise<void> }
    getTextContent(): Promise<PdfTextContent>
    getAnnotations(params?: { intent?: string }): Promise<PdfAnnotation[]>
}

export interface PdfDocumentProxy {
    numPages: number
    getPage(pageNumber: number): Promise<PdfPageProxy>
    getOutline(): Promise<PdfOutlineItem[] | null>
    getDestination(id: string): Promise<unknown[] | null>
    getPageIndex(ref: object): Promise<number>
    getMetadata(): Promise<{ info?: Record<string, unknown> }>
    destroy(): void
}
