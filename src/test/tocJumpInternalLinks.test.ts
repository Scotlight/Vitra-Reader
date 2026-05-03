import { describe, expect, it, vi } from 'vitest'
import { createTocJumpInternalLinkHandler } from '@/components/Reader/scrollReader/tocJumpInternalLinks'
import type { ContentProvider, SpineItemInfo } from '@/engine/core/contentProvider'

function createProvider(map: Record<string, number>): ContentProvider {
    return {
        init: vi.fn(),
        destroy: vi.fn(),
        getToc: vi.fn(() => []),
        getSpineItems: vi.fn(() => []),
        getSpineIndexByHref: vi.fn((href: string) => map[href] ?? -1),
        extractChapterHtml: vi.fn(),
        extractChapterStyles: vi.fn(),
        unloadChapter: vi.fn(),
        search: vi.fn(),
    }
}

const spineItems: SpineItemInfo[] = [
    { index: 0, href: 'a.xhtml', id: 'a', linear: true },
    { index: 1, href: 'b.xhtml', id: 'b', linear: true },
]

describe('tocJumpInternalLinks', () => {
    it('拦截有效正文链接并跳转到目标 spine', () => {
        const jumpToSpine = vi.fn()
        const handler = createTocJumpInternalLinkHandler({
            provider: createProvider({ 'b.xhtml': 1 }),
            spineItemsRef: { current: spineItems },
            jumpToSpine,
        })
        const anchor = document.createElement('a')
        anchor.href = 'http://localhost/b.xhtml'
        anchor.setAttribute('href', 'b.xhtml')
        const child = document.createElement('span')
        anchor.appendChild(child)
        const event = new MouseEvent('click', { bubbles: true, cancelable: true })
        const stopPropagation = vi.spyOn(event, 'stopPropagation')

        child.dispatchEvent(event)
        handler(event)

        expect(event.defaultPrevented).toBe(true)
        expect(stopPropagation).toHaveBeenCalledTimes(1)
        expect(jumpToSpine).toHaveBeenCalledWith(1)
    })

    it('支持 PDF data-pdf-page 链接', () => {
        const jumpToSpine = vi.fn()
        const handler = createTocJumpInternalLinkHandler({
            provider: createProvider({}),
            spineItemsRef: { current: spineItems },
            jumpToSpine,
        })
        const anchor = document.createElement('a')
        anchor.setAttribute('data-pdf-page', '1')
        const event = new MouseEvent('click', { bubbles: true, cancelable: true })

        anchor.dispatchEvent(event)
        handler(event)

        expect(event.defaultPrevented).toBe(true)
        expect(jumpToSpine).toHaveBeenCalledWith(1)
    })

    it('忽略无效链接、越界链接和非链接点击', () => {
        const jumpToSpine = vi.fn()
        const handler = createTocJumpInternalLinkHandler({
            provider: createProvider({ 'missing.xhtml': -1, 'out.xhtml': 9 }),
            spineItemsRef: { current: spineItems },
            jumpToSpine,
        })

        const plain = document.createElement('span')
        const plainEvent = new MouseEvent('click', { bubbles: true, cancelable: true })
        plain.dispatchEvent(plainEvent)
        handler(plainEvent)

        const missing = document.createElement('a')
        missing.setAttribute('href', 'missing.xhtml')
        const missingEvent = new MouseEvent('click', { bubbles: true, cancelable: true })
        missing.dispatchEvent(missingEvent)
        handler(missingEvent)

        const out = document.createElement('a')
        out.setAttribute('href', 'out.xhtml')
        const outEvent = new MouseEvent('click', { bubbles: true, cancelable: true })
        out.dispatchEvent(outEvent)
        handler(outEvent)

        expect(plainEvent.defaultPrevented).toBe(false)
        expect(missingEvent.defaultPrevented).toBe(false)
        expect(outEvent.defaultPrevented).toBe(false)
        expect(jumpToSpine).not.toHaveBeenCalled()
    })
})
