import type { PageBoundary } from '../../engine/types/vitraPagination'
import type { ReaderStyleConfig } from './ShadowRenderer'

const DEFAULT_PAGINATED_MEASURE_CACHE_LIMIT = 24

type PaginatedMeasureMode = 'paginated-single' | 'paginated-double'

export interface PaginatedMeasureCacheKeyInput {
    bookId: string
    spineIndex: number
    viewportWidth: number
    viewportHeight: number
    pageTurnMode: PaginatedMeasureMode
    readerStyles: Pick<
        ReaderStyleConfig,
        | 'fontSize'
        | 'fontFamily'
        | 'lineHeight'
        | 'paragraphSpacing'
        | 'textIndentEm'
        | 'letterSpacing'
        | 'textAlign'
        | 'pageWidth'
    >
}

function cloneBoundaries(boundaries: readonly PageBoundary[]): readonly PageBoundary[] {
    return boundaries.map((boundary) => ({ ...boundary }))
}

export function buildPaginatedMeasureCacheKey(input: PaginatedMeasureCacheKeyInput): string {
    return JSON.stringify({
        bookId: input.bookId,
        spineIndex: input.spineIndex,
        viewportWidth: Math.max(1, Math.floor(input.viewportWidth)),
        viewportHeight: Math.max(1, Math.floor(input.viewportHeight)),
        pageTurnMode: input.pageTurnMode,
        layout: {
            fontSize: input.readerStyles.fontSize,
            fontFamily: input.readerStyles.fontFamily,
            lineHeight: input.readerStyles.lineHeight,
            paragraphSpacing: input.readerStyles.paragraphSpacing,
            textIndentEm: input.readerStyles.textIndentEm,
            letterSpacing: input.readerStyles.letterSpacing,
            textAlign: input.readerStyles.textAlign,
            pageWidth: input.readerStyles.pageWidth,
        },
    })
}

export function readPaginatedMeasureCache(
    cache: Map<string, readonly PageBoundary[]>,
    cacheKey: string | null,
): readonly PageBoundary[] | null {
    if (!cacheKey) return null
    const cached = cache.get(cacheKey)
    if (!cached) return null

    cache.delete(cacheKey)
    cache.set(cacheKey, cached)
    return cloneBoundaries(cached)
}

export function writePaginatedMeasureCache(
    cache: Map<string, readonly PageBoundary[]>,
    cacheKey: string | null,
    boundaries: readonly PageBoundary[],
    maxEntries: number = DEFAULT_PAGINATED_MEASURE_CACHE_LIMIT,
): void {
    if (!cacheKey || boundaries.length === 0) return

    cache.delete(cacheKey)
    cache.set(cacheKey, cloneBoundaries(boundaries))

    while (cache.size > maxEntries) {
        const oldestKey = cache.keys().next().value
        if (!oldestKey) break
        cache.delete(oldestKey)
    }
}
