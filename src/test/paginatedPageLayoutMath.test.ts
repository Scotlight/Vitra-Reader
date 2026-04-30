import { describe, expect, it } from 'vitest'
import {
    clampPaginatedPage,
    formatPaginatedTranslateX,
    resolvePaginatedPageCount,
    resolvePaginatedPageFromOffset,
} from '@/components/Reader/paginatedReader/paginatedPageLayoutMath'

describe('paginatedPageLayoutMath', () => {
    it('页面数量会消除 scrollWidth 浮点尾差', () => {
        expect(resolvePaginatedPageCount(1200.4, 600)).toBe(2)
        expect(resolvePaginatedPageCount(1201, 600)).toBe(3)
        expect(resolvePaginatedPageCount(0, 600)).toBe(1)
    })

    it('页码会约束在有效范围内', () => {
        expect(clampPaginatedPage(-1, 3)).toBe(0)
        expect(clampPaginatedPage(5, 3)).toBe(2)
        expect(clampPaginatedPage(1.8, 3)).toBe(1)
    })

    it('水平偏移可以解析到对应页面', () => {
        expect(resolvePaginatedPageFromOffset(0, 600, 3)).toBe(0)
        expect(resolvePaginatedPageFromOffset(650, 600, 3)).toBe(1)
        expect(resolvePaginatedPageFromOffset(9999, 600, 3)).toBe(2)
    })

    it('水平位移格式统一输出 translateX', () => {
        expect(formatPaginatedTranslateX(2, 600)).toBe('translateX(-1200px)')
        expect(formatPaginatedTranslateX(-1, 600)).toBe('translateX(0px)')
    })
})
