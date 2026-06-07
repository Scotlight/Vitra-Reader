import { useEffect, useState } from 'react'
import { db } from '@/services/storageService'
import {
    estimateRemainingMsFromProgress,
    formatDurationLabel,
    loadMonthlyReadingReport,
    loadReadingStatsSummary,
    type MonthlyReadingReport,
    type ReadingStatsPeriod,
} from '@/services/readingStatsService'
import { MonthlyCalendar } from './ReadingStats/MonthlyCalendar'
import {
    PeriodStatsView,
    type ChartType,
    type PeriodStatsRow,
} from './ReadingStats/PeriodStatsView'
import { TopBooksList } from './ReadingStats/TopBooksList'
import { TrendChart } from './ReadingStats/TrendChart'
import styles from './ReadingStatsPanel.module.css'

const PERIOD_LABELS: Record<ReadingStatsPeriod, string> = {
    day: '本日',
    week: '本周',
    month: '本月',
}

function buildRangeLabel(startDateKey: string, endDateKey: string): string {
    return startDateKey !== endDateKey ? `${startDateKey} ~ ${endDateKey}` : startDateKey
}

function MonthlyStatsReport({
    report,
    rows,
}: {
    report: MonthlyReadingReport
    rows: PeriodStatsRow[]
}) {
    const rangeLabel = buildRangeLabel(report.startDateKey, report.endDateKey)

    return (
        <div className={styles.statsMonthlyReport}>
            <div className={styles.statsSummaryCards}>
                <div className={styles.statsCard}>
                    <span>本月阅读总时长</span>
                    <strong>{formatDurationLabel(report.totalActiveMs)}</strong>
                </div>
                <div className={styles.statsCard}>
                    <span>今日阅读</span>
                    <strong>{formatDurationLabel(report.todayActiveMs)}</strong>
                </div>
                <div className={styles.statsCard}>
                    <span>阅读天数</span>
                    <strong>{report.activeDayCount} 天</strong>
                </div>
                <div className={styles.statsCard}>
                    <span>最长连续阅读</span>
                    <strong>{report.longestStreakDays} 天</strong>
                </div>
            </div>

            <MonthlyCalendar monthKey={report.monthKey} rangeLabel={rangeLabel} days={report.calendarDays} />
            <TrendChart activeDayCount={report.activeDayCount} dailyTrend={report.dailyTrend} />
            <TopBooksList rows={rows} />
        </div>
    )
}

export const ReadingStatsPanel = () => {
    const [period, setPeriod] = useState<ReadingStatsPeriod>('day')
    const [chartType, setChartType] = useState<ChartType>('bar')
    const [loading, setLoading] = useState(true)
    const [rows, setRows] = useState<PeriodStatsRow[]>([])
    const [rangeLabel, setRangeLabel] = useState('')
    const [monthlyReport, setMonthlyReport] = useState<MonthlyReadingReport | null>(null)

    useEffect(() => {
        let cancelled = false

        const load = async () => {
            setLoading(true)
            try {
                const report = period === 'month' ? await loadMonthlyReadingReport() : null
                const summary = report ?? await loadReadingStatsSummary(period)
                if (cancelled) return

                setMonthlyReport(report)
                const bookIds = summary.byBook.map((item) => item.bookId)
                setRangeLabel(buildRangeLabel(summary.startDateKey, summary.endDateKey))
                if (bookIds.length === 0) {
                    setRows([])
                    return
                }

                const [books, progressItems] = await Promise.all([
                    db.books.bulkGet(bookIds),
                    db.progress.bulkGet(bookIds),
                ])
                if (cancelled) return

                const booksById = new Map<string, (typeof books)[number]>(
                    bookIds.map((bookId, index) => [bookId, books[index]]),
                )
                const progressByBookId = new Map<string, number>(
                    bookIds.map((bookId, index) => {
                        const item = progressItems[index]
                        return [bookId, Number(item?.percentage) || 0]
                    }),
                )

                const nextRows = summary.byBook.map((item) => {
                    const book = booksById.get(item.bookId)
                    const progress = progressByBookId.get(item.bookId) ?? 0
                    return {
                        bookId: item.bookId,
                        title: book?.title || '未知书籍',
                        author: book?.author || '未知作者',
                        activeMs: item.activeMs,
                        progress,
                        remainingMs: estimateRemainingMsFromProgress(item.activeMs, progress),
                    }
                })

                setRows(nextRows)
            } finally {
                if (!cancelled) setLoading(false)
            }
        }

        void load()
        return () => {
            cancelled = true
        }
    }, [period])

    return (
        <div className={styles.statsPanel}>
            <div className={styles.statsHeader}>
                <div className={styles.statsPeriodTabs}>
                    {(['day', 'week', 'month'] as const).map((item) => (
                        <button
                            key={item}
                            className={`${styles.statsTabBtn} ${period === item ? styles.statsTabBtnActive : ''}`}
                            onClick={() => setPeriod(item)}
                        >
                            {PERIOD_LABELS[item]}
                        </button>
                    ))}
                </div>
                {period !== 'month' && (
                    <div className={styles.statsChartTabs}>
                        <button
                            className={`${styles.statsTabBtn} ${chartType === 'bar' ? styles.statsTabBtnActive : ''}`}
                            onClick={() => setChartType('bar')}
                        >
                            条形图
                        </button>
                        <button
                            className={`${styles.statsTabBtn} ${chartType === 'pie' ? styles.statsTabBtnActive : ''}`}
                            onClick={() => setChartType('pie')}
                        >
                            扇形图
                        </button>
                    </div>
                )}
            </div>

            {period === 'month' ? (
                loading ? (
                    <div className={styles.statsEmpty}>正在计算月度阅读统计...</div>
                ) : monthlyReport ? (
                    <MonthlyStatsReport report={monthlyReport} rows={rows} />
                ) : (
                    <div className={styles.statsEmpty}>月度统计加载失败。</div>
                )
            ) : (
                <PeriodStatsView
                    chartType={chartType}
                    loading={loading}
                    rangeLabel={rangeLabel}
                    rows={rows}
                />
            )}
        </div>
    )
}

