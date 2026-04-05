import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, waitFor } from '@testing-library/react'
import type { BookMeta } from '../services/storageService'
import { BookGrid, type LibraryGridItem } from '../components/Library/BookGrid'

vi.mock('framer-motion', () => ({
    motion: {
        div: (props: React.HTMLAttributes<HTMLDivElement>) => React.createElement('div', props),
    },
}))

vi.mock('../services/storageService', async () => {
    const actual = await vi.importActual<typeof import('../services/storageService')>('../services/storageService')
    return {
        ...actual,
        getBookCover: vi.fn(async () => null),
    }
})

class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
}

function createBook(index: number): BookMeta {
    return {
        id: `book-${index}`,
        title: `Book ${index}`,
        author: 'Author',
        fileSize: 1024,
        addedAt: 1_000 + index,
        lastReadAt: 2_000 + index,
        format: 'epub',
    }
}

function installLayoutMocks() {
    const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect
    const originalOffsetTop = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetTop')
    const originalOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')

    Object.defineProperty(HTMLElement.prototype, 'offsetTop', {
        configurable: true,
        get() {
            const element = this as HTMLElement
            if (element.dataset.virtualCard === 'true') {
                const cards = Array.from(document.querySelectorAll<HTMLElement>('[data-virtual-card="true"]'))
                const index = cards.indexOf(element)
                if (index >= 0) return Math.floor(index / 4) * 118
            }
            if (element.dataset.rowIndex) {
                return Number.parseInt(element.dataset.rowIndex, 10) * 100
            }
            return 0
        },
    })

    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
        configurable: true,
        get() {
            const element = this as HTMLElement
            if (element.dataset.virtualCard === 'true') return 100
            if (element.dataset.rowIndex) return 100
            return 0
        },
    })

    Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
        configurable: true,
        value() {
            const element = this as HTMLElement
            const isScrollContainer = element.dataset.scrollContainer === 'true'
            const top = isScrollContainer ? 0 : element.offsetTop
            const height = isScrollContainer ? 240 : element.offsetHeight
            const width = isScrollContainer ? 800 : 150
            return {
                x: 0,
                y: top,
                top,
                left: 0,
                bottom: top + height,
                right: width,
                width,
                height,
                toJSON: () => ({}),
            } as DOMRect
        },
    })

    return () => {
        Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
            configurable: true,
            value: originalGetBoundingClientRect,
        })
        if (originalOffsetTop) {
            Object.defineProperty(HTMLElement.prototype, 'offsetTop', originalOffsetTop)
        }
        if (originalOffsetHeight) {
            Object.defineProperty(HTMLElement.prototype, 'offsetHeight', originalOffsetHeight)
        }
    }
}

async function flushUi() {
    for (let index = 0; index < 4; index += 1) {
        await act(async () => {
            await Promise.resolve()
            await new Promise((resolve) => window.setTimeout(resolve, 0))
        })
    }
}

describe('BookGrid virtual flow', () => {
    let restoreLayoutMocks: (() => void) | null = null

    beforeEach(() => {
        vi.stubGlobal('ResizeObserver', ResizeObserverMock)
        vi.stubGlobal('requestAnimationFrame', ((callback: FrameRequestCallback) => {
            return window.setTimeout(() => callback(performance.now()), 0)
        }) as typeof requestAnimationFrame)
        vi.stubGlobal('cancelAnimationFrame', ((handle: number) => {
            window.clearTimeout(handle)
        }) as typeof cancelAnimationFrame)
        restoreLayoutMocks = installLayoutMocks()
    })

    afterEach(() => {
        restoreLayoutMocks?.()
        restoreLayoutMocks = null
        vi.restoreAllMocks()
        vi.unstubAllGlobals()
    })

    it('初次布局后只渲染窗口内虚拟行，并在滚动后切换行范围', async () => {
        const items: LibraryGridItem[] = Array.from({ length: 40 }, (_, index) => ({
            key: `book-${index}`,
            type: 'book' as const,
            book: createBook(index),
        }))
        const scrollContainer = document.createElement('div')
        scrollContainer.dataset.scrollContainer = 'true'
        Object.defineProperty(scrollContainer, 'clientWidth', {
            configurable: true,
            value: 800,
        })
        Object.defineProperty(scrollContainer, 'clientHeight', {
            configurable: true,
            value: 240,
        })

        const view = render(
            <BookGrid
                items={items}
                emptyMessage="empty"
                progressMap={{}}
                onOpenBook={vi.fn()}
                onOpenGroup={vi.fn()}
                onContextMenu={vi.fn()}
                scrollContainer={scrollContainer}
                sortable={false}
                sortContextKey={null}
            />
        )

        await flushUi()

        await waitFor(() => {
            expect(view.container.querySelector('[data-testid="book-grid-virtual"]')).not.toBeNull()
        })

        const initialRows = Array.from(view.container.querySelectorAll<HTMLElement>('[data-row-index]'))
            .map((row) => Number.parseInt(row.dataset.rowIndex || '-1', 10))
        expect(initialRows[0]).toBe(0)
        expect(initialRows.length).toBeLessThan(10)

        scrollContainer.scrollTop = 700
        scrollContainer.dispatchEvent(new Event('scroll'))
        await flushUi()

        const scrolledRows = Array.from(view.container.querySelectorAll<HTMLElement>('[data-row-index]'))
            .map((row) => Number.parseInt(row.dataset.rowIndex || '-1', 10))
        expect(scrolledRows[0]).toBeGreaterThan(0)
    })
})
