import { decodeMobiText } from './mobiTextDecoding'

const UNKNOWN_AUTHOR = '未知作者'
const MOBI_MAGIC = 'MOBI'
const EXTH_MAGIC = 'EXTH'
const MOBI_ENCODING_CP1252 = 1252
const EXTH_FLAG_MASK = 0x40
const EXTH_AUTHOR_RECORD_TYPE = 100
const EXTH_TITLE_RECORD_TYPE = 503
const EXTH_COVER_OFFSET_RECORD_TYPE = 201
const EXTH_THUMBNAIL_OFFSET_RECORD_TYPE = 202
const MOBI_TRAILING_FLAGS_MIN_HEADER_LENGTH = 0xE4

interface MobiHeader {
    record0Offset: number
    compression: number
    textRecordCount: number
    mobiHeaderLength: number
    encodingCode: number
    firstImageIndex: number
    fullNameOffset: number
    fullNameLength: number
    exthFlag: number
    extraDataFlags: number
}

interface ExthMetadata {
    title?: string
    author?: string
    coverOffset?: number
    thumbnailOffset?: number
}

export interface MobiParsed {
    title: string
    author: string
    content: string
    cover: string | null
}

function readString(view: DataView, offset: number, length: number): string {
    let s = ''
    for (let i = 0; i < length; i += 1) {
        const index = offset + i
        if (index >= view.byteLength) break
        const c = view.getUint8(index)
        if (c === 0) break
        s += String.fromCharCode(c)
    }
    return s
}

function readUint16Safe(view: DataView, offset: number, fallback = 0): number {
    if (offset < 0 || offset + 2 > view.byteLength) return fallback
    return view.getUint16(offset)
}

function readUint32Safe(view: DataView, offset: number, fallback = 0): number {
    if (offset < 0 || offset + 4 > view.byteLength) return fallback
    return view.getUint32(offset)
}

function sliceSafe(data: Uint8Array, start: number, end: number): Uint8Array {
    const clampedStart = Math.max(0, Math.min(start, data.length))
    const clampedEnd = Math.max(clampedStart, Math.min(end, data.length))
    return data.slice(clampedStart, clampedEnd)
}

function readUint32FromPayload(payload: Uint8Array): number | null {
    if (payload.byteLength < 4) return null
    return new DataView(payload.buffer, payload.byteOffset, payload.byteLength).getUint32(0)
}

function countTrailingEntries(flags: number): number {
    let value = flags >>> 1
    let count = 0
    while (value > 0) {
        count += value & 1
        value >>>= 1
    }
    return count
}

function readTrailingEntrySize(data: Uint8Array): number {
    let size = 0
    const maxBytes = Math.min(4, data.length)
    for (let i = 1; i <= maxBytes; i += 1) {
        const value = data[data.length - i]
        size = (size << 7) | (value & 0x7F)
        if ((value & 0x80) !== 0) return size
    }
    return size
}

function parseRecordOffsets(view: DataView): number[] {
    const recordCount = readUint16Safe(view, 0x4C)
    const records: number[] = []
    for (let i = 0; i < recordCount; i += 1) records.push(readUint32Safe(view, 0x4E + i * 8))
    return records
}

function parseMobiHeader(view: DataView, records: readonly number[]): MobiHeader {
    if (records.length === 0) throw new Error('MOBI parse failed: no PDB records')
    const record0Offset = records[0]
    const magic = readString(view, record0Offset + 0x10, 4)
    if (magic !== MOBI_MAGIC) throw new Error(`MOBI parse failed: invalid header magic "${magic}"`)

    const mobiHeaderLength = readUint32Safe(view, record0Offset + 0x14)
    const extraDataFlags = mobiHeaderLength >= MOBI_TRAILING_FLAGS_MIN_HEADER_LENGTH
        ? readUint16Safe(view, record0Offset + 0xF2)
        : 0
    return {
        record0Offset,
        compression: readUint16Safe(view, record0Offset),
        textRecordCount: readUint16Safe(view, record0Offset + 0x08),
        mobiHeaderLength,
        encodingCode: readUint32Safe(view, record0Offset + 0x1C, MOBI_ENCODING_CP1252),
        firstImageIndex: readUint32Safe(view, record0Offset + 0x6C),
        fullNameOffset: readUint32Safe(view, record0Offset + 0x54),
        fullNameLength: readUint32Safe(view, record0Offset + 0x58),
        exthFlag: readUint32Safe(view, record0Offset + 0x80),
        extraDataFlags,
    }
}

function parseMetadataFromExth(buf: ArrayBuffer, header: MobiHeader): ExthMetadata {
    if ((header.exthFlag & EXTH_FLAG_MASK) === 0) return {}
    const view = new DataView(buf)
    const bytes = new Uint8Array(buf)
    const exthOffset = header.record0Offset + 0x10 + header.mobiHeaderLength
    if (readString(view, exthOffset, 4) !== EXTH_MAGIC) return {}

    const exthCount = readUint32Safe(view, exthOffset + 8)
    const result: ExthMetadata = {}
    let pos = exthOffset + 12
    for (let i = 0; i < exthCount && pos + 8 <= buf.byteLength; i += 1) {
        const type = readUint32Safe(view, pos)
        const length = readUint32Safe(view, pos + 4)
        if (length < 8 || pos + length > buf.byteLength) break
        const payload = bytes.slice(pos + 8, pos + length)
        if (type === EXTH_AUTHOR_RECORD_TYPE && !result.author) result.author = decodeMobiText(payload, header.encodingCode).trim()
        if (type === EXTH_TITLE_RECORD_TYPE && !result.title) result.title = decodeMobiText(payload, header.encodingCode).trim()
        if (type === EXTH_COVER_OFFSET_RECORD_TYPE && result.coverOffset === undefined) result.coverOffset = readUint32FromPayload(payload) ?? undefined
        if (type === EXTH_THUMBNAIL_OFFSET_RECORD_TYPE && result.thumbnailOffset === undefined) result.thumbnailOffset = readUint32FromPayload(payload) ?? undefined
        pos += length
    }
    return result
}

function palmDocDecompress(data: Uint8Array): Uint8Array {
    // 预分配缓冲区（输入的 4 倍），不够时翻倍扩容
    let buf = new Uint8Array(data.length * 4)
    let pos = 0
    let i = 0

    const ensureCapacity = (needed: number) => {
        while (pos + needed > buf.length) {
            const next = new Uint8Array(buf.length * 2)
            next.set(buf)
            buf = next
        }
    }

    while (i < data.length) {
        const byte = data[i++]
        if (byte === 0) {
            ensureCapacity(1)
            buf[pos++] = 0
            continue
        }
        if (byte <= 0x08) {
            ensureCapacity(byte)
            for (let j = 0; j < byte && i < data.length; j += 1) buf[pos++] = data[i++]
            continue
        }
        if (byte <= 0x7F) {
            ensureCapacity(1)
            buf[pos++] = byte
            continue
        }
        if (byte <= 0xBF) {
            if (i >= data.length) break
            const next = data[i++]
            const distance = (((byte << 8) | next) >> 3) & 0x07FF
            const length = (next & 0x07) + 3
            if (distance <= 0 || distance > pos) continue
            ensureCapacity(length)
            for (let j = 0; j < length; j += 1) buf[pos++] = buf[pos - distance] ?? 0
            continue
        }
        ensureCapacity(2)
        buf[pos++] = 0x20
        buf[pos++] = byte ^ 0x80
    }
    return buf.slice(0, pos)
}

function trimTrailingEntries(data: Uint8Array, flags: number): Uint8Array {
    let result = data
    const trailers = countTrailingEntries(flags)
    for (let i = 0; i < trailers && result.length >= 4; i += 1) {
        const size = readTrailingEntrySize(result)
        if (size <= 0 || size > result.length) break
        result = result.slice(0, result.length - size)
    }
    if ((flags & 1) !== 0 && result.length > 0) {
        const extra = (result[result.length - 1] & 0x03) + 1
        if (extra > 0 && extra <= result.length) result = result.slice(0, result.length - extra)
    }
    return result
}

function getRecordBytes(buffer: Uint8Array, recordOffsets: readonly number[], index: number): Uint8Array {
    if (index < 0 || index >= recordOffsets.length) return new Uint8Array(0)
    const start = recordOffsets[index]
    const end = index + 1 < recordOffsets.length ? recordOffsets[index + 1] : buffer.byteLength
    return sliceSafe(buffer, start, end)
}

function detectImageMime(data: Uint8Array): string | null {
    if (data.length >= 3 && data[0] === 0xFF && data[1] === 0xD8 && data[2] === 0xFF) return 'image/jpeg'
    if (data.length >= 4 && data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4E && data[3] === 0x47) return 'image/png'
    if (data.length >= 4 && data[0] === 0x47 && data[1] === 0x49 && data[2] === 0x46 && data[3] === 0x38) return 'image/gif'
    if (data.length >= 12 && data[0] === 0x52 && data[1] === 0x49 && data[2] === 0x46 && data[3] === 0x46 && data[8] === 0x57 && data[9] === 0x45 && data[10] === 0x42 && data[11] === 0x50) return 'image/webp'
    return null
}

function extractCoverDataUrl(
    buffer: Uint8Array,
    recordOffsets: readonly number[],
    header: MobiHeader,
    coverOffset?: number,
    thumbnailOffset?: number,
): string | null {
    const offset = typeof coverOffset === 'number' ? coverOffset : thumbnailOffset
    if (offset === undefined || !Number.isFinite(offset)) return null
    const candidates = [header.firstImageIndex + offset, offset]
    for (const index of candidates) {
        const bytes = getRecordBytes(buffer, recordOffsets, index)
        const mime = detectImageMime(bytes)
        if (!mime) continue
        // 使用 Blob URL 替代 data URL，避免 base64 编码的栈溢出和内存膨胀
        const blob = new Blob([bytes], { type: mime })
        return URL.createObjectURL(blob)
    }
    return null
}

function decompressRecordPayload(data: Uint8Array, header: MobiHeader): Uint8Array {
    const trimmed = trimTrailingEntries(data, header.extraDataFlags)
    if (header.compression === 1) return trimmed
    if (header.compression === 2) return palmDocDecompress(trimmed)
    throw new Error(`MOBI parse failed: unsupported compression type ${header.compression}`)
}

function concatUint8Arrays(arrays: Uint8Array[]): Uint8Array {
    let totalLength = 0
    for (const arr of arrays) totalLength += arr.length
    const result = new Uint8Array(totalLength)
    let offset = 0
    for (const arr of arrays) {
        result.set(arr, offset)
        offset += arr.length
    }
    return result
}

export function parseMobiBuffer(buf: ArrayBuffer): MobiParsed {
    const view = new DataView(buf)
    const bytes = new Uint8Array(buf)
    const name = readString(view, 0, 32).trim()
    const records = parseRecordOffsets(view)
    const header = parseMobiHeader(view, records)
    const exth = parseMetadataFromExth(buf, header)

    const titleBytes = sliceSafe(
        bytes,
        header.record0Offset + header.fullNameOffset,
        header.record0Offset + header.fullNameOffset + header.fullNameLength,
    )
    const decodedTitle = titleBytes.length > 0 ? decodeMobiText(titleBytes, header.encodingCode).trim() : ''
    const title = exth.title || decodedTitle || name || 'Untitled'
    const author = exth.author || UNKNOWN_AUTHOR
    const cover = extractCoverDataUrl(bytes, records, header, exth.coverOffset, exth.thumbnailOffset)

    let content = ''
    const textChunks: Uint8Array[] = []
    for (let i = 1; i <= header.textRecordCount && i < records.length; i += 1) {
        textChunks.push(decompressRecordPayload(getRecordBytes(bytes, records, i), header))
    }
    if (textChunks.length > 0) {
        content = decodeMobiText(concatUint8Arrays(textChunks), header.encodingCode)
    }
    if (cover && !content.includes(cover)) {
        const safeCover = cover.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        content = `<div class="mobi-cover"><img src="${safeCover}" alt="cover" /></div><mbp:pagebreak/>${content}`
    }
    return { title, author, content, cover }
}
