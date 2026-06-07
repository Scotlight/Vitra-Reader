import {
    formatDurationLabel,
    type MonthlyCalendarDay,
} from '@/services/readingStatsService'
import styles from './MonthlyCalendar.module.css'

const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六']

function getHeatLevel(activeMs: number, maxActiveMs: number): number {
    if (activeMs <= 0 || maxActiveMs <= 0) return 0
    const ratio = activeMs / maxActiveMs
    if (ratio >= 0.75) return 4
    if (ratio >= 0.5) return 3
    if (ratio >= 0.25) return 2
    return 1
}

interface MonthlyCalendarProps {
    monthKey: string
    rangeLabel: string
    days: MonthlyCalendarDay[]
}

export function MonthlyCalendar({ monthKey, rangeLabel, days }: MonthlyCalendarProps) {
    const maxDailyMs = Math.max(...days.map((day) => day.activeMs), 0)
    const leadingBlankDays = days[0]?.weekday ?? 0

    return (
        <section className={styles.reportSection} data-testid="monthly-calendar">
            <div className={styles.sectionTitle}>
                <h3>{monthKey} 阅读日历</h3>
                <span>{rangeLabel}</span>
            </div>
            <div className={styles.calendarGrid}>
                {WEEKDAY_LABELS.map((weekday) => (
                    <div key={weekday} className={styles.calendarWeekday}>{weekday}</div>
                ))}
                {Array.from({ length: leadingBlankDays }, (_, index) => (
                    <div key={`blank-${index}`} className={styles.calendarSpacer} />
                ))}
                {days.map((day) => {
                    const level = day.isFuture ? 0 : getHeatLevel(day.activeMs, maxDailyMs)
                    const title = `${day.dateKey}：${day.isFuture ? '尚未到达' : formatDurationLabel(day.activeMs)}`
                    return (
                        <div
                            key={day.dateKey}
                            className={`${styles.calendarDay} ${day.isToday ? styles.calendarToday : ''} ${day.isFuture ? styles.calendarFuture : ''}`}
                            data-level={level}
                            title={title}
                        >
                            {day.dayOfMonth}
                        </div>
                    )
                })}
            </div>
        </section>
    )
}
