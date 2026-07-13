import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'

export const MIN_PINNED_SIDEBAR_WIDTH = 240
export const MAX_PINNED_SIDEBAR_WIDTH = 600
export const DEFAULT_PINNED_SIDEBAR_WIDTH = 360

export function clampPinnedSidebarWidth(width: number, viewportWidth: number): number {
    const viewportCap = Math.floor(viewportWidth / 2)
    const upperBound = Math.max(MIN_PINNED_SIDEBAR_WIDTH, Math.min(MAX_PINNED_SIDEBAR_WIDTH, viewportCap))
    return Math.min(upperBound, Math.max(MIN_PINNED_SIDEBAR_WIDTH, Math.round(width)))
}

interface PinnedSidebarResize {
    readonly isResizing: boolean
    readonly sidebarWidth: number
    readonly startResize: (event: ReactPointerEvent<HTMLElement>) => void
}

export function usePinnedSidebarResize(
    persistedWidth: number | undefined,
    onCommit: ((width: number) => void) | undefined,
): PinnedSidebarResize {
    const [dragWidth, setDragWidth] = useState<number | null>(null)
    const dragWidthRef = useRef<number | null>(null)
    const onCommitRef = useRef(onCommit)

    useEffect(() => {
        onCommitRef.current = onCommit
    }, [onCommit])

    const startResize = useCallback((event: ReactPointerEvent<HTMLElement>) => {
        if (event.button !== 0) return
        event.preventDefault()
        const width = clampPinnedSidebarWidth(event.clientX, window.innerWidth)
        dragWidthRef.current = width
        setDragWidth(width)
    }, [])

    const isResizing = dragWidth !== null

    useEffect(() => {
        if (!isResizing) return
        const handlePointerMove = (event: PointerEvent) => {
            const width = clampPinnedSidebarWidth(event.clientX, window.innerWidth)
            dragWidthRef.current = width
            setDragWidth(width)
        }
        const finishResize = () => {
            const width = dragWidthRef.current
            dragWidthRef.current = null
            setDragWidth(null)
            if (width !== null) onCommitRef.current?.(width)
        }
        window.addEventListener('pointermove', handlePointerMove)
        window.addEventListener('pointerup', finishResize)
        window.addEventListener('pointercancel', finishResize)
        return () => {
            window.removeEventListener('pointermove', handlePointerMove)
            window.removeEventListener('pointerup', finishResize)
            window.removeEventListener('pointercancel', finishResize)
        }
    }, [isResizing])

    return {
        isResizing,
        sidebarWidth: dragWidth ?? persistedWidth ?? DEFAULT_PINNED_SIDEBAR_WIDTH,
        startResize,
    }
}
