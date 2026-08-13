import { describe, expect, it } from 'vitest'
import type { Book } from '@likecoin/epub-ts'
import { getSpineItems } from '@/engine/parsers/providers/epubContentExtractor'

/** 只搭 getSpineItems 用到的最小骨架：spine.spineItems + packaging.manifest */
function fakeBook(
    spineItems: Array<{ idref?: string; id?: string; href?: string; linear?: boolean }>,
    manifest: Record<string, { properties?: unknown }>,
): Book {
    return { spine: { spineItems }, packaging: { manifest } } as unknown as Book
}

describe('epubContentExtractor.getSpineItems nav 识别', () => {
    it('manifest properties 数组含 nav 时打标 isNavDoc', () => {
        const book = fakeBook(
            [
                { idref: 'nav', href: 'nav.xhtml' },
                { idref: 'ch1', href: 'chapter_1.xhtml' },
            ],
            { nav: { properties: ['nav'] }, ch1: {} },
        )
        const items = getSpineItems(book)
        expect(items[0]?.isNavDoc).toBe(true)
        expect(items[1]?.isNavDoc).toBe(false)
    })

    it('properties 为空格分隔字符串时同样识别', () => {
        const book = fakeBook(
            [{ idref: 'nav', href: 'nav.xhtml' }],
            { nav: { properties: 'scripted nav' } },
        )
        expect(getSpineItems(book)[0]?.isNavDoc).toBe(true)
    })

    it('nav-extra 这类前缀相似值不误报', () => {
        const book = fakeBook(
            [{ idref: 'x', href: 'x.xhtml' }],
            { x: { properties: 'nav-extra' } },
        )
        expect(getSpineItems(book)[0]?.isNavDoc).toBe(false)
    })

    it('无 manifest 或 idref 对不上时不打标', () => {
        const book = fakeBook([{ href: 'y.xhtml' }], {})
        expect(getSpineItems(book)[0]?.isNavDoc).toBe(false)
    })

    it('linear 语义不受影响', () => {
        const book = fakeBook(
            [{ idref: 'nav', href: 'nav.xhtml', linear: false }],
            { nav: { properties: ['nav'] } },
        )
        const item = getSpineItems(book)[0]
        expect(item?.linear).toBe(false)
        expect(item?.isNavDoc).toBe(true)
    })
})
