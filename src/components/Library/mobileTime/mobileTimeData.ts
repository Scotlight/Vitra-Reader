import type { BookReadingStatsItem, DailyReadingStatsItem } from '@/services/readingStatsService'

/**
 * 移动端阅读时间页数据派生 —— 纯函数，无 IO、无 React（与 mobileHomeData 同构）。
 * 取数（IndexedDB）留给组件 effect，这里只做归一化/格式化，便于单测锁行为。
 */

/**
 * 柱图归一化：每根柱子相对最高柱的高度比（0~1）。
 * 全 0（新用户/近期没读）时返回全 0 而不是 0/0=NaN，消费方据此走空态。
 */
export function normalizeTrendBars(trend: readonly DailyReadingStatsItem[]): readonly number[] {
    const max = trend.reduce((acc, item) => Math.max(acc, item.activeMs), 0)
    if (max <= 0) return trend.map(() => 0)
    return trend.map((item) => item.activeMs / max)
}

/**
 * 排行占比条：相对榜首的比例（首位恒为 1）。榜首为 0 时全 0，避免 NaN。
 * 输入已按 activeMs 降序（loadReadingStatsSummary 的既有约定），这里不重排。
 */
export function toTopBookRatios(items: readonly BookReadingStatsItem[]): readonly number[] {
    const top = items[0]?.activeMs ?? 0
    if (top <= 0) return items.map(() => 0)
    return items.map((item) => Math.min(1, item.activeMs / top))
}

/**
 * 移动端紧凑时长："42小时18分钟" 级别的信息在 25px 大数字 stat 卡里放不下，
 * 压成 "42h" / "18m" / "<1m"。排行列表里的时长仍用 formatDurationLabel
 * （那里空间够、中文更清楚）——两处不同是刻意的。
 */
export function formatCompactDuration(ms: number): string {
    const normalizedMs = Math.max(0, Math.round(ms))
    if (normalizedMs === 0) return '0m'
    const totalMinutes = Math.floor(normalizedMs / 60_000)
    if (totalMinutes < 1) return '<1m'
    if (totalMinutes < 60) return `${totalMinutes}m`
    return `${Math.floor(totalMinutes / 60)}h`
}

/** 柱图当日索引。trend 最后一条即今天（loadDailyActiveTrend 锚点约定），抽成函数让测试锁住这个约定 */
export function resolveTodayBarIndex(trend: readonly DailyReadingStatsItem[]): number {
    return trend.length - 1
}
