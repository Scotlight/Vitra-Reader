import { describe, it, expect } from 'vitest'
import { paginateBlocks } from '@/engine/render/vitraPaginator'
import type { BlockMetrics } from '@/engine/types/vitraPagination'

function block(offsetTop: number, height: number, isBreakable = true): BlockMetrics {
    return { element: `p:${offsetTop}`, offsetTop, height, isBreakable }
}

describe('paginateBlocks', () => {
    it('空块列表返回空数组', () => {
        expect(paginateBlocks([], 800)).toEqual([])
    })

    it('单个小于视口高度的块占一页', () => {
        const pages = paginateBlocks([block(0, 100)], 800)
        expect(pages).toHaveLength(1)
        expect(pages[0].startBlock).toBe(0)
        expect(pages[0].endBlock).toBe(0)
    })

    it('多个块恰好填满一页', () => {
        const blocks = [block(0, 200), block(200, 200), block(400, 200), block(600, 200)]
        const pages = paginateBlocks(blocks, 800)
        expect(pages).toHaveLength(1)
    })

    it('超出视口高度时分为两页', () => {
        const blocks = [block(0, 400), block(400, 400), block(800, 400)]
        const pages = paginateBlocks(blocks, 800)
        expect(pages.length).toBeGreaterThanOrEqual(2)
    })

    it('不可分割块（img）整体移到下一页', () => {
        const blocks = [
            block(0, 750, true),
            block(750, 300, false), // img，超出剩余空间
        ]
        const pages = paginateBlocks(blocks, 800)
        // img 不可拆，应放到新页
        expect(pages.length).toBeGreaterThanOrEqual(2)
        const imgInPage1 = pages[0].endBlock === 1 && pages[0].startBlock === 1
        const imgInPage2 = pages.length >= 2 && pages[1].startBlock === 1
        expect(imgInPage1 || imgInPage2).toBe(true)
    })

    it('单个块超过视口高度时按视口切分为多页', () => {
        const pages = paginateBlocks([block(0, 2400)], 800)
        // 可分割块：先取满一页(0-800)，剩余(800-2400)作为第二页
        expect(pages).toHaveLength(2)
        expect(pages[0].startBlock).toBe(0)
        expect(pages[0].endOffset).toBe(800)
        expect(pages[1].startOffset).toBe(800)
        expect(pages[1].endOffset).toBe(2400)
    })

    it('视口高度为1时不崩溃', () => {
        const pages = paginateBlocks([block(0, 100)], 1)
        expect(pages.length).toBeGreaterThan(0)
    })
})
