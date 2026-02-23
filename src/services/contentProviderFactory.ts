import type { ContentProvider, BookFormat } from './contentProvider'

export async function createContentProvider(format: BookFormat, data: ArrayBuffer): Promise<ContentProvider> {
    switch (format) {
        case 'epub': {
            const { EpubContentProvider } = await import('./providers/epubProvider')
            return new EpubContentProvider(data)
        }
        case 'pdf': {
            const { PdfContentProvider } = await import('./providers/pdfProvider')
            return new PdfContentProvider(data)
        }
        case 'txt': {
            const { TxtContentProvider } = await import('./providers/txtProvider')
            return new TxtContentProvider(data)
        }
        case 'mobi':
        case 'azw':
        case 'azw3': {
            const { MobiContentProvider } = await import('./providers/mobiProvider')
            return new MobiContentProvider(data)
        }
        case 'html':
        case 'xml': {
            const { HtmlContentProvider } = await import('./providers/htmlProvider')
            return new HtmlContentProvider(data)
        }
        case 'md': {
            const { MdContentProvider } = await import('./providers/mdProvider')
            return new MdContentProvider(data)
        }
        case 'fb2': {
            const { Fb2ContentProvider } = await import('./providers/fb2Provider')
            return new Fb2ContentProvider(data)
        }
    }
}

export async function parseBookMetadata(format: BookFormat, data: ArrayBuffer, filename: string) {
    switch (format) {
        case 'epub': {
            const { parseEpubMetadata } = await import('./providers/epubProvider')
            return parseEpubMetadata(data)
        }
        case 'pdf': {
            const { parsePdfMetadata } = await import('./providers/pdfProvider')
            return parsePdfMetadata(data)
        }
        case 'txt': {
            const { parseTxtMetadata } = await import('./providers/txtProvider')
            return parseTxtMetadata(data, filename)
        }
        case 'mobi':
        case 'azw':
        case 'azw3': {
            const { parseMobiMetadata } = await import('./providers/mobiProvider')
            return parseMobiMetadata(data)
        }
        case 'html':
        case 'xml': {
            const { parseHtmlMetadata } = await import('./providers/htmlProvider')
            return parseHtmlMetadata(data, filename)
        }
        case 'md': {
            const { parseMdMetadata } = await import('./providers/mdProvider')
            return parseMdMetadata(data, filename)
        }
        case 'fb2': {
            const { parseFb2Metadata } = await import('./providers/fb2Provider')
            return parseFb2Metadata(data, filename)
        }
    }
}
