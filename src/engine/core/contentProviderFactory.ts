import type { ContentProvider, BookFormat } from './contentProvider'
import { stripBookExtension } from './contentProvider'
import {
    createProviderForBackedFormat,
    isProviderBackedFormat,
    parseMetadataForBackedFormat,
} from './providerRegistry'

function buildAdapterBookId(format: BookFormat): string {
    return `factory-${format}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

async function createProviderViaPipeline(format: BookFormat, data: ArrayBuffer): Promise<ContentProvider> {
    const { BookPipeline } = await import('../pipeline/pipeline')
    const { BookContentAdapter } = await import('../pipeline/contentAdapter')
    const pipeline = new BookPipeline()
    const handle = await pipeline.open({
        buffer: data,
        filename: `factory-input.${format}`,
    })
    const book = await handle.ready
    return new BookContentAdapter(book, buildAdapterBookId(format), data)
}

export async function createContentProvider(format: BookFormat, data: ArrayBuffer): Promise<ContentProvider> {
    if (format === 'epub' || format === 'pdf' || format === 'txt') {
        return createProviderForBackedFormat(format, data)
    }

    if (isProviderBackedFormat(format)) {
        return createProviderViaPipeline(format, data)
    }

    return createProviderViaPipeline(format, data)
}

export async function parseBookMetadata(format: BookFormat, data: ArrayBuffer, filename: string) {
    if (format === 'epub' || format === 'pdf' || format === 'txt') {
        return parseMetadataForBackedFormat(format, data, filename)
    }

    const { BookPipeline } = await import('../pipeline/pipeline')
    const pipeline = new BookPipeline()
    const handle = await pipeline.open({ buffer: data, filename })
    const metadata = await handle.metadata
    return {
        title: metadata.title || stripBookExtension(filename),
        author: metadata.author.join(', ') || '',
        description: metadata.description || '',
        cover: null,
        publisher: metadata.publisher || '',
        language: metadata.language || '',
    }
}
