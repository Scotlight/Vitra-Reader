import { useRef, useEffect, useCallback, type RefObject } from 'react'
import { startMeasure, type VitraMeasureHandle, type PageBoundary } from '../../../engine'

export function usePaginationMeasure(paginationMeasureHostRef: RefObject<HTMLDivElement | null>) {
    const pageBoundariesRef = useRef<readonly PageBoundary[]>([])
    const pageMapReadyRef = useRef(false)
    const paginationMeasureSeqRef = useRef(0)
    const paginationMeasureHandleRef = useRef<VitraMeasureHandle | null>(null)

    const abortPaginationMeasure = useCallback(() => {
        if (paginationMeasureHandleRef.current) {
            paginationMeasureHandleRef.current.abort()
            paginationMeasureHandleRef.current = null
        }
    }, [])

    const measureBoundariesInShadow = useCallback(async (
        sourceNode: HTMLElement,
        viewportHeight: number,
    ): Promise<readonly PageBoundary[]> => {
        const host = paginationMeasureHostRef.current
        if (!host || viewportHeight <= 0) return []

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
        pageMapReadyRef.current = true
        return boundaries
    }, [abortPaginationMeasure, paginationMeasureHostRef])

    useEffect(() => {
        return () => { abortPaginationMeasure() }
    }, [abortPaginationMeasure])

    return { abortPaginationMeasure, measureBoundariesInShadow, pageBoundariesRef, pageMapReadyRef }
}
