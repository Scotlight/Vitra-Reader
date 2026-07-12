import { afterEach, describe, expect, it, vi } from 'vitest'
import {
    extractLegacyReaderFontRecords,
    runLegacyReaderFontMigration,
    type ReaderFontRecord,
} from '@/services/storageService'

function createLegacyFont(id: string, installedAt = 1): ReaderFontRecord {
    const data = new Uint8Array([79, 84, 84, 79]).buffer
    return {
        id,
        displayName: `字体 ${id}`,
        family: `Vitra ${id}`,
        category: 'serif',
        format: 'opentype',
        sizeBytes: data.byteLength,
        source: 'catalog',
        installedAt,
        data,
    }
}

function createSettingsTable(initial: Array<{ key: string; value: unknown }>) {
    const rows = new Map(initial.map((row) => [row.key, row]))
    const primaryKeys = vi.fn(async () => Array.from(rows.keys())
        .filter((key) => key.startsWith('readerFonts:data:v1:')))
    const startsWith = vi.fn((_prefix: string) => ({ primaryKeys }))
    const where = vi.fn((_index: 'key') => ({ startsWith }))
    const get = vi.fn(async (key: string) => rows.get(key))
    const deleteRow = vi.fn(async (key: string) => {
        rows.delete(key)
    })
    return {
        rows,
        table: { where, get, delete: deleteRow },
        where,
        startsWith,
        deleteRow,
    }
}

function createReaderFontsTable(options: { failIds?: string[] } = {}) {
    const rows = new Map<string, ReaderFontRecord>()
    const failIds = new Set(options.failIds ?? [])
    const put = vi.fn(async (font: ReaderFontRecord) => {
        if (failIds.has(font.id)) throw new Error(`put failed: ${font.id}`)
        rows.set(font.id, font)
        return font.id
    })
    return { rows, table: { put }, put }
}

describe('reader font storage migration', () => {
    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('只提取旧 settings 中结构完整的字体记录', () => {
        const validFont = createLegacyFont('catalog-font')

        expect(extractLegacyReaderFontRecords([
            { key: 'settings:readerSettings', value: { themeId: 'light' } },
            { key: 'readerFonts:data:v1:catalog-font', value: validFont },
            { key: 'readerFonts:data:v1:broken', value: { id: 'broken' } },
        ])).toEqual([validFont])
    })

    it('拒绝 installedAt 非有限数值的旧字体记录', () => {
        expect(extractLegacyReaderFontRecords([
            { key: 'readerFonts:data:v1:invalid-time', value: createLegacyFont('invalid-time', Number.NaN) },
        ])).toEqual([])
    })

    it('合法旧行逐条搬入 readerFonts 并清理旧行与索引键', async () => {
        const font = createLegacyFont('font-a')
        const settings = createSettingsTable([
            { key: 'readerFonts:index:v1', value: ['font-a'] },
            { key: 'readerFonts:data:v1:font-a', value: font },
            { key: 'settings:readerSettings', value: { themeId: 'light' } },
            { key: 'vcache-book1', value: new ArrayBuffer(4) },
        ])
        const readerFonts = createReaderFontsTable()

        await runLegacyReaderFontMigration(settings.table, readerFonts.table)

        expect(settings.where).toHaveBeenCalledWith('key')
        expect(settings.startsWith).toHaveBeenCalledWith('readerFonts:data:v1:')
        expect(readerFonts.rows.get('font-a')).toEqual(font)
        expect(settings.rows.has('readerFonts:data:v1:font-a')).toBe(false)
        expect(settings.rows.has('readerFonts:index:v1')).toBe(false)
        expect(settings.rows.has('settings:readerSettings')).toBe(true)
        expect(settings.rows.has('vcache-book1')).toBe(true)
        expect(readerFonts.put.mock.invocationCallOrder[0]!)
            .toBeLessThan(settings.deleteRow.mock.invocationCallOrder[0]!)
    })

    it('重复执行迁移为幂等 no-op', async () => {
        const settings = createSettingsTable([
            { key: 'readerFonts:index:v1', value: ['font-a'] },
            { key: 'readerFonts:data:v1:font-a', value: createLegacyFont('font-a') },
        ])
        const readerFonts = createReaderFontsTable()

        await runLegacyReaderFontMigration(settings.table, readerFonts.table)
        const putCalls = readerFonts.put.mock.calls.length
        await runLegacyReaderFontMigration(settings.table, readerFonts.table)

        expect(readerFonts.put).toHaveBeenCalledTimes(putCalls)
    })

    it('无法解析的垃圾行被删除并输出告警', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
        const settings = createSettingsTable([
            { key: 'readerFonts:data:v1:broken', value: { id: 'broken' } },
        ])
        const readerFonts = createReaderFontsTable()

        await runLegacyReaderFontMigration(settings.table, readerFonts.table)

        expect(settings.rows.has('readerFonts:data:v1:broken')).toBe(false)
        expect(readerFonts.put).not.toHaveBeenCalled()
        expect(warn).toHaveBeenCalled()
    })

    it('单条写入失败保留旧行且不影响其余字体迁移', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
        const settings = createSettingsTable([
            { key: 'readerFonts:index:v1', value: ['font-a', 'font-b'] },
            { key: 'readerFonts:data:v1:font-a', value: createLegacyFont('font-a') },
            { key: 'readerFonts:data:v1:font-b', value: createLegacyFont('font-b') },
        ])
        const readerFonts = createReaderFontsTable({ failIds: ['font-a'] })

        await runLegacyReaderFontMigration(settings.table, readerFonts.table)

        expect(settings.rows.has('readerFonts:data:v1:font-a')).toBe(true)
        expect(settings.rows.has('readerFonts:data:v1:font-b')).toBe(false)
        expect(readerFonts.rows.has('font-b')).toBe(true)
        expect(settings.rows.has('readerFonts:index:v1')).toBe(false)
        expect(warn).toHaveBeenCalled()
    })
})
