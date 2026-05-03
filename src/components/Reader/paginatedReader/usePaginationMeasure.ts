import { useRef, useEffect, useCallback, type RefObject } from 'react'
import { startMeasure, type MeasureHandle } from '@/engine/render/measure'
import type { PageBoundary } from '@/engine/types/pagination'
import {
    readPaginatedMeasureCache,
    writePaginatedMeasureCache,
} from '../paginatedMeasureCache'

export function usePaginationMeasure(paginationMeasureHostRef: RefObject<HTMLDivElement | null>) {
    const pageBoundariesRef = useRef<readonly PageBoundary[]>([])
    const pageMapReadyRef = useRef(false)
    const paginationMeasureSeqRef = useRef(0)
    const paginationMeasureHandleRef = useRef<MeasureHandle | null>(null)
    const measureCacheRef = useRef<Map<string, readonly PageBoundary[]>>(new Map())

    const abortPaginationMeasure = useCallback(() => {
        if (paginationMeasureHandleRef.current) {
            paginationMeasureHandleRef.current.abort()
            paginationMeasureHandleRef.current = null
        }
    }, [])

    const measureBoundariesInShadow = useCallback(async (
        sourceNode: HTMLElement,
        viewportHeight: number,
        cacheKey: string | null = null,
    ): Promise<readonly PageBoundary[]> => {
        const host = paginationMeasureHostRef.current
        if (!host || viewportHeight <= 0) return []

        const cachedBoundaries = readPaginatedMeasureCache(measureCacheRef.current, cacheKey)
        if (cachedBoundaries) {
            abortPaginationMeasure()
            paginationMeasureSeqRef.current += 1
            pageBoundariesRef.current = cachedBoundaries
            pageMapReadyRef.current = true
            return cachedBoundaries
        }

        abortPaginationMeasure()
        const measureSeq = ++paginationMeasureSeqRef.current

        const handle = startMeasure({
            sourceNode,
            viewportHeight,
            host,
            onProgress: (progress) => {
                if (measureSeq !== paginationMeasureSeqRef.current) return
                pageBoundariesRef.current = progress.boundaries
                pageMapReadyRef.current = progress.done
            },
        })
        paginationMeasureHandleRef.current = handle

        const boundaries = await handle.result
        if (measureSeq !== paginationMeasureSeqRef.current) return []
        paginationMeasureHandleRef.current = null
        pageBoundariesRef.current = boundaries
        pageMapReadyRef.current = true
        writePaginatedMeasureCache(measureCacheRef.current, cacheKey, boundaries)
        return boundaries
    }, [abortPaginationMeasure, paginationMeasureHostRef])

    useEffect(() => {
        return () => { abortPaginationMeasure() }
    }, [abortPaginationMeasure])

    return { abortPaginationMeasure, measureBoundariesInShadow, pageBoundariesRef, pageMapReadyRef }
}
