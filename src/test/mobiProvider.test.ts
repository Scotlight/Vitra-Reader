import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
    loadLingoMobiBookMock: vi.fn(),
    parseLingoMobiMetadataMock: vi.fn(),
    parseMobiBufferMock: vi.fn(),
    renderMobiChaptersMock: vi.fn(),
    destroyMock: vi.fn(),
}))

vi.mock('@/engine/parsers/providers/lingoMobiAdapter', () => ({
    loadLingoMobiBook: mocks.loadLingoMobiBookMock,
    parseLingoMobiMetadata: mocks.parseLingoMobiMetadataMock,
}))

vi.mock('@/engine/parsers/providers/mobiParser', () => ({
    parseMobiBuffer: mocks.parseMobiBufferMock,
}))

vi.mock('@/engine/parsers/providers/mobiHtmlRenderer', () => ({
    renderMobiChapters: mocks.renderMobiChaptersMock,
    filterRenderableMobiChapters: (chapters: unknown[]) => chapters,
}))

import { MobiContentProvider, parseMobiMetadata } from '@/engine/parsers/providers/mobiProvider'

describe('MobiContentProvider', () => {
    afterEach(() => {
        vi.restoreAllMocks()
        vi.clearAllMocks()
    })

    it('优先使用 lingo 解析结果', async () => {
        const destroy = vi.fn()
        mocks.loadLingoMobiBookMock.mockResolvedValue({
            parser: {},
            kind: 'kf8',
            chapters: [{
                label: '第一章',
                href: 'chap-1',
                html: '<p>正文</p>',
                plainText: '正文关键字',
                styles: ['.a{color:red}'],
            }],
            spineItems: [{
                index: 0,
                href: 'chap-1',
                id: 'chap-1',
                linear: true,
            }],
            tocItems: [{
                id: 'chap-1',
                href: 'chap-1',
                label: '第一章',
            }],
            activeAssetUrls: new Set(['blob:cover', 'blob:img1']),
            resolveHref: (href: string) => href === 'chap-1#anchor' ? 0 : -1,
            destroy,
        })

        const provider = new MobiContentProvider(new ArrayBuffer(8), 'azw3')
        await provider.init()

        expect(mocks.loadLingoMobiBookMock).toHaveBeenCalledWith(expect.any(ArrayBuffer), 'azw3')
        expect(provider.getToc()).toEqual([{ id: 'chap-1', href: 'chap-1', label: '第一章' }])
        expect(provider.getSpineItems()).toEqual([{ index: 0, href: 'chap-1', id: 'chap-1', linear: true }])
        expect(await provider.extractChapterHtml(0)).toBe('<p>正文</p>')
        expect(await provider.extractChapterStyles(0)).toEqual(['.a{color:red}'])
        expect(provider.getSpineIndexByHref('chap-1#anchor')).toBe(0)
        expect(provider.isAssetUrlAvailable('blob:img1')).toBe(true)
        expect(provider.isAssetUrlAvailable('blob:missing')).toBe(false)
        expect(await provider.search('关键字')).toEqual([{ cfi: 'vitra:0:0', excerpt: '正文关键字' }])

        provider.destroy()
        expect(destroy).toHaveBeenCalledTimes(1)
        expect(provider.isAssetUrlAvailable('blob:img1')).toBe(false)
    })

    it('lingo 失败时回退到 legacy 解析', async () => {
        const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
        mocks.loadLingoMobiBookMock.mockRejectedValue(new Error('lingo failed'))
        mocks.parseMobiBufferMock.mockReturnValue({
            title: '书名',
            author: '作者',
            content: '<p>旧正文</p>',
            cover: 'blob:cover',
            resources: [{
                recordIndex: 1,
                relativeIndex: 0,
                mime: 'image/png',
                url: 'blob:image',
            }],
        })
        mocks.renderMobiChaptersMock.mockReturnValue([{
            label: '正文',
            href: 'ch-0',
            html: '<p>旧正文</p>',
            plainText: '旧正文',
            styles: [],
        }])

        const provider = new MobiContentProvider(new ArrayBuffer(8), 'mobi')
        await provider.init()

        expect(mocks.parseMobiBufferMock).toHaveBeenCalledTimes(1)
        expect(mocks.renderMobiChaptersMock).toHaveBeenCalledWith({
            content: '<p>旧正文</p>',
            resources: [{
                recordIndex: 1,
                relativeIndex: 0,
                mime: 'image/png',
                url: 'blob:image',
            }],
        })
        expect(provider.getSpineIndexByHref('ch-0')).toBe(0)
        expect(provider.isAssetUrlAvailable('blob:image')).toBe(true)

        provider.destroy()
        expect(revokeSpy).toHaveBeenCalledWith('blob:image')
        expect(revokeSpy).toHaveBeenCalledWith('blob:cover')
    })

    it('lingo mobi 正文疑似乱码时回退到 legacy 解析', async () => {
        const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
        const destroy = vi.fn()
        mocks.loadLingoMobiBookMock.mockResolvedValue({
            parser: {},
            kind: 'mobi',
            chapters: [{
                label: '第一章',
                href: 'chap-1',
                html: '<p>è¿™æ˜¯ä¸€æ®µä¸­æ–‡ä¹±ç æ­£æ–‡ã€‚</p>',
                plainText: 'è¿™æ˜¯ä¸€æ®µä¸­æ–‡ä¹±ç æ­£æ–‡ã€‚'.repeat(4),
                styles: [],
            }],
            spineItems: [{
                index: 0,
                href: 'chap-1',
                id: 'chap-1',
                linear: true,
            }],
            tocItems: [{
                id: 'chap-1',
                href: 'chap-1',
                label: '第一章',
            }],
            activeAssetUrls: new Set(['blob:img1']),
            resolveHref: () => 0,
            destroy,
        })
        mocks.parseMobiBufferMock.mockReturnValue({
            title: '书名',
            author: '作者',
            content: '<p>旧正文</p>',
            cover: 'blob:cover',
            resources: [{
                recordIndex: 1,
                relativeIndex: 0,
                mime: 'image/png',
                url: 'blob:image',
            }],
        })
        mocks.renderMobiChaptersMock.mockReturnValue([{
            label: '正文',
            href: 'ch-0',
            html: '<p>旧正文</p>',
            plainText: '旧正文',
            styles: [],
        }])

        const provider = new MobiContentProvider(new ArrayBuffer(8), 'mobi')
        await provider.init()

        expect(destroy).toHaveBeenCalledTimes(1)
        expect(mocks.parseMobiBufferMock).toHaveBeenCalledTimes(1)
        expect(await provider.extractChapterHtml(0)).toBe('<p>旧正文</p>')

        provider.destroy()
        expect(revokeSpy).toHaveBeenCalledWith('blob:image')
        expect(revokeSpy).toHaveBeenCalledWith('blob:cover')
    })
})

describe('parseMobiMetadata', () => {
    afterEach(() => {
        vi.restoreAllMocks()
        vi.clearAllMocks()
    })

    it('优先使用 lingo 元数据', async () => {
        mocks.parseLingoMobiMetadataMock.mockResolvedValue({
            title: '新书',
            author: '作者甲',
            description: '描述',
            publisher: '出版社',
            language: 'zh',
            cover: 'data:image/png;base64,abc',
        })

        const metadata = await parseMobiMetadata(new ArrayBuffer(4), 'azw3')

        expect(mocks.parseLingoMobiMetadataMock).toHaveBeenCalledWith(expect.any(ArrayBuffer), 'azw3')
        expect(metadata.title).toBe('新书')
        expect(metadata.cover).toBe('data:image/png;base64,abc')
    })

    it('lingo 元数据失败时回退到 legacy 元数据', async () => {
        mocks.parseLingoMobiMetadataMock.mockRejectedValue(new Error('metadata failed'))
        mocks.parseMobiBufferMock.mockReturnValue({
            title: '旧书',
            author: '旧作者',
            cover: 'data:image/png;base64,legacy',
            content: '',
            resources: [],
        })

        const metadata = await parseMobiMetadata(new ArrayBuffer(4), 'mobi')

        expect(mocks.parseMobiBufferMock).toHaveBeenCalledWith(expect.any(ArrayBuffer), {
            coverMode: 'data-url',
            includeContent: false,
            includeCoverInContent: false,
            includeResources: false,
        })
        expect(metadata).toEqual({
            title: '旧书',
            author: '旧作者',
            cover: 'data:image/png;base64,legacy',
        })
    })

    it('lingo 元数据疑似乱码时回退到 legacy 元数据', async () => {
        mocks.parseLingoMobiMetadataMock.mockResolvedValue({
            title: 'è¿™æ˜¯ä¸­æ–‡ä¹¦å',
            author: 'ä½œè€…',
            description: '',
            publisher: '',
            language: 'zh',
            cover: 'data:image/png;base64,abc',
        })
        mocks.parseMobiBufferMock.mockReturnValue({
            title: '旧书',
            author: '旧作者',
            cover: 'data:image/png;base64,legacy',
            content: '',
            resources: [],
        })

        const metadata = await parseMobiMetadata(new ArrayBuffer(4), 'mobi')

        expect(mocks.parseMobiBufferMock).toHaveBeenCalledTimes(1)
        expect(metadata).toEqual({
            title: '旧书',
            author: '旧作者',
            cover: 'data:image/png;base64,legacy',
        })
    })
})
