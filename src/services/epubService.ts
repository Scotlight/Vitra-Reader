import ePub from '@likecoin/epub-ts'
import type { EpubBookInternal } from '@/types/epubjs'
import { normalizeEpubArchiveBuffer } from '@/engine/parsers/providers/epubZipNormalizer'

export interface ParsedBook {
    title: string
    author: string
    description?: string
    cover?: string // Base64 or Blob URL
    publisher?: string
    language?: string
}

/**
 * Parse .epub file array buffer to extract metadata and cover
 * @param data ArrayBuffer of the .epub file
 */
export async function parseEpub(data: ArrayBuffer): Promise<ParsedBook> {
    const book = ePub(normalizeEpubArchiveBuffer(data), { replacements: 'none' })

    try {
        // 1. Wait for metadata to be loaded
        await book.ready

        // 2. Extract standard metadata
        const { title, creator, description, publisher, language } = (book as unknown as EpubBookInternal).package.metadata

        // 3. Extract Cover Image
        let cover: string | undefined
        try {
            const coverUrl = await book.coverUrl()
            if (coverUrl) {
                // If coverUrl is a blob URL (created by the EPUB archive), we can use it directly?
                // No, for IndexedDB storage we need base64 or a persistent Blob.
                // The EPUB runtime `coverUrl()` often returns a blob: url when using ArrayBuffer.
                // We need to fetch it to get the blob/base64.

                const response = await fetch(coverUrl)
                const blob = await response.blob()
                cover = await blobToBase64(blob)
            }
        } catch (error) {
            console.warn('Failed to extract cover:', error)
        }

        return {
            title: title || 'Untitled',
            author: creator || 'Unknown Author',
            description,
            publisher,
            language,
            cover,
        }
    } finally {
        book.destroy()
    }
}

function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onloadend = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(blob)
    })
}
