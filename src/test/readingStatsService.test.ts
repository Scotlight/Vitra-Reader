import { describe, expect, it } from 'vitest'
import {
    buildMonthlyReadingReportFromRows,
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


    it('按月生成报表、热力日历和 Top 图书', () => {
        const anchorMs = new Date(2026, 3, 19, 12, 0, 0, 0).getTime()
        const rows = [
            { id: '2026-03-31::old', dateKey: '2026-03-31', bookId: 'old', activeMs: 9_999_000, updatedAt: anchorMs },
            { id: '2026-04-01::a', dateKey: '2026-04-01', bookId: 'a', activeMs: 600_000, updatedAt: anchorMs },
            { id: '2026-04-02::b', dateKey: '2026-04-02', bookId: 'b', activeMs: 1_200_000, updatedAt: anchorMs },
            { id: '2026-04-04::a', dateKey: '2026-04-04', bookId: 'a', activeMs: 1_800_000, updatedAt: anchorMs },
            { id: '2026-04-05::a', dateKey: '2026-04-05', bookId: 'a', activeMs: 300_000, updatedAt: anchorMs },
            { id: '2026-04-19::b', dateKey: '2026-04-19', bookId: 'b', activeMs: 900_000, updatedAt: anchorMs },
            { id: '2026-04-20::future', dateKey: '2026-04-20', bookId: 'future', activeMs: 9_999_000, updatedAt: anchorMs },
        ]

        const report = buildMonthlyReadingReportFromRows(rows, anchorMs)

        expect(report.monthKey).toBe('2026-04')
        expect(report.startDateKey).toBe('2026-04-01')
        expect(report.endDateKey).toBe('2026-04-19')
        expect(report.calendarEndDateKey).toBe('2026-04-30')
        expect(report.totalActiveMs).toBe(4_800_000)
        expect(report.todayActiveMs).toBe(900_000)
        expect(report.activeDayCount).toBe(5)
        expect(report.longestStreakDays).toBe(2)
        expect(report.byBook).toEqual([
            { bookId: 'a', activeMs: 2_700_000 },
            { bookId: 'b', activeMs: 2_100_000 },
        ])
        expect(report.dailyTrend).toHaveLength(19)
        expect(report.calendarDays).toHaveLength(30)
        expect(report.calendarDays[0]).toMatchObject({ dateKey: '2026-04-01', dayOfMonth: 1, weekday: 3, isFuture: false })
        expect(report.calendarDays[18]).toMatchObject({ dateKey: '2026-04-19', isToday: true, activeMs: 900_000 })
        expect(report.calendarDays[19]).toMatchObject({ dateKey: '2026-04-20', isFuture: true, activeMs: 0 })
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
