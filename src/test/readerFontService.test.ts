import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReaderFontCatalogItem } from '@/components/Reader/readerFontCatalog'

const { rows, readerFonts } = vi.hoisted(() => {
    const fontRows = new Map<string, unknown>()
    return {
        rows: fontRows,
        readerFonts: {
            toArray: vi.fn(async () => Array.from(fontRows.values())),
            put: vi.fn(async (font: { id: string }) => {
                fontRows.set(font.id, font)
                return font.id
            }),
            delete: vi.fn(async (id: string) => {
                fontRows.delete(id)
            }),
        },
    }
})

vi.mock('@/services/storageService', () => ({
    db: {
        readerFonts,
    },
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
})
