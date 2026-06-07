import { describe, expect, it } from 'vitest'
import { parseMobiBuffer } from '@/engine/parsers/providers/mobiParser'

const PDB_RECORD_COUNT_OFFSET = 0x4C
const PDB_RECORD_TABLE_OFFSET = 0x4E
const DEFAULT_RECORD_0_OFFSET = 0x90
const MOBI_HEADER_LENGTH = 0xE4
const MOBI_EXTH_OFFSET = 0x10 + MOBI_HEADER_LENGTH
const FULL_NAME_OFFSET = 0x140
const UTF8_ENCODING = 65001

interface ExthFixtureRecord {
    type: number
    payload: Uint8Array
    damagedLength?: number
}

interface MobiFixtureOptions {
    name?: string
    compression?: number
    textRecords?: Uint8Array[]
    textRecordCount?: number
    fullName?: string
    exthRecords?: ExthFixtureRecord[]
    exthFlag?: boolean
    firstImageIndex?: number
    imageRecords?: Uint8Array[]
    record0Offset?: number
    recordOffsets?: number[]
    recordCount?: number
    includeMobiMagic?: boolean
}

function bytes(text: string): Uint8Array {
    return new TextEncoder().encode(text)
}

function uint32(value: number): Uint8Array {
    const result = new Uint8Array(4)
    new DataView(result.buffer).setUint32(0, value)
    return result
}

function jpegBytes(): Uint8Array {
    return new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00])
}

function writeAscii(target: Uint8Array, offset: number, value: string): void {
    target.set(bytes(value), offset)
}

function buildExth(records: readonly ExthFixtureRecord[]): Uint8Array {
    const size = 12 + records.reduce((sum, record) => sum + 8 + record.payload.length, 0)
    const result = new Uint8Array(size)
    const view = new DataView(result.buffer)
    writeAscii(result, 0, 'EXTH')
    view.setUint32(4, size)
    view.setUint32(8, records.length)
    let offset = 12
    for (const record of records) {
        const length = record.damagedLength ?? 8 + record.payload.length
        view.setUint32(offset, record.type)
        view.setUint32(offset + 4, length)
        result.set(record.payload, offset + 8)
        offset += 8 + record.payload.length
    }
    return result
}

function buildRecord0(options: Required<Pick<MobiFixtureOptions, 'compression' | 'fullName' | 'includeMobiMagic'>> & MobiFixtureOptions): Uint8Array {
    const exth = options.exthRecords ? buildExth(options.exthRecords) : new Uint8Array(0)
    const title = bytes(options.fullName)
    const record0Length = Math.max(
        0x180,
        MOBI_EXTH_OFFSET + exth.length + 8,
        FULL_NAME_OFFSET + title.length + 8,
    )
    const record0 = new Uint8Array(record0Length)
    const view = new DataView(record0.buffer)
    view.setUint16(0, options.compression)
    view.setUint16(0x08, options.textRecordCount ?? options.textRecords?.length ?? 0)
    if (options.includeMobiMagic) writeAscii(record0, 0x10, 'MOBI')
    view.setUint32(0x14, MOBI_HEADER_LENGTH)
    view.setUint32(0x1C, UTF8_ENCODING)
    view.setUint32(0x54, FULL_NAME_OFFSET)
    view.setUint32(0x58, title.length)
    view.setUint32(0x6C, options.firstImageIndex ?? 1 + (options.textRecords?.length ?? 0))
    view.setUint32(0x80, options.exthFlag === false ? 0 : (exth.length > 0 ? 0x40 : 0))
    view.setUint16(0xF2, 0)
    if (exth.length > 0) record0.set(exth, MOBI_EXTH_OFFSET)
    record0.set(title, FULL_NAME_OFFSET)
    return record0
}

function buildMobiFixture(options: MobiFixtureOptions = {}): ArrayBuffer {
    const textRecords = options.textRecords ?? []
    const imageRecords = options.imageRecords ?? []
    const record0 = buildRecord0({
        compression: options.compression ?? 1,
        fullName: options.fullName ?? 'Fixture Title',
        includeMobiMagic: options.includeMobiMagic ?? true,
        ...options,
    })
    const records = [record0, ...textRecords, ...imageRecords]
    const recordCount = options.recordCount ?? records.length
    const tableSize = PDB_RECORD_TABLE_OFFSET + recordCount * 8
    const record0Offset = Math.max(options.record0Offset ?? DEFAULT_RECORD_0_OFFSET, tableSize)
    const offsets = options.recordOffsets ?? records.reduce<number[]>((result, _record, index) => {
        const previous = index === 0 ? record0Offset : (result[index - 1] ?? record0Offset) + records[index - 1]!.length
        result.push(previous)
        return result
    }, [])
    const totalLength = records.reduce((end, record, index) => Math.max(end, (offsets[index] ?? record0Offset) + record.length), record0Offset)
    const buffer = new Uint8Array(totalLength)
    const view = new DataView(buffer.buffer)
    writeAscii(buffer, 0, options.name ?? 'Fixture Book')
    view.setUint16(PDB_RECORD_COUNT_OFFSET, recordCount)
    for (let index = 0; index < recordCount; index += 1) {
        view.setUint32(PDB_RECORD_TABLE_OFFSET + index * 8, offsets[index] ?? totalLength + 1024)
    }
    records.forEach((record, index) => {
        const offset = offsets[index]
        if (offset !== undefined && offset < buffer.length) buffer.set(record, offset)
    })
    return buffer.buffer
}

describe('mobiParser — PDB records', () => {
    it('拒绝空 PDB records', () => {
        expect(() => parseMobiBuffer(new ArrayBuffer(0))).toThrow('MOBI parse failed: no PDB records')
    })

    it('解析最小有效 PDB header 和无压缩文本 record', () => {
        const result = parseMobiBuffer(buildMobiFixture({
            textRecords: [bytes('hello mobi')],
        }), { coverMode: 'none' })

        expect(result.title).toBe('Fixture Title')
        expect(result.author).toBe('未知作者')
        expect(result.content).toBe('hello mobi')
    })

    it('拒绝损坏的 record0 offset', () => {
        const buffer = new ArrayBuffer(PDB_RECORD_TABLE_OFFSET + 8)
        const view = new DataView(buffer)
        view.setUint16(PDB_RECORD_COUNT_OFFSET, 1)
        view.setUint32(PDB_RECORD_TABLE_OFFSET, 999_999)

        expect(() => parseMobiBuffer(buffer)).toThrow('MOBI parse failed: invalid header magic')
    })
})

describe('mobiParser — PalmDOC 解压', () => {
    it('处理无压缩文本', () => {
        const result = parseMobiBuffer(buildMobiFixture({
            compression: 1,
            textRecords: [bytes('plain text')],
        }), { coverMode: 'none' })

        expect(result.content).toBe('plain text')
    })

    it('解压 PalmDOC space shorthand', () => {
        const compressed = new Uint8Array([...bytes('Hello'), 0xD7, ...bytes('orld')])
        const result = parseMobiBuffer(buildMobiFixture({
            compression: 2,
            textRecords: [compressed],
        }), { coverMode: 'none' })

        expect(result.content).toBe('Hello World')
    })

    it('解压 PalmDOC LZ back-reference', () => {
        const compressed = new Uint8Array([...bytes('abc'), 0x80, 0x18])
        const result = parseMobiBuffer(buildMobiFixture({
            compression: 2,
            textRecords: [compressed],
        }), { coverMode: 'none' })

        expect(result.content).toBe('abcbcb')
    })

    it('拒绝未知压缩类型', () => {
        const buffer = buildMobiFixture({
            compression: 7,
            textRecords: [bytes('text')],
        })

        expect(() => parseMobiBuffer(buffer)).toThrow('unsupported compression type 7')
    })
})

describe('mobiParser — EXTH 元数据', () => {
    it('提取 EXTH title 和 author', () => {
        const result = parseMobiBuffer(buildMobiFixture({
            fullName: 'Fallback Title',
            exthRecords: [
                { type: 503, payload: bytes('EXTH Title') },
                { type: 100, payload: bytes('EXTH Author') },
            ],
        }), { coverMode: 'none', includeContent: false })

        expect(result.title).toBe('EXTH Title')
        expect(result.author).toBe('EXTH Author')
    })

    it('EXTH flag 关闭时忽略 EXTH 数据', () => {
        const result = parseMobiBuffer(buildMobiFixture({
            fullName: 'Fallback Title',
            exthFlag: false,
            exthRecords: [
                { type: 503, payload: bytes('Ignored Title') },
                { type: 100, payload: bytes('Ignored Author') },
            ],
        }), { coverMode: 'none', includeContent: false })

        expect(result.title).toBe('Fallback Title')
        expect(result.author).toBe('未知作者')
    })

    it('EXTH record length 损坏时不崩溃并回退标题', () => {
        const result = parseMobiBuffer(buildMobiFixture({
            fullName: 'Fallback Title',
            exthRecords: [
                { type: 503, payload: bytes('Broken Title'), damagedLength: 999_999 },
            ],
        }), { coverMode: 'none', includeContent: false })

        expect(result.title).toBe('Fallback Title')
        expect(result.author).toBe('未知作者')
    })
})

describe('mobiParser — 图片资源', () => {
    it('从 firstImageIndex 提取图片资源', () => {
        const result = parseMobiBuffer(buildMobiFixture({
            textRecords: [bytes('text')],
            imageRecords: [jpegBytes()],
        }), { coverMode: 'data-url', includeResources: true })

        expect(result.resources).toHaveLength(1)
        expect(result.resources[0]).toMatchObject({
            recordIndex: 2,
            relativeIndex: 0,
            mime: 'image/jpeg',
        })
        expect(result.resources[0]?.url).toMatch(/^data:image\/jpeg;base64,/)
    })

    it('coverOffset 指向有效图片 record 时返回封面 data URL', () => {
        const result = parseMobiBuffer(buildMobiFixture({
            textRecords: [bytes('text')],
            imageRecords: [jpegBytes()],
            exthRecords: [
                { type: 201, payload: uint32(0) },
            ],
        }), { coverMode: 'data-url', includeResources: true, includeContent: false })

        expect(result.cover).toMatch(/^data:image\/jpeg;base64,/)
    })

    it('coverOffset 指向越界 record 时返回空封面', () => {
        const result = parseMobiBuffer(buildMobiFixture({
            textRecords: [bytes('text')],
            imageRecords: [jpegBytes()],
            exthRecords: [
                { type: 201, payload: uint32(99) },
            ],
        }), { coverMode: 'data-url', includeResources: true, includeContent: false })

        expect(result.cover).toBeNull()
    })
})

describe('mobiParser — 边界与错误处理', () => {
    it('record count 为 0 时抛错', () => {
        const buffer = new ArrayBuffer(PDB_RECORD_TABLE_OFFSET)
        new DataView(buffer).setUint16(PDB_RECORD_COUNT_OFFSET, 0)

        expect(() => parseMobiBuffer(buffer)).toThrow('MOBI parse failed: no PDB records')
    })

    it('MOBI magic 缺失时抛错', () => {
        const buffer = buildMobiFixture({
            includeMobiMagic: false,
            textRecords: [bytes('text')],
        })

        expect(() => parseMobiBuffer(buffer)).toThrow('MOBI parse failed: invalid header magic')
    })

    it('textRecordCount 超出实际 records 时只读取存在的文本 record', () => {
        const result = parseMobiBuffer(buildMobiFixture({
            textRecordCount: 5,
            textRecords: [bytes('available')],
        }), { coverMode: 'none' })

        expect(result.content).toBe('available')
    })
})
