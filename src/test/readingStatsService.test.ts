import { describe, expect, it } from 'vitest'
import {
    estimateRemainingMsFromProgress,
    formatDurationLabel,
    resolveReadingStatsCutoffDateKey,
    resolvePeriodDateKeys,
    toLocalDateKey,
} from '@/services/readingStatsService'

describe('readingStatsService', () => {
    it('按本地日期生成 day/week/month 的日期键', () => {
        const anchorMs = new Date(2026, 3, 19, 10, 30, 0, 0).getTime()

        expect(toLocalDateKey(anchorMs)).toBe('2026-04-19')
        expect(resolvePeriodDateKeys('day', anchorMs)).toEqual(['2026-04-19'])
        expect(resolvePeriodDateKeys('week', anchorMs)).toEqual([
            '2026-04-13',
            '2026-04-14',
            '2026-04-15',
            '2026-04-16',
            '2026-04-17',
            '2026-04-18',
            '2026-04-19',
        ])

        const monthKeys = resolvePeriodDateKeys('month', anchorMs)
        expect(monthKeys[0]).toBe('2026-04-01')
        expect(monthKeys.at(-1)).toBe('2026-04-19')
        expect(monthKeys).toHaveLength(19)
    })

    it('按阅读进度估算剩余时间', () => {
        expect(estimateRemainingMsFromProgress(600_000, 0.5)).toBe(600_000)
        expect(estimateRemainingMsFromProgress(600_000, 0.01)).toBeNull()
        expect(estimateRemainingMsFromProgress(600_000, 1)).toBe(0)
        expect(estimateRemainingMsFromProgress(Number.NaN, 0.5)).toBeNull()
    })

    it('按保留天数计算统计数据截断日期', () => {
        const anchorMs = new Date(2026, 3, 19, 10, 30, 0, 0).getTime()
        expect(resolveReadingStatsCutoffDateKey(anchorMs, 30)).toBe('2026-03-21')
        expect(resolveReadingStatsCutoffDateKey(anchorMs, 1)).toBe('2026-04-19')
    })

    it('格式化阅读时长文案', () => {
        expect(formatDurationLabel(3_723_000)).toBe('1小时2分钟')
        expect(formatDurationLabel(125_000)).toBe('2分钟5秒')
        expect(formatDurationLabel(900)).toBe('0秒')
    })
})
