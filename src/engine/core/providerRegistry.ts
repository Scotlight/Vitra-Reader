import type { BookFormat, ContentProvider } from './contentProvider'

export type ProviderBackedFormat =
    | 'epub'
    | 'pdf'
    | 'txt'
    | 'mobi'
    | 'azw'
    | 'azw3'
    | 'html'
    | 'xml'
    | 'md'
    | 'fb2'

const PROVIDER_BACKED_FORMAT_SET: ReadonlySet<BookFormat> = new Set([
    'epub',
    'pdf',
    'txt',
    'mobi',
    'azw',
    'azw3',
    'html',
    'xml',
    'md',
    'fb2',
])

export function isProviderBackedFormat(format: BookFormat): format is ProviderBackedFormat {
    return PROVIDER_BACKED_FORMAT_SET.has(format)
}

export async function createProviderForBackedFormat(
    format: ProviderBackedFormat,
    data: ArrayBuffer,
): Promise<ContentProvider> {
    switch (format) {
        case 'epub': {
            const { EpubContentProvider } = await import('../parsers/providers/epubProvider')
            return new EpubContentProvider(data)
        }
        case 'pdf': {
            const { PdfContentProvider } = await import('../parsers/providers/pdfProvider')
            return new PdfContentProvider(data)
        }
        case 'txt': {
            const { TxtContentProvider } = await import('../parsers/providers/txtProvider')
            return new TxtContentProvider(data)
        }
        case 'mobi':
        case 'azw':
        case 'azw3': {
            const { MobiContentProvider } = await import('../parsers/providers/mobiProvider')
            return new MobiContentProvider(data)
        }
        case 'html':
        case 'xml': {
            const { HtmlContentProvider } = await import('../parsers/providers/htmlProvider')
            return new HtmlContentProvider(data)
        }
        case 'md': {
            const { MdContentProvider } = await import('../parsers/providers/mdProvider')
            return new MdContentProvider(data)
        }
        case 'fb2': {
            const { Fb2ContentProvider } = await import('../parsers/providers/fb2Provider')
            return new Fb2ContentProvider(data)
        }
        default:
            throw new Error(`[providerRegistry] 不支持的 provider-backed 格式: ${format}`)
    }
}

export async function parseMetadataForBackedFormat(
    format: ProviderBackedFormat,
    data: ArrayBuffer,
    filename: string,
) {
    switch (format) {
        case 'epub': {
            const { parseEpubMetadata } = await import('../parsers/providers/epubProvider')
            return parseEpubMetadata(data)
        }
        case 'pdf': {
            const { parsePdfMetadata } = await import('../parsers/providers/pdfProvider')
            return parsePdfMetadata(data)
        }
        case 'txt': {
            const { parseTxtMetadata } = await import('../parsers/providers/txtProvider')
            return parseTxtMetadata(data, filename)
        }
        case 'mobi':
        case 'azw':
        case 'azw3': {
            const { parseMobiMetadata } = await import('../parsers/providers/mobiProvider')
            return parseMobiMetadata(data)
        }
        case 'html':
        case 'xml': {
            const { parseHtmlMetadata } = await import('../parsers/providers/htmlProvider')
            return parseHtmlMetadata(data, filename)
        }
        case 'md': {
            const { parseMdMetadata } = await import('../parsers/providers/mdProvider')
            return parseMdMetadata(data, filename)
        }
        case 'fb2': {
            const { parseFb2Metadata } = await import('../parsers/providers/fb2Provider')
            return parseFb2Metadata(data, filename)
        }
        default:
            throw new Error(`[providerRegistry] 不支持的 metadata 格式: ${format}`)
    }
}

