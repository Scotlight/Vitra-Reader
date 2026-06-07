import {
    formatDurationLabel,
    type DailyReadingStatsItem,
} from '@/services/readingStatsService'
import styles from './TrendChart.module.css'

interface TrendChartProps {
    activeDayCount: number
    dailyTrend: DailyReadingStatsItem[]
}

export function TrendChart({ activeDayCount, dailyTrend }: TrendChartProps) {
    const maxDailyMs = Math.max(...dailyTrend.map((day) => day.activeMs), 0)

    return (
        <section className={styles.reportSection} data-testid="monthly-trend-chart">
            <div className={styles.sectionTitle}>
                <h3>每日趋势</h3>
                <span>{activeDayCount > 0 ? `本月已有 ${activeDayCount} 天阅读记录` : '本月暂无阅读记录'}</span>
            </div>
            <div className={styles.dailyTrend}>
                {dailyTrend.map((day) => {
                    const heightPercent = maxDailyMs > 0 ? Math.max(8, (day.activeMs / maxDailyMs) * 100) : 0
                    return (
                        <div key={day.dateKey} className={styles.dailyBarItem} title={`${day.dateKey}：${formatDurationLabel(day.activeMs)}`}>
                            <div className={styles.dailyBarTrack}>
                                <div className={styles.dailyBarFill} style={{ height: `${heightPercent}%` }} />
                            </div>
                            <span className={styles.dailyBarLabel}>{Number(day.dateKey.slice(-2))}</span>
                        </div>
                    )
                })}
            </div>
        </section>
    )
}
