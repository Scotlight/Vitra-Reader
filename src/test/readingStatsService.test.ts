import { describe, expect, it } from 'vitest'
import {
    buildDailyActiveTrendFromRows,
    buildMonthlyReadingReportFromRows,
    countCurrentReadingStreakFromDateKeys,
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

    describe('buildDailyActiveTrendFromRows', () => {
        // 8/2 往前 5 天 = 7/29~8/2，锁住跨月窗口
        const anchorMs = new Date(2026, 7, 2, 12, 0, 0, 0).getTime()

        it('跨月滚动窗口：长度恒为 days，无记录日补 0', () => {
            const rows = [
                { id: '2026-07-30::a', dateKey: '2026-07-30', bookId: 'a', activeMs: 600_000, updatedAt: anchorMs },
                { id: '2026-08-02::a', dateKey: '2026-08-02', bookId: 'a', activeMs: 300_000, updatedAt: anchorMs },
            ]
            const trend = buildDailyActiveTrendFromRows(rows, 5, anchorMs)
            expect(trend.map((item) => item.dateKey)).toEqual([
                '2026-07-29',
                '2026-07-30',
                '2026-07-31',
                '2026-08-01',
                '2026-08-02',
            ])
            expect(trend.map((item) => item.activeMs)).toEqual([0, 600_000, 0, 0, 300_000])
        })

        it('同一天多本书相加', () => {
            const rows = [
                { id: '2026-08-02::a', dateKey: '2026-08-02', bookId: 'a', activeMs: 600_000, updatedAt: anchorMs },
                { id: '2026-08-02::b', dateKey: '2026-08-02', bookId: 'b', activeMs: 300_000, updatedAt: anchorMs },
            ]
            const trend = buildDailyActiveTrendFromRows(rows, 1, anchorMs)
            expect(trend).toEqual([{ dateKey: '2026-08-02', activeMs: 900_000 }])
        })

        it('窗口外的记录被忽略', () => {
            const rows = [
                { id: '2026-07-28::a', dateKey: '2026-07-28', bookId: 'a', activeMs: 999_000, updatedAt: anchorMs },
            ]
            const trend = buildDailyActiveTrendFromRows(rows, 5, anchorMs)
            expect(trend.every((item) => item.activeMs === 0)).toBe(true)
        })

        it('days<=0 返回空数组', () => {
            expect(buildDailyActiveTrendFromRows([], 0, anchorMs)).toEqual([])
            expect(buildDailyActiveTrendFromRows([], -3, anchorMs)).toEqual([])
        })
    })

    describe('countCurrentReadingStreakFromDateKeys', () => {
        const anchorMs = new Date(2026, 7, 2, 12, 0, 0, 0).getTime()

        it('今天没读但昨天读了：连击不清零', () => {
            const keys = new Set(['2026-07-31', '2026-08-01'])
            expect(countCurrentReadingStreakFromDateKeys(keys, anchorMs)).toBe(2)
        })

        it('今天和昨天都没读：连击为 0', () => {
            const keys = new Set(['2026-07-30'])
            expect(countCurrentReadingStreakFromDateKeys(keys, anchorMs)).toBe(0)
        })

        it('跨月连续不截断', () => {
            const keys = new Set(['2026-07-30', '2026-07-31', '2026-08-01', '2026-08-02'])
            expect(countCurrentReadingStreakFromDateKeys(keys, anchorMs)).toBe(4)
        })

        it('中断即停止回溯', () => {
            const keys = new Set(['2026-08-02', '2026-08-01', '2026-07-30'])
            expect(countCurrentReadingStreakFromDateKeys(keys, anchorMs)).toBe(2)
        })

        it('空集合返回 0', () => {
            expect(countCurrentReadingStreakFromDateKeys(new Set(), anchorMs)).toBe(0)
        })
    })
})
