import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReaderFontCatalogItem } from '@/components/Reader/readerFontCatalog'

const { rows, readerFonts, migrateLegacyReaderFonts } = vi.hoisted(() => {
    const fontRows = new Map<string, unknown>()
    const primaryKeys = vi.fn(async () => Array.from(fontRows.values())
        .sort((left, right) => (right as { installedAt: number }).installedAt - (left as { installedAt: number }).installedAt)
        .map((font) => (font as { id: string }).id))
    const reverse = vi.fn(() => ({ primaryKeys }))
    return {
        rows: fontRows,
        readerFonts: {
            get: vi.fn(async (id: string) => fontRows.get(id)),
            orderBy: vi.fn((_index: string) => ({ reverse })),
            put: vi.fn(async (font: { id: string }) => {
                fontRows.set(font.id, font)
                return font.id
            }),
            delete: vi.fn(async (id: string) => {
                fontRows.delete(id)
            }),
        },
        migrateLegacyReaderFonts: vi.fn<() => Promise<void>>(async () => undefined),
    }
})

vi.mock('@/services/storageService', () => ({
    db: {
        readerFonts,
    },
    migrateLegacyReaderFonts,
}))

vi.mock('@/services/platform/platformBridge', () => ({
    requestPersistentStorage: vi.fn(async () => true),
}))

import {
    downloadReaderFont,
    importReaderFont,
    loadStoredReaderFonts,
    removeStoredReaderFont,
    toStoredReaderFontFamily,
} from '@/components/Reader/readerFontService'

class TestFontFace {
    family: string
    source: ArrayBuffer

    constructor(family: string, source: ArrayBuffer) {
        this.family = family
        this.source = source
    }

    async load() {
        return this
    }
}

const fontSet = {
    add: vi.fn(),
    delete: vi.fn(() => true),
}

const catalogFont: ReaderFontCatalogItem = {
    id: 'test-font',
    displayName: '测试字体',
    family: 'Vitra Test Font',
    category: 'serif',
    format: 'opentype',
    license: 'OFL-1.1',
    licenseUrl: 'https://example.test/license',
    sizeBytes: 4,
    sourceUrl: 'https://example.test/source',
    url: 'https://example.test/font.otf',
    version: '1',
    sha256: '7ff30fcf2251a8e9cf8e5175d75e90b3c02656f9a344b10948a4d96bb568d74e',
}

describe('readerFontService', () => {
    beforeEach(() => {
        rows.clear()
        vi.stubGlobal('FontFace', TestFontFace)
        Object.defineProperty(document, 'fonts', { configurable: true, value: fontSet })
        Object.defineProperty(navigator, 'storage', {
            configurable: true,
            value: { estimate: vi.fn(async () => ({ quota: 1024, usage: 0 })) },
        })
        fontSet.add.mockClear()
        fontSet.delete.mockClear()
        readerFonts.get.mockClear()
        readerFonts.orderBy.mockClear()
        readerFonts.put.mockClear()
        readerFonts.delete.mockClear()
        migrateLegacyReaderFonts.mockClear()
    })

    afterEach(() => {
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
    })

    it('下载字体后校验、持久化并注册 FontFace', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array([79, 84, 84, 79]), { status: 200 })))

        const font = await downloadReaderFont(catalogFont)

        expect(font.catalogId).toBe('test-font')
        expect(font.source).toBe('catalog')
        expect(readerFonts.put).toHaveBeenCalled()
        expect(fontSet.add).toHaveBeenCalledTimes(1)
        expect(toStoredReaderFontFamily(font)).toContain('Vitra Test Font')
    })

    it('拒绝长度与清单不一致的下载内容', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array([79, 84, 84, 79, 0]), { status: 200 })))

        await expect(downloadReaderFont(catalogFont)).rejects.toThrow('长度与清单不一致')
    })

    it('目录提供哈希时拒绝完整性不匹配的下载内容', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array([79, 84, 84, 79]), { status: 200 })))

        await expect(downloadReaderFont({ ...catalogFont, sha256: '0'.repeat(64) }))
            .rejects.toThrow('完整性校验失败')
    })

    it('导入本地字体并可从持久化记录恢复和删除', async () => {
        const file = new File([new Uint8Array([0, 1, 0, 0])], '我的字体.ttf', { type: 'font/ttf' })

        const imported = await importReaderFont(file)
        const restored = await loadStoredReaderFonts()
        await removeStoredReaderFont(imported.id)

        expect(imported.displayName).toBe('我的字体')
        expect(restored.some((font) => font.id === imported.id)).toBe(true)
        expect(rows.has(imported.id)).toBe(false)
        expect(fontSet.delete).toHaveBeenCalled()
    })

    it('拒绝伪装成字体的文件', async () => {
        const file = new File([new Uint8Array([1, 2, 3, 4])], 'fake.ttf', { type: 'font/ttf' })
        await expect(importReaderFont(file)).rejects.toThrow('不是有效字体文件')
    })

    it('恢复时跳过损坏记录并保留完好字体', async () => {
        rows.set('broken', { id: 'broken', installedAt: 2, data: {} })
        rows.set('valid', {
            id: 'valid',
            displayName: '完好字体',
            family: 'Vitra Valid',
            category: 'serif',
            format: 'opentype',
            sizeBytes: 4,
            source: 'import',
            installedAt: 1,
            data: new Uint8Array([79, 84, 84, 79]).buffer,
        })
        vi.spyOn(console, 'warn').mockImplementation(() => undefined)

        await expect(loadStoredReaderFonts()).resolves.toEqual([
            expect.objectContaining({ id: 'valid' }),
        ])
    })

    it('恢复列表按安装时间倒序', async () => {
        const data = new Uint8Array([79, 84, 84, 79]).buffer
        rows.set('older', {
            id: 'older', displayName: '旧字体', family: 'Older', category: 'serif', format: 'otf',
            sizeBytes: 4, source: 'import', installedAt: 1, data,
        })
        rows.set('newer', {
            id: 'newer', displayName: '新字体', family: 'Newer', category: 'serif', format: 'otf',
            sizeBytes: 4, source: 'import', installedAt: 2, data,
        })

        const restored = await loadStoredReaderFonts()

        expect(restored.map((font) => font.id)).toEqual(['newer', 'older'])
    })

    it('恢复前先等待旧存储迁移', async () => {
        let finishMigration: (() => void) | undefined
        migrateLegacyReaderFonts.mockImplementationOnce(() => new Promise<void>((resolve) => {
            finishMigration = resolve
        }))

        const loading = loadStoredReaderFonts()
        await Promise.resolve()

        expect(migrateLegacyReaderFonts).toHaveBeenCalledTimes(1)
        expect(readerFonts.orderBy).not.toHaveBeenCalled()
        finishMigration?.()
        await loading
        expect(readerFonts.orderBy).toHaveBeenCalledWith('installedAt')
    })
})
