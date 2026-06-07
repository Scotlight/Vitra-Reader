import { describe, expect, it } from 'vitest'
import {
    applyPaginatedHorizontalWindow,
    collectPaginatedHorizontalWindowItems,
    isPaginatedHorizontalWindowHiddenElement,
    resolvePaginatedHorizontalWindow,
    restorePaginatedHorizontalWindowItems,
    shouldUsePaginatedHorizontalWindowing,
} from '@/components/Reader/paginatedReader/paginatedHorizontalWindowing'

function rect(left: number, width: number, height = 20): DOMRect {
    return {
        left,
        right: left + width,
        top: 0,
        bottom: height,
        width,
        height,
        x: left,
        y: 0,
        toJSON: () => ({}),
    } as DOMRect
}

function mockRect(element: Element, value: DOMRect): void {
    Object.defineProperty(element, 'getBoundingClientRect', {
        configurable: true,
        value: () => value,
    })
}

describe('paginatedHorizontalWindowing', () => {
    it('小章节不会启用水平页窗裁剪', () => {
        expect(shouldUsePaginatedHorizontalWindowing(5)).toBe(false)
        expect(shouldUsePaginatedHorizontalWindowing(6)).toBe(true)
    })

    it('会按当前页和 overscan 计算水平页窗', () => {
        expect(resolvePaginatedHorizontalWindow(5, 10, 1)).toEqual({ startPage: 4, endPage: 6 })
        expect(resolvePaginatedHorizontalWindow(0, 10, 2)).toEqual({ startPage: 0, endPage: 2 })
        expect(resolvePaginatedHorizontalWindow(99, 10, 1)).toEqual({ startPage: 8, endPage: 9 })
    })

    it('会根据元素水平位置收集页窗候选', () => {
        const container = document.createElement('div')
        container.innerHTML = '<p>one</p><p>two</p><p>three</p>'
        const elements = Array.from(container.querySelectorAll('p')) as [HTMLParagraphElement, HTMLParagraphElement, HTMLParagraphElement]

        mockRect(container, rect(0, 1800, 800))
        mockRect(elements[0], rect(10, 100))
        mockRect(elements[1], rect(650, 100))
        mockRect(elements[2], rect(1250, 100))

        const items = collectPaginatedHorizontalWindowItems(container, 600)

        expect(items.map((item) => [item.startPage, item.endPage])).toEqual([
            [0, 0],
            [1, 1],
            [2, 2],
        ])
    })

    it('会隐藏页窗外元素并可恢复原始样式', () => {
        const container = document.createElement('div')
        container.innerHTML = '<p>one</p><p>two</p><p>three</p>'
        const elements = Array.from(container.querySelectorAll('p')) as unknown as [HTMLElement, HTMLElement, HTMLElement]
        elements[0].style.pointerEvents = 'auto'

        mockRect(container, rect(0, 1800, 800))
        mockRect(elements[0], rect(10, 100))
        mockRect(elements[1], rect(650, 100))
        mockRect(elements[2], rect(1250, 100))

        const items = collectPaginatedHorizontalWindowItems(container, 600)
        const stats = applyPaginatedHorizontalWindow(items, { startPage: 1, endPage: 1 })

        expect(stats).toEqual({ total: 3, visible: 1, hidden: 2, dehydrated: 2, restored: 0 })
        expect(elements[0].style.visibility).toBe('hidden')
        expect(elements[0].innerHTML).toBe('')
        expect(elements[1].style.visibility).toBe('')
        expect(elements[2].getAttribute('data-vitra-horizontal-window')).toBe('hidden')
        expect(isPaginatedHorizontalWindowHiddenElement(elements[2])).toBe(true)

        restorePaginatedHorizontalWindowItems(items)

        expect(elements[0].style.visibility).toBe('')
        expect(elements[0].style.pointerEvents).toBe('auto')
        expect(elements[0].innerHTML).toBe('one')
        expect(elements[2].hasAttribute('data-vitra-horizontal-window')).toBe(false)
        expect(isPaginatedHorizontalWindowHiddenElement(elements[2])).toBe(false)
    })

    it('页窗外元素会脱水子 DOM 与媒体资源，回到页窗后恢复', () => {
        const container = document.createElement('div')
        container.innerHTML = '<figure><img src="blob:cover" srcset="blob:cover2 2x" alt="cover"><figcaption>cover</figcaption></figure>'
        const figure = container.querySelector('figure') as HTMLElement
        const image = figure.querySelector('img') as HTMLImageElement

        mockRect(container, rect(0, 1200, 800))
        mockRect(figure, rect(650, 200, 120))

        const items = collectPaginatedHorizontalWindowItems(container, 600)
        const hiddenStats = applyPaginatedHorizontalWindow(items, { startPage: 0, endPage: 0 })

        expect(hiddenStats.dehydrated).toBe(1)
        expect(figure.innerHTML).toBe('')
        expect(image.getAttribute('src')).toBeNull()
        expect(figure.style.minHeight).toBe('120px')
        expect(figure.getAttribute('data-vitra-horizontal-window')).toBe('hidden')

        let restored = false
        const visibleStats = applyPaginatedHorizontalWindow(items, { startPage: 1, endPage: 1 }, {
            onRestored: () => { restored = true },
        })

        expect(visibleStats.restored).toBe(1)
        expect(restored).toBe(true)
        expect(figure.innerHTML).toContain('figcaption')
        expect(figure.querySelector('img')?.getAttribute('src')).toBe('blob:cover')
        expect(figure.querySelector('img')?.getAttribute('srcset')).toBe('blob:cover2 2x')
        expect(figure.style.minHeight).toBe('')
    })
})
