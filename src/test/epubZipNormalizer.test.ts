import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { unzipSync } from 'fflate'
import { normalizeEpubArchiveBuffer } from '@/engine/parsers/providers/epubZipNormalizer'

const ZIP_LOCAL_FILE_HEADER = [0x50, 0x4b, 0x03, 0x04] as const
const ZIP_CENTRAL_DIRECTORY_HEADER = 0x02014b50
const ZIP_END_OF_CENTRAL_DIRECTORY = 0x06054b50

async function createMinimalEpubZip(): Promise<ArrayBuffer> {
    const zip = new JSZip()
    zip.file('mimetype', 'application/epub+zip')
    zip.file('META-INF/container.xml', '<container />')
    zip.file('OEBPS/content.opf', '<package />')
    const zipped = await zip.generateAsync({ type: 'uint8array', compression: 'STORE' })
    return toExactArrayBuffer(zipped)
}

function prependBytes(prefix: readonly number[], buffer: ArrayBuffer): ArrayBuffer {
    const source = new Uint8Array(buffer)
    const output = new Uint8Array(prefix.length + source.byteLength)
    output.set(prefix, 0)
    output.set(source, prefix.length)
    return output.buffer
}

function createOffsetPrefixedZip(prefix: readonly number[], buffer: ArrayBuffer): ArrayBuffer {
    const output = prependBytes(prefix, buffer)
    const view = new DataView(output)
    for (let offset = prefix.length; offset + 46 <= output.byteLength; offset += 1) {
        if (view.getUint32(offset, true) === ZIP_CENTRAL_DIRECTORY_HEADER) {
            const localHeaderOffset = view.getUint32(offset + 42, true)
            view.setUint32(offset + 42, localHeaderOffset + prefix.length, true)
        }
    }

    const eocdOffset = findLastSignatureOffset(output, ZIP_END_OF_CENTRAL_DIRECTORY)
    if (eocdOffset >= prefix.length && eocdOffset + 20 <= output.byteLength) {
        const centralDirectoryOffset = view.getUint32(eocdOffset + 16, true)
        view.setUint32(eocdOffset + 16, centralDirectoryOffset + prefix.length, true)
    }

    return output
}

function findLastSignatureOffset(buffer: ArrayBuffer, signature: number): number {
    const view = new DataView(buffer)
    for (let offset = buffer.byteLength - 4; offset >= 0; offset -= 1) {
        if (view.getUint32(offset, true) === signature) return offset
    }
    return -1
}

function startsWithLocalFileHeader(buffer: ArrayBuffer): boolean {
    const bytes = new Uint8Array(buffer, 0, 4)
    return ZIP_LOCAL_FILE_HEADER.every((value, index) => bytes[index] === value)
}

function toExactArrayBuffer(bytes: Uint8Array): ArrayBuffer {
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
}

describe('epubZipNormalizer', () => {
    it('标准 EPUB ZIP 走零拷贝快路径', async () => {
        const input = await createMinimalEpubZip()

        expect(normalizeEpubArchiveBuffer(input)).toBe(input)
    })

    it('修复前置垃圾导致 local header 偏移的 EPUB ZIP', async () => {
        const input = await createMinimalEpubZip()
        const malformed = createOffsetPrefixedZip([
            0x50, 0x4b, 0x05, 0x06,
            0, 0, 0, 0,
            0, 0, 0, 0,
            0, 0, 0, 0,
            0, 0, 0, 0,
            0, 0,
            0xde, 0xad, 0xbe, 0xef,
        ], input)

        const normalized = normalizeEpubArchiveBuffer(malformed)
        const entries = unzipSync(new Uint8Array(normalized))

        expect(normalized).not.toBe(malformed)
        expect(startsWithLocalFileHeader(normalized)).toBe(true)
        expect(Object.keys(entries)).toContain('META-INF/container.xml')
        expect(Object.keys(entries)).toContain('mimetype')
    })

    it('非 EPUB 的畸形 ZIP 候选会快速失败', async () => {
        const zip = new JSZip()
        zip.file('file.txt', 'plain')
        const plainZipBytes = await zip.generateAsync({ type: 'uint8array', compression: 'STORE' })
        const plainZip = toExactArrayBuffer(plainZipBytes)
        const malformed = createOffsetPrefixedZip([0x50, 0x4b, 0x05, 0x06, 0, 0, 0, 0], plainZip)

        expect(() => normalizeEpubArchiveBuffer(malformed)).toThrow(/Invalid EPUB ZIP archive/)
    })
})
