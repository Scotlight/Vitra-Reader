import { describe, expect, it } from 'vitest'
import type { PageBoundary } from '@/engine/types/vitraPagination'
import {
    buildPaginatedMeasureCacheKey,
    readPaginatedMeasureCache,
    writePaginatedMeasureCache,
} from '@/components/Reader/paginatedMeasureCache'

const DEFAULT_INPUT = {
    bookId: 'book-1',
    spineIndex: 3,
    viewportWidth: 1200,
    viewportHeight: 800,
    pageTurnMode: 'paginated-single' as const,
    readerStyles: {
        fontSize: 16,
        fontFamily: 'Georgia',
        lineHeight: 1.6,
        paragraphSpacing: 12,
        textIndentEm: 0,
        letterSpacing: 0,
        textAlign: 'left',
        pageWidth: 900,
    },
}

function createBoundaries(): readonly PageBoundary[] {
    return [
        { sectionIndex: 0, startBlock: 0, endBlock: 2, startOffset: 0, endOffset: 320 },
        { sectionIndex: 0, startBlock: 2, endBlock: 4, startOffset: 0, endOffset: 300 },
    ]
}

describe('paginatedMeasureCache', () => {
    it('缓存键会区分影响分页的视口和版式参数', () => {
        const base = buildPaginatedMeasureCacheKey(DEFAULT_INPUT)
        const changedViewport = buildPaginatedMeasureCacheKey({
            ...DEFAULT_INPUT,
            viewportWidth: 1280,
        })
        const changedTypography = buildPaginatedMeasureCacheKey({
            ...DEFAULT_INPUT,
            readerStyles: {
                ...DEFAULT_INPUT.readerStyles,
                fontSize: 18,
            },
        })

        expect(changedViewport).not.toBe(base)
        expect(changedTypography).not.toBe(base)
    })

    it('命中缓存时返回克隆结果，避免外部修改污染缓存', () => {
        const cache = new Map<string, readonly PageBoundary[]>()
        const key = buildPaginatedMeasureCacheKey(DEFAULT_INPUT)

        writePaginatedMeasureCache(cache, key, createBoundaries())
        const cached = readPaginatedMeasureCache(cache, key)

        expect(cached).toEqual(createBoundaries())
        expect(cached).not.toBe(cache.get(key))

        const mutated = cached as PageBoundary[]
        mutated[0].endOffset = 999

        expect(readPaginatedMeasureCache(cache, key)).toEqual(createBoundaries())
    })

    it('超过上限时淘汰最旧缓存项', () => {
        const cache = new Map<string, readonly PageBoundary[]>()

        const firstKey = buildPaginatedMeasureCacheKey(DEFAULT_INPUT)
        const secondKey = buildPaginatedMeasureCacheKey({
            ...DEFAULT_INPUT,
            spineIndex: 4,
        })
        const thirdKey = buildPaginatedMeasureCacheKey({
            ...DEFAULT_INPUT,
            spineIndex: 5,
        })

        writePaginatedMeasureCache(cache, firstKey, createBoundaries(), 2)
        writePaginatedMeasureCache(cache, secondKey, createBoundaries(), 2)
        writePaginatedMeasureCache(cache, thirdKey, createBoundaries(), 2)

        expect(readPaginatedMeasureCache(cache, firstKey)).toBeNull()
        expect(readPaginatedMeasureCache(cache, secondKey)).toEqual(createBoundaries())
        expect(readPaginatedMeasureCache(cache, thirdKey)).toEqual(createBoundaries())
    })
})
