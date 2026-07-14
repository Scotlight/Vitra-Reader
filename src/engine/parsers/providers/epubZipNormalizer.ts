import { strFromU8, unzipSync, zipSync } from 'fflate'

const ZIP_LOCAL_FILE_HEADER = 0x04034b50
const EPUB_MIMETYPE = 'application/epub+zip'
const MAX_LEADING_BYTES_TO_SCAN = 1024 * 1024

const normalizedArchiveCache = new WeakMap<ArrayBuffer, ArrayBuffer>()

/**
 * 把带前导字节的 EPUB 归一为从 ZIP local file header 开始的标准 archive。
 * 某些同步/导出链路会在 ZIP 前保留包装字节；只扫描受限前缀，既支持这类文件，也避免
 * 对损坏的大文件做无界线性搜索。重新压缩采用 level 0，目标是重建 ZIP 偏移而非压缩体积。
 */
export function normalizeEpubArchiveBuffer(buffer: ArrayBuffer): ArrayBuffer {
    const cached = normalizedArchiveCache.get(buffer)
    if (cached) return cached

    if (startsWithLocalFileHeader(buffer)) {
        normalizedArchiveCache.set(buffer, buffer)
        return buffer
    }

    const localHeaderOffset = findLocalFileHeaderOffset(buffer, MAX_LEADING_BYTES_TO_SCAN)
    if (localHeaderOffset < 0) {
        throw new Error('[EpubZipNormalizer] Invalid EPUB ZIP archive: missing local file header')
    }

    // 先尝试原始 buffer：部分 ZIP 实现可容忍前导字节；失败后才从已定位的 header 解压。
    const entries = tryUnzipEpubEntries(buffer, 0)
    const epubEntries = entries && isEpubArchiveEntries(entries)
        ? entries
        : localHeaderOffset > 0
            ? unzipEpubEntries(buffer, localHeaderOffset)
            : entries

    if (!epubEntries || !isEpubArchiveEntries(epubEntries)) {
        throw new Error('[EpubZipNormalizer] Invalid EPUB ZIP archive: missing EPUB container')
    }

    const normalized = toExactArrayBuffer(zipSync(epubEntries, { level: 0 }))
    normalizedArchiveCache.set(buffer, normalized)
    return normalized
}

function unzipEpubEntries(buffer: ArrayBuffer, offset: number): Record<string, Uint8Array> {
    try {
        return unzipSync(new Uint8Array(buffer, offset))
    } catch (error) {
        throw new Error(`[EpubZipNormalizer] Invalid EPUB ZIP archive: ${String(error)}`)
    }
}

function tryUnzipEpubEntries(buffer: ArrayBuffer, offset: number): Record<string, Uint8Array> | null {
    try {
        return unzipSync(new Uint8Array(buffer, offset))
    } catch {
        return null
    }
}

function isEpubArchiveEntries(entries: Record<string, Uint8Array>): boolean {
    const normalizedNames = new Map(
        Object.keys(entries).map((name) => [normalizeZipEntryName(name), name]),
    )
    // container.xml 是 EPUB 的权威结构标记；mimetype 是为兼容非标准归档保留的后备判断。
    if (normalizedNames.has('meta-inf/container.xml')) return true

    const mimetypeName = normalizedNames.get('mimetype')
    if (!mimetypeName) return false
    const mimetypeEntry = entries[mimetypeName]
    return Boolean(mimetypeEntry && strFromU8(mimetypeEntry).trim() === EPUB_MIMETYPE)
}

function startsWithLocalFileHeader(buffer: ArrayBuffer): boolean {
    if (buffer.byteLength < 4) return false
    return new DataView(buffer, 0, 4).getUint32(0, true) === ZIP_LOCAL_FILE_HEADER
}

function findLocalFileHeaderOffset(buffer: ArrayBuffer, maxOffset: number): number {
    if (buffer.byteLength < 4) return -1
    const view = new DataView(buffer)
    const limit = Math.min(buffer.byteLength - 4, maxOffset)
    for (let offset = 0; offset <= limit; offset += 1) {
        if (view.getUint32(offset, true) === ZIP_LOCAL_FILE_HEADER) {
            return offset
        }
    }
    return -1
}

function normalizeZipEntryName(name: string): string {
    return name.replace(/\\/g, '/').toLowerCase()
}

function toExactArrayBuffer(bytes: Uint8Array): ArrayBuffer {
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
}
