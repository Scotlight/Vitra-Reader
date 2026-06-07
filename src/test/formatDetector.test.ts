import { describe, expect, it } from 'vitest'
import { detectFormat } from '@/engine/core/formatDetector'

const ZIP_LOCAL_HEADER_SIGNATURE = 0x04034b50

interface ZipFixtureEntry {
    name: string
    content?: string
}

function encodeAscii(text: string): Uint8Array {
    return new TextEncoder().encode(text)
}

function createZipFixture(entries: readonly ZipFixtureEntry[]): ArrayBuffer {
    const encodedEntries = entries.map((entry) => ({
        name: encodeAscii(entry.name),
        data: encodeAscii(entry.content ?? ''),
    }))
    const totalSize = encodedEntries.reduce((sum, entry) => sum + 30 + entry.name.length + entry.data.length, 0)
    const bytes = new Uint8Array(totalSize)
    const view = new DataView(bytes.buffer)
    let offset = 0

    for (const entry of encodedEntries) {
        view.setUint32(offset, ZIP_LOCAL_HEADER_SIGNATURE, true)
        view.setUint16(offset + 4, 20, true)
        view.setUint16(offset + 8, 0, true)
        view.setUint32(offset + 18, entry.data.length, true)
        view.setUint32(offset + 22, entry.data.length, true)
        view.setUint16(offset + 26, entry.name.length, true)
        view.setUint16(offset + 28, 0, true)
        bytes.set(entry.name, offset + 30)
        bytes.set(entry.data, offset + 30 + entry.name.length)
        offset += 30 + entry.name.length + entry.data.length
    }

    return bytes.buffer
}

function createMobiFixture(): ArrayBuffer {
    const bytes = new Uint8Array(80)
    bytes.set(encodeAscii('BOOKMOBI'), 60)
    return bytes.buffer
}

function createTarFixture(): ArrayBuffer {
    const bytes = new Uint8Array(300)
    bytes.set(encodeAscii('ustar'), 257)
    return bytes.buffer
}

describe('formatDetector ZIP 子类型检测', () => {
    it('识别包含 META-INF/container.xml 的 EPUB', async () => {
        const buffer = createZipFixture([
            { name: 'META-INF/container.xml', content: '<container />' },
        ])

        await expect(detectFormat(buffer, 'book.zip')).resolves.toBe('EPUB')
    })

    it('识别 mimetype 为 application/epub+zip 的 EPUB', async () => {
        const buffer = createZipFixture([
            { name: 'mimetype', content: 'application/epub+zip' },
        ])

        await expect(detectFormat(buffer, 'book.zip')).resolves.toBe('EPUB')
    })

    it('识别包含 [Content_Types].xml 和 word/ 目录的 DOCX', async () => {
        const buffer = createZipFixture([
            { name: '[Content_Types].xml', content: '<Types />' },
            { name: 'word/document.xml', content: '<w:document />' },
        ])

        await expect(detectFormat(buffer, 'document.zip')).resolves.toBe('DOCX')
    })

    it('识别全图片 ZIP 为 CBZ', async () => {
        const buffer = createZipFixture([
            { name: 'page01.jpg', content: 'jpeg' },
            { name: 'page02.png', content: 'png' },
        ])

        await expect(detectFormat(buffer, 'comic.zip')).resolves.toBe('CBZ')
    })

    it('普通 ZIP 按扩展名 fallback', async () => {
        const buffer = createZipFixture([
            { name: 'content.bin', content: 'data' },
        ])

        await expect(detectFormat(buffer, 'fallback.epub')).resolves.toBe('EPUB')
    })
})

describe('formatDetector 二进制 magic 检测', () => {
    it('识别 PDF magic', async () => {
        await expect(detectFormat(encodeAscii('%PDF-1.7').buffer, 'book.epub')).resolves.toBe('PDF')
    })

    it('识别 MOBI magic', async () => {
        await expect(detectFormat(createMobiFixture(), 'book.mobi')).resolves.toBe('MOBI')
    })

    it('MOBI magic 结合扩展名识别 AZW3', async () => {
        await expect(detectFormat(createMobiFixture(), 'book.azw3')).resolves.toBe('AZW3')
    })

    it('识别 RAR magic 为 CBR', async () => {
        const buffer = new Uint8Array([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x00]).buffer
        await expect(detectFormat(buffer, 'comic.rar')).resolves.toBe('CBR')
    })

    it('识别 7z magic 为 CB7', async () => {
        const buffer = new Uint8Array([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c, 0x00]).buffer
        await expect(detectFormat(buffer, 'comic.7z')).resolves.toBe('CB7')
    })

    it('识别 tar ustar 为 CBT', async () => {
        await expect(detectFormat(createTarFixture(), 'comic.tar')).resolves.toBe('CBT')
    })
})

describe('formatDetector 扩展名 fallback', () => {
    it('识别 TXT 扩展名', async () => {
        await expect(detectFormat(encodeAscii('plain text').buffer, 'note.txt')).resolves.toBe('TXT')
    })

    it('识别 FB2 扩展名', async () => {
        await expect(detectFormat(encodeAscii('<FictionBook />').buffer, 'book.fb2')).resolves.toBe('FB2')
    })

    it('未知扩展名 fallback 为 TXT', async () => {
        await expect(detectFormat(encodeAscii('unknown').buffer, 'book.unknown')).resolves.toBe('TXT')
    })
})
