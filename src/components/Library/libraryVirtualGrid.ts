export interface VirtualGridMetrics {
    rowTops: number[]
    rowHeights: number[]
    totalHeight: number
}

export function chunkItemsIntoRows<T>(items: readonly T[], columnCount: number): T[][] {
    const safeColumnCount = Number.isFinite(columnCount) && columnCount > 0 ? Math.floor(columnCount) : 1
    const rows: T[][] = []
    for (let index = 0; index < items.length; index += safeColumnCount) {
        rows.push(items.slice(index, index + safeColumnCount))
    }
    return rows
}

export function buildVirtualGridMetrics(
    rowCount: number,
    rowGap: number,
    estimatedRowHeight: number,
    measuredRowHeights: ReadonlyMap<number, number>,
): VirtualGridMetrics {
    const safeRowCount = Math.max(0, Math.floor(rowCount))
    const safeRowGap = Number.isFinite(rowGap) && rowGap > 0 ? rowGap : 0
    const safeEstimatedRowHeight = Number.isFinite(estimatedRowHeight) && estimatedRowHeight > 0 ? estimatedRowHeight : 1
    const rowTops = new Array<number>(safeRowCount)
    const rowHeights = new Array<number>(safeRowCount)

    let offsetTop = 0
    for (let rowIndex = 0; rowIndex < safeRowCount; rowIndex += 1) {
        rowTops[rowIndex] = offsetTop
        const measuredHeight = measuredRowHeights.get(rowIndex)
        const resolvedHeight = Number.isFinite(measuredHeight) && (measuredHeight || 0) > 0
            ? (measuredHeight as number)
            : safeEstimatedRowHeight
        rowHeights[rowIndex] = resolvedHeight
        offsetTop += resolvedHeight
        if (rowIndex < safeRowCount - 1) {
            offsetTop += safeRowGap
        }
    }

    return {
        rowTops,
        rowHeights,
        totalHeight: offsetTop,
    }
}

export function resolveVisibleVirtualRows(
    metrics: VirtualGridMetrics,
    scrollTop: number,
    viewportHeight: number,
    overscanPx: number,
): { startRow: number; endRow: number } {
    const rowCount = metrics.rowTops.length
    if (rowCount === 0) {
        return { startRow: 0, endRow: -1 }
    }

    const safeScrollTop = Number.isFinite(scrollTop) ? Math.max(0, scrollTop) : 0
    const safeViewportHeight = Number.isFinite(viewportHeight) ? Math.max(0, viewportHeight) : 0
    const safeOverscanPx = Number.isFinite(overscanPx) ? Math.max(0, overscanPx) : 0
    const lowerBound = Math.max(0, safeScrollTop - safeOverscanPx)
    const upperBound = safeScrollTop + safeViewportHeight + safeOverscanPx

    let startRow = 0
    while (startRow < rowCount && metrics.rowTops[startRow] + metrics.rowHeights[startRow] < lowerBound) {
        startRow += 1
    }
    if (startRow >= rowCount) {
        const lastRow = rowCount - 1
        return { startRow: lastRow, endRow: lastRow }
    }

    let endRow = startRow
    while (endRow < rowCount - 1 && metrics.rowTops[endRow] < upperBound) {
        endRow += 1
    }

    return { startRow, endRow }
}
