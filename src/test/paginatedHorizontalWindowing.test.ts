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
        const elements = Array.from(container.querySelectorAll('p'))

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
        const elements = Array.from(container.querySelectorAll('p')) as HTMLElement[]
        elements[0].style.pointerEvents = 'auto'

        mockRect(container, rect(0, 1800, 800))
        mockRect(elements[0], rect(10, 100))
        mockRect(elements[1], rect(650, 100))
        mockRect(elements[2], rect(1250, 100))

        const items = collectPaginatedHorizontalWindowItems(container, 600)
        const stats = applyPaginatedHorizontalWindow(items, { startPage: 1, endPage: 1 })

        expect(stats).toEqual({ total: 3, visible: 1, hidden: 2 })
        expect(elements[0].style.visibility).toBe('hidden')
        expect(elements[1].style.visibility).toBe('')
        expect(elements[2].getAttribute('data-vitra-horizontal-window')).toBe('hidden')
        expect(isPaginatedHorizontalWindowHiddenElement(elements[2])).toBe(true)

        restorePaginatedHorizontalWindowItems(items)

        expect(elements[0].style.visibility).toBe('')
        expect(elements[0].style.pointerEvents).toBe('auto')
        expect(elements[2].hasAttribute('data-vitra-horizontal-window')).toBe(false)
        expect(isPaginatedHorizontalWindowHiddenElement(elements[2])).toBe(false)
    })
})
