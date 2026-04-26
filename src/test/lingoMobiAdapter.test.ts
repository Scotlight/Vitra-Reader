import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
    initKf8FileMock: vi.fn(),
    initMobiFileMock: vi.fn(),
}))

vi.mock('@lingo-reader/mobi-parser', () => ({
    initKf8File: mocks.initKf8FileMock,
    initMobiFile: mocks.initMobiFileMock,
}))

import { loadLingoMobiBook } from '@/engine/parsers/providers/lingoMobiAdapter'

function createParser(overrides?: {
    toc?: Array<{ label: string; href: string }>
}) {
    return {
        destroy: vi.fn(),
        getSpine: () => [
            { id: '0' },
            { id: '1' },
            { id: '2' },
        ],
        loadChapter: (id: string) => {
            if (id === '0' || id === '1') return { html: '', css: [] }
            return {
                html: '<h1>序章 且放白鹿青崖间（1）</h1><p>正文</p>',
                css: [],
            }
        },
        getToc: () => overrides?.toc ?? [],
        resolveHref: (href: string) => {
            if (href === 'filepos:200') return { id: '2', selector: '[id="filepos:200"]' }
            return undefined
        },
    }
}

describe('loadLingoMobiBook', () => {
    afterEach(() => {
        vi.restoreAllMocks()
        vi.clearAllMocks()
    })

    it('过滤 lingo 生成的空章节，并用真实章节标题生成 fallback TOC', async () => {
        const parser = createParser()
        mocks.initKf8FileMock.mockRejectedValue(new Error('not kf8'))
        mocks.initMobiFileMock.mockResolvedValue(parser)

        const book = await loadLingoMobiBook(new ArrayBuffer(8), 'mobi')

        expect(book.chapters).toHaveLength(1)
        expect(book.chapters[0].href).toBe('2')
        expect(book.spineItems).toEqual([{ index: 0, href: '2', id: '2', linear: true }])
        expect(book.tocItems).toEqual([{
            id: '2',
            href: '2',
            label: '序章 且放白鹿青崖间（1）',
        }])
        expect(book.resolveHref('2')).toBe(0)
        expect(book.resolveHref('filepos:200')).toBe(0)

        book.destroy()
        expect(parser.destroy).toHaveBeenCalledTimes(1)
    })

    it('parsed TOC 只有数字标签时改用章节标题 fallback', async () => {
        const parser = createParser({
            toc: [{ label: '0', href: '0' }],
        })
        mocks.initKf8FileMock.mockRejectedValue(new Error('not kf8'))
        mocks.initMobiFileMock.mockResolvedValue(parser)

        const book = await loadLingoMobiBook(new ArrayBuffer(8), 'mobi')

        expect(book.tocItems).toEqual([{
            id: '2',
            href: '2',
            label: '序章 且放白鹿青崖间（1）',
        }])
    })
})
