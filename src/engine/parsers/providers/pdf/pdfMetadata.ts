import { openPdfDocumentWithFallback } from './pdfRuntime'

export async function parsePdfMetadata(data: ArrayBuffer) {
    const doc = await openPdfDocumentWithFallback(new Uint8Array(data))
    try {
        const meta = await doc.getMetadata()
        const info = meta?.info
        const title = (info?.Title as string) || ''
        const author = (info?.Author as string) || '未知作者'
        return { title, author, format: 'pdf' as const }
    } finally {
        doc.destroy()
    }
}
