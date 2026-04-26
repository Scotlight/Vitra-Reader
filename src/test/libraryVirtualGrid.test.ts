import { describe, expect, it } from 'vitest'
import { buildVirtualGridMetrics, chunkItemsIntoRows, resolveVisibleVirtualRows } from '@/components/Library/libraryVirtualGrid'

describe('libraryVirtualGrid', () => {
    it('按列数把项目切成行', () => {
        expect(chunkItemsIntoRows([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
    })

    it('基于实测行高与估算行高生成累计偏移', () => {
        const metrics = buildVirtualGridMetrics(4, 18, 100, new Map([
            [1, 120],
            [3, 90],
        ]))

        expect(metrics.rowTops).toEqual([0, 118, 256, 374])
        expect(metrics.rowHeights).toEqual([100, 120, 100, 90])
        expect(metrics.totalHeight).toBe(464)
    })

    it('根据滚动窗口和 overscan 返回可见行范围', () => {
        const metrics = buildVirtualGridMetrics(5, 18, 100, new Map([
            [2, 140],
        ]))

        expect(resolveVisibleVirtualRows(metrics, 130, 120, 20)).toEqual({ startRow: 1, endRow: 3 })
        expect(resolveVisibleVirtualRows(metrics, 420, 120, 20)).toEqual({ startRow: 3, endRow: 4 })
    })
})
