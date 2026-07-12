import { describe, expect, it } from 'vitest'
import { extractLegacyReaderFontRecords } from '@/services/storageService'

describe('reader font storage migration', () => {
    it('只提取旧 settings 中结构完整的字体记录', () => {
        const data = new Uint8Array([79, 84, 84, 79]).buffer
        const validFont = {
            id: 'catalog-font',
            displayName: '目录字体',
            family: 'Vitra Catalog Font',
            category: 'serif' as const,
            format: 'opentype',
            sizeBytes: data.byteLength,
            source: 'catalog' as const,
            installedAt: 1,
            data,
        }

        expect(extractLegacyReaderFontRecords([
            { key: 'settings:readerSettings', value: { themeId: 'light' } },
            { key: 'readerFonts:data:v1:catalog-font', value: validFont },
            { key: 'readerFonts:data:v1:broken', value: { id: 'broken' } },
        ])).toEqual([validFont])
    })
})
