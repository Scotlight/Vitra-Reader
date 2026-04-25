import { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react'
import { buildVirtualGridMetrics, chunkItemsIntoRows, resolveVisibleVirtualRows } from '../libraryVirtualGrid'
import type { LibraryGridItem } from '../BookGrid'

const PROBE_CARD_LIMIT = 24
const ROW_OVERSCAN_COUNT = 2
const ROW_GROUP_EPSILON_PX = 2

interface VirtualGridLayoutSnapshot {
    columnCount: number
    rowGap: number
    columnGap: number
    topPadding: number
    gridTopOffset: number
    initialEstimatedRowHeight: number
}

function readPixelValue(value: string): number {
    const parsed = Number.parseFloat(value)
    return Number.isFinite(parsed) ? parsed : 0
}

function collectVirtualGridProbeLayout(
    probeGrid: HTMLDivElement,
    scrollContainer: HTMLDivElement,
): (VirtualGridLayoutSnapshot & { initialRowHeights: Map<number, number> }) | null {
    const cards = Array.from(probeGrid.querySelectorAll<HTMLElement>('[data-virtual-card="true"]'))
    if (cards.length === 0) return null

    const computedStyle = window.getComputedStyle(probeGrid)
    const rowGap = readPixelValue(computedStyle.rowGap)
    const columnGap = readPixelValue(computedStyle.columnGap)
    const topPadding = readPixelValue(computedStyle.paddingTop)
    const rows: Array<{ top: number; count: number; height: number }> = []

    cards.forEach((card) => {
        const cardTop = card.offsetTop
        const cardHeight = Math.ceil(card.getBoundingClientRect().height || card.offsetHeight)
        const existingRow = rows.find((row) => Math.abs(row.top - cardTop) <= ROW_GROUP_EPSILON_PX)
        if (existingRow) {
            existingRow.count += 1
            existingRow.height = Math.max(existingRow.height, cardHeight)
            return
        }
        rows.push({ top: cardTop, count: 1, height: cardHeight })
    })

    rows.sort((left, right) => left.top - right.top)
    const columnCount = Math.max(1, rows[0]?.count ?? 1)
    const initialRowHeights = new Map<number, number>()
    rows.forEach((row, rowIndex) => {
        initialRowHeights.set(rowIndex, row.height)
    })

    const estimatedRowHeight = rows.reduce((sum, row) => sum + row.height, 0) / rows.length
    const scrollRect = scrollContainer.getBoundingClientRect()
    const gridRect = probeGrid.getBoundingClientRect()

    return {
        columnCount,
        rowGap,
        columnGap,
        topPadding,
        gridTopOffset: gridRect.top - scrollRect.top + scrollContainer.scrollTop,
        initialEstimatedRowHeight: Number.isFinite(estimatedRowHeight) && estimatedRowHeight > 0 ? estimatedRowHeight : 1,
        initialRowHeights,
    }
}

interface UseVirtualBookGridLayoutOptions {
    items: LibraryGridItem[]
    scrollContainer: HTMLDivElement | null
    onItemsReset: () => void
}

export function useVirtualBookGridLayout({ items, scrollContainer, onItemsReset }: UseVirtualBookGridLayoutOptions) {
    const probeGridRef = useRef<HTMLDivElement | null>(null)
    const rowElementMapRef = useRef(new Map<number, HTMLDivElement>())
    const [layout, setLayout] = useState<VirtualGridLayoutSnapshot | null>(null)
    const [measuredRowHeights, setMeasuredRowHeights] = useState<Map<number, number>>(new Map())
    const [viewport, setViewport] = useState({ scrollTop: 0, height: 0 })
    const [layoutResetToken, forceLayoutReset] = useReducer((value: number) => value + 1, 0)
    const itemSignature = useMemo(
        () => items.map((item) => `${item.type}:${item.key}`).join('\u001f'),
        [items],
    )

    useEffect(() => {
        rowElementMapRef.current.clear()
        setMeasuredRowHeights(new Map())
        setLayout(null)
        onItemsReset()
    }, [itemSignature, onItemsReset])

    useEffect(() => {
        if (!scrollContainer) return

        let frameId: number | null = null
        let lastWidth = scrollContainer.clientWidth
        const updateViewport = () => {
            setViewport({
                scrollTop: scrollContainer.scrollTop,
                height: scrollContainer.clientHeight,
            })
        }
        const scheduleViewportUpdate = () => {
            if (frameId !== null) return
            frameId = window.requestAnimationFrame(() => {
                frameId = null
                updateViewport()
            })
        }

        updateViewport()
        scrollContainer.addEventListener('scroll', scheduleViewportUpdate, { passive: true })

        const resizeObserver = typeof ResizeObserver !== 'undefined'
            ? new ResizeObserver(() => {
                scheduleViewportUpdate()
                const nextWidth = scrollContainer.clientWidth
                if (Math.abs(nextWidth - lastWidth) > 1) {
                    lastWidth = nextWidth
                    rowElementMapRef.current.clear()
                    setMeasuredRowHeights(new Map())
                    setLayout(null)
                    forceLayoutReset()
                }
            })
            : null

        resizeObserver?.observe(scrollContainer)

        return () => {
            scrollContainer.removeEventListener('scroll', scheduleViewportUpdate)
            resizeObserver?.disconnect()
            if (frameId !== null) {
                window.cancelAnimationFrame(frameId)
            }
        }
    }, [scrollContainer])

    useLayoutEffect(() => {
        if (layout || !scrollContainer || !probeGridRef.current) return

        const frameId = window.requestAnimationFrame(() => {
            const nextLayout = collectVirtualGridProbeLayout(probeGridRef.current!, scrollContainer)
            if (!nextLayout) return
            setMeasuredRowHeights(new Map(nextLayout.initialRowHeights))
            setLayout({
                columnCount: nextLayout.columnCount,
                rowGap: nextLayout.rowGap,
                columnGap: nextLayout.columnGap,
                topPadding: nextLayout.topPadding,
                gridTopOffset: nextLayout.gridTopOffset,
                initialEstimatedRowHeight: nextLayout.initialEstimatedRowHeight,
            })
        })

        return () => {
            window.cancelAnimationFrame(frameId)
        }
    }, [layout, scrollContainer, layoutResetToken])

    const effectiveEstimatedRowHeight = useMemo(() => {
        if (!layout) return 1
        if (measuredRowHeights.size === 0) return layout.initialEstimatedRowHeight
        let total = 0
        measuredRowHeights.forEach((value) => {
            total += value
        })
        return total / measuredRowHeights.size
    }, [layout, measuredRowHeights])

    const rows = useMemo(
        () => chunkItemsIntoRows(items, layout?.columnCount ?? 1),
        [items, layout?.columnCount],
    )

    const metrics = useMemo(() => {
        if (!layout) return null
        return buildVirtualGridMetrics(rows.length, layout.rowGap, effectiveEstimatedRowHeight, measuredRowHeights)
    }, [layout, rows.length, effectiveEstimatedRowHeight, measuredRowHeights])

    const visibleRange = useMemo(() => {
        if (!layout || !metrics) return { startRow: 0, endRow: -1 }
        const effectiveScrollTop = Math.max(0, viewport.scrollTop - layout.gridTopOffset - layout.topPadding)
        return resolveVisibleVirtualRows(
            metrics,
            effectiveScrollTop,
            viewport.height,
            effectiveEstimatedRowHeight * ROW_OVERSCAN_COUNT,
        )
    }, [layout, metrics, viewport, effectiveEstimatedRowHeight])

    useEffect(() => {
        if (!layout || typeof ResizeObserver === 'undefined') return

        const resizeObserver = new ResizeObserver((entries) => {
            setMeasuredRowHeights((previous) => {
                let next = previous
                let changed = false
                entries.forEach((entry) => {
                    const rowIndex = Number((entry.target as HTMLElement).dataset.rowIndex)
                    const nextHeight = Math.ceil(entry.contentRect.height)
                    if (!Number.isFinite(rowIndex) || nextHeight <= 0 || previous.get(rowIndex) === nextHeight) return
                    if (!changed) {
                        next = new Map(previous)
                        changed = true
                    }
                    next.set(rowIndex, nextHeight)
                })
                return changed ? next : previous
            })
        })

        rowElementMapRef.current.forEach((node, rowIndex) => {
            if (rowIndex < visibleRange.startRow || rowIndex > visibleRange.endRow) return
            resizeObserver.observe(node)
        })

        return () => {
            resizeObserver.disconnect()
        }
    }, [layout, visibleRange.startRow, visibleRange.endRow])

    return {
        probeGridRef,
        rowElementMapRef,
        layout,
        metrics,
        rows,
        visibleRange,
        probeItems: items.slice(0, PROBE_CARD_LIMIT),
    }
}
