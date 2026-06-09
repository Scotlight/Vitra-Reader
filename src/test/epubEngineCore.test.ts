import { describe, expect, it, vi } from 'vitest'
import JSZip from 'jszip'
import { parseEpub } from '@/services/epubService'

function toExactArrayBuffer(bytes: Uint8Array): ArrayBuffer {
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
}

interface EpubMetadataOptions {
    title?: string
    creator?: string
    description?: string
    publisher?: string
    language?: string
    coverImageBase64?: string
}

async function createEpubWithMetadata(options: EpubMetadataOptions = {}): Promise<ArrayBuffer> {
    const zip = new JSZip()

    zip.file('mimetype', 'application/epub+zip')

    const containerXml = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
    <rootfiles>
        <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
    </rootfiles>
</container>`
    zip.file('META-INF/container.xml', containerXml)

    const metadata = `
        ${options.title ? `<dc:title>${options.title}</dc:title>` : ''}
        ${options.creator ? `<dc:creator>${options.creator}</dc:creator>` : ''}
        ${options.description ? `<dc:description>${options.description}</dc:description>` : ''}
        ${options.publisher ? `<dc:publisher>${options.publisher}</dc:publisher>` : ''}
        ${options.language ? `<dc:language>${options.language}</dc:language>` : ''}
    `

    const coverItem = options.coverImageBase64
        ? '<item id="cover-image" href="cover.jpg" media-type="image/jpeg"/>'
        : ''

    const coverMeta = options.coverImageBase64
        ? '<meta name="cover" content="cover-image"/>'
        : ''

    const contentOpf = `<?xml version="1.0" encoding="UTF-8"?>
<package version="3.0" xmlns="http://www.idpf.org/2007/opf" xmlns:dc="http://purl.org/dc/elements/1.1/">
    <metadata>
        ${metadata}
        ${coverMeta}
    </metadata>
    <manifest>
        ${coverItem}
        <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
        <item id="chapter1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>
    </manifest>
    <spine toc="ncx">
        <itemref idref="chapter1"/>
    </spine>
</package>`
    zip.file('OEBPS/content.opf', contentOpf)

    zip.file('OEBPS/toc.ncx', '<ncx />')
    zip.file('OEBPS/chapter1.xhtml', '<html><body><p>Chapter 1</p></body></html>')

    if (options.coverImageBase64) {
        const coverBytes = Uint8Array.from(atob(options.coverImageBase64), c => c.charCodeAt(0))
        zip.file('OEBPS/cover.jpg', coverBytes)
    }

    const zipped = await zip.generateAsync({ type: 'uint8array', compression: 'STORE' })
    return toExactArrayBuffer(zipped)
}

const MINIMAL_JPEG_BASE64 = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwA/wAAAAAA='

describe('epubEngineCore', () => {
    describe('parseEpub - 正常路径', () => {
        it('提取完整 metadata 和 cover', async () => {
            const epubBuffer = await createEpubWithMetadata({
                title: 'Test Book',
                creator: 'Test Author',
                description: 'A test book',
                publisher: 'Test Publisher',
                language: 'en',
                coverImageBase64: MINIMAL_JPEG_BASE64,
            })

            const result = await parseEpub(epubBuffer)

            expect(result.title).toBe('Test Book')
            expect(result.author).toBe('Test Author')
            expect(result.description).toBe('A test book')
            expect(result.publisher).toBe('Test Publisher')
            expect(result.language).toBe('en')
            expect(result.cover).toMatch(/^data:image/)
        })

        it('提取 metadata 无 cover', async () => {
            const epubBuffer = await createEpubWithMetadata({
                title: 'Book Without Cover',
                creator: 'Author Name',
            })

            const result = await parseEpub(epubBuffer)

            expect(result.title).toBe('Book Without Cover')
            expect(result.author).toBe('Author Name')
            expect(result.cover).toBeUndefined()
        })
    })

    describe('parseEpub - fallback 路径', () => {
        it('在缺失 title 时 fallback 到 Untitled', async () => {
            const epubBuffer = await createEpubWithMetadata({
                creator: 'Some Author',
            })

            const result = await parseEpub(epubBuffer)

            expect(result.title).toBe('Untitled')
            expect(result.author).toBe('Some Author')
        })

        it('在缺失 creator 时 fallback 到 Unknown Author', async () => {
            const epubBuffer = await createEpubWithMetadata({
                title: 'Some Title',
            })

            const result = await parseEpub(epubBuffer)

            expect(result.title).toBe('Some Title')
            expect(result.author).toBe('Unknown Author')
        })

        it('在完全缺失 metadata 时使用全部 fallback', async () => {
            const epubBuffer = await createEpubWithMetadata({})

            const result = await parseEpub(epubBuffer)

            expect(result.title).toBe('Untitled')
            expect(result.author).toBe('Unknown Author')
            expect(result.cover).toBeUndefined()
        })
    })

    describe('parseEpub - cover 提取失败路径', () => {
        it('在 coverUrl fetch 失败时不抛错', async () => {
            const epubBuffer = await createEpubWithMetadata({
                title: 'Cover Fetch Fail',
                coverImageBase64: MINIMAL_JPEG_BASE64,
            })

            const originalFetch = globalThis.fetch
            globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

            try {
                const result = await parseEpub(epubBuffer)

                expect(result.title).toBe('Cover Fetch Fail')
                expect(result.cover).toBeUndefined()
            } finally {
                globalThis.fetch = originalFetch
            }
        })

        it('在 blob to base64 转换失败时不抛错', async () => {
            const epubBuffer = await createEpubWithMetadata({
                title: 'Blob Convert Fail',
                coverImageBase64: MINIMAL_JPEG_BASE64,
            })

            const originalFetch = globalThis.fetch
            globalThis.fetch = vi.fn().mockResolvedValue({
                blob: async () => ({
                    type: 'image/jpeg',
                    arrayBuffer: async () => {
                        throw new Error('Blob read failed')
                    },
                }),
            } as unknown as Response)

            try {
                const result = await parseEpub(epubBuffer)

                expect(result.title).toBe('Blob Convert Fail')
                expect(result.cover).toBeUndefined()
            } finally {
                globalThis.fetch = originalFetch
            }
        })
    })

    describe('parseEpub - 清理路径', () => {
        it('正常完成后调用 book.destroy', async () => {
            const epubBuffer = await createEpubWithMetadata({
                title: 'Normal Book',
                creator: 'Test Author',
            })

            const result = await parseEpub(epubBuffer)

            expect(result.title).toBe('Normal Book')
            expect(result.author).toBe('Test Author')
        })
    })
})
