import { describe, expect, it } from 'vitest'
import { buildVirtualGridMetrics, chunkItemsIntoRows, parseGridTemplateColumnCount, resolveVisibleVirtualRows } from '@/components/Library/libraryVirtualGrid'

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

describe('parseGridTemplateColumnCount', () => {
    it('从计算后的轨道列表解析真实列数（与 item 数量无关）', () => {
        expect(parseGridTemplateColumnCount('150px 150px 150px 150px')).toBe(4)
        expect(parseGridTemplateColumnCount('237.5px 237.5px')).toBe(2)
        expect(parseGridTemplateColumnCount('300px')).toBe(1)
    })

    it('忽略零宽轨道（如折叠的 auto-fit 空轨道）', () => {
        expect(parseGridTemplateColumnCount('200px 0px 0px')).toBe(1)
    })

    it('无法解析时返回 null 以便回退到卡片计数', () => {
        expect(parseGridTemplateColumnCount('none')).toBeNull()
        expect(parseGridTemplateColumnCount('')).toBeNull()
        expect(parseGridTemplateColumnCount('   ')).toBeNull()
        expect(parseGridTemplateColumnCount(null)).toBeNull()
        expect(parseGridTemplateColumnCount(undefined)).toBeNull()
    })
})
