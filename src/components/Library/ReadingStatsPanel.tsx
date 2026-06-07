import { useEffect, useMemo, useState } from 'react'
import { db } from '@/services/storageService'
import {
    estimateRemainingMsFromProgress,
    formatDurationLabel,
    loadMonthlyReadingReport,
    loadReadingStatsSummary,
    type MonthlyReadingReport,
    type ReadingStatsPeriod,
} from '@/services/readingStatsService'
import styles from './LibraryView.module.css'

type ChartType = 'bar' | 'pie'

interface ReadingStatsPanelRow {
    bookId: string
    title: string
    author: string
    activeMs: number
    progress: number
    remainingMs: number | null
}

interface PieSegment {
    label: string
    value: number
    color: string
}

const PERIOD_LABELS: Record<ReadingStatsPeriod, string> = {
    day: '本日',
    week: '本周',
    month: '本月',
}

const PIE_COLORS = ['#0b9ba1', '#f59e0b', '#ef4444', '#8b5cf6', '#10b981', '#3b82f6']
const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六']
const MAX_TABLE_ROW_COUNT = 500
const MAX_MONTHLY_TOP_BOOKS = 6

function formatProgressLabel(progress: number): string {
    return `${Math.round(Math.max(0, Math.min(1, progress)) * 100)}%`
}

function getHeatLevel(activeMs: number, maxActiveMs: number): number {
    if (activeMs <= 0 || maxActiveMs <= 0) return 0
    const ratio = activeMs / maxActiveMs
    if (ratio >= 0.75) return 4
    if (ratio >= 0.5) return 3
    if (ratio >= 0.25) return 2
    return 1
}

function toPieSegments(rows: ReadingStatsPanelRow[]): PieSegment[] {
    const topRows = rows.slice(0, 5)
    const otherValue = rows.slice(5).reduce((sum, row) => sum + row.activeMs, 0)
    const segments: PieSegment[] = topRows.map((row, index) => ({
        label: row.title,
        value: row.activeMs,
        color: PIE_COLORS[index % PIE_COLORS.length],
    }))
    if (otherValue > 0) {
        segments.push({
            label: '其他图书',
            value: otherValue,
            color: '#94a3b8',
        })
    }
    return segments
}

function buildPieGradient(segments: PieSegment[]): string {
    const total = segments.reduce((sum, segment) => sum + segment.value, 0)
    if (total <= 0) return 'conic-gradient(#d1d5db 0% 100%)'

    let progress = 0
    const stops = segments.map((segment) => {
        const from = progress * 100
        const ratio = segment.value / total
        progress += ratio
        const to = progress * 100
        return `${segment.color} ${from.toFixed(2)}% ${to.toFixed(2)}%`
    })
    return `conic-gradient(${stops.join(', ')})`
}

function buildRangeLabel(startDateKey: string, endDateKey: string): string {
    return startDateKey !== endDateKey ? `${startDateKey} ~ ${endDateKey}` : startDateKey
}

function MonthlyStatsReport({
    report,
    rows,
}: {
    report: MonthlyReadingReport
    rows: ReadingStatsPanelRow[]
}) {
    const maxDailyMs = Math.max(...report.dailyTrend.map((day) => day.activeMs), 0)
    const maxTopBookMs = Math.max(...rows.map((row) => row.activeMs), 0)
    const leadingBlankDays = report.calendarDays[0]?.weekday ?? 0
    const topRows = rows.slice(0, MAX_MONTHLY_TOP_BOOKS)

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

            <section className={styles.statsReportSection}>
                <div className={styles.statsSectionTitle}>
                    <h3>{report.monthKey} 阅读日历</h3>
                    <span>{buildRangeLabel(report.startDateKey, report.endDateKey)}</span>
                </div>
                <div className={styles.statsCalendarGrid}>
                    {WEEKDAY_LABELS.map((weekday) => (
                        <div key={weekday} className={styles.statsCalendarWeekday}>{weekday}</div>
                    ))}
                    {Array.from({ length: leadingBlankDays }, (_, index) => (
                        <div key={`blank-${index}`} className={styles.statsCalendarSpacer} />
                    ))}
                    {report.calendarDays.map((day) => {
                        const level = day.isFuture ? 0 : getHeatLevel(day.activeMs, maxDailyMs)
                        const title = `${day.dateKey}：${day.isFuture ? '尚未到达' : formatDurationLabel(day.activeMs)}`
                        return (
                            <div
                                key={day.dateKey}
                                className={`${styles.statsCalendarDay} ${day.isToday ? styles.statsCalendarToday : ''} ${day.isFuture ? styles.statsCalendarFuture : ''}`}
                                data-level={level}
                                title={title}
                            >
                                {day.dayOfMonth}
                            </div>
                        )
                    })}
                </div>
            </section>

            <section className={styles.statsReportSection}>
                <div className={styles.statsSectionTitle}>
                    <h3>每日趋势</h3>
                    <span>{report.activeDayCount > 0 ? `本月已有 ${report.activeDayCount} 天阅读记录` : '本月暂无阅读记录'}</span>
                </div>
                <div className={styles.statsDailyTrend}>
                    {report.dailyTrend.map((day) => {
                        const heightPercent = maxDailyMs > 0 ? Math.max(8, (day.activeMs / maxDailyMs) * 100) : 0
                        return (
                            <div key={day.dateKey} className={styles.statsDailyBarItem} title={`${day.dateKey}：${formatDurationLabel(day.activeMs)}`}>
                                <div className={styles.statsDailyBarTrack}>
                                    <div className={styles.statsDailyBarFill} style={{ height: `${heightPercent}%` }} />
                                </div>
                                <span className={styles.statsDailyBarLabel}>{Number(day.dateKey.slice(-2))}</span>
                            </div>
                        )
                    })}
                </div>
            </section>

            <section className={styles.statsReportSection}>
                <div className={styles.statsSectionTitle}>
                    <h3>本月 Top 图书</h3>
                    <span>{topRows.length > 0 ? `按阅读时长展示前 ${topRows.length} 本` : '暂无可展示图书'}</span>
                </div>
                {topRows.length === 0 ? (
                    <div className={styles.statsEmpty}>本月还没有可统计的图书阅读时长。</div>
                ) : (
                    <div className={styles.statsTopBooksList}>
                        {topRows.map((row, index) => {
                            const widthPercent = maxTopBookMs > 0 ? Math.max(8, (row.activeMs / maxTopBookMs) * 100) : 0
                            return (
                                <div key={row.bookId} className={styles.statsTopBookRow}>
                                    <div className={styles.statsTopBookMain}>
                                        <strong>{index + 1}. {row.title}</strong>
                                        <span>{row.author} · 进度 {formatProgressLabel(row.progress)}</span>
                                    </div>
                                    <div className={styles.statsTopBookBar}>
                                        <div className={styles.statsTopBookFill} style={{ width: `${widthPercent}%` }} />
                                    </div>
                                    <span className={styles.statsTopBookMeta}>{formatDurationLabel(row.activeMs)}</span>
                                </div>
                            )
                        })}
                    </div>
                )}
            </section>
        </div>
    )
}

export const ReadingStatsPanel = () => {
    const [period, setPeriod] = useState<ReadingStatsPeriod>('day')
    const [chartType, setChartType] = useState<ChartType>('bar')
    const [loading, setLoading] = useState(true)
    const [rows, setRows] = useState<ReadingStatsPanelRow[]>([])
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

    const totalActiveMs = useMemo(
        () => rows.reduce((sum, row) => sum + row.activeMs, 0),
        [rows],
    )
    const totalRemainingMs = useMemo(
        () => rows.reduce((sum, row) => sum + (row.remainingMs ?? 0), 0),
        [rows],
    )
    const tableRows = useMemo(
        () => rows.slice(0, MAX_TABLE_ROW_COUNT),
        [rows],
    )
    const hiddenRowCount = rows.length - tableRows.length

    const maxActiveMs = Math.max(...rows.map((row) => row.activeMs), 0)
    const pieSegments = useMemo(() => toPieSegments(rows), [rows])
    const pieGradient = useMemo(() => buildPieGradient(pieSegments), [pieSegments])

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
                <>
                    <div className={styles.statsSummaryCards}>
                        <div className={styles.statsCard}>
                            <span>统计范围</span>
                            <strong>{loading ? '加载中...' : rangeLabel || '-'}</strong>
                        </div>
                        <div className={styles.statsCard}>
                            <span>阅读总时长</span>
                            <strong>{formatDurationLabel(totalActiveMs)}</strong>
                        </div>
                        <div className={styles.statsCard}>
                            <span>剩余阅读时间</span>
                            <strong>{totalRemainingMs > 0 ? formatDurationLabel(totalRemainingMs) : '数据不足'}</strong>
                        </div>
                    </div>

                    {loading ? (
                        <div className={styles.statsEmpty}>正在计算阅读统计...</div>
                    ) : rows.length === 0 ? (
                        <div className={styles.statsEmpty}>当前周期暂无活跃阅读时长。</div>
                    ) : (
                        <>
                            {chartType === 'bar' ? (
                                <div className={styles.statsBarList}>
                                    {rows.slice(0, 8).map((row) => {
                                        const widthPercent = maxActiveMs > 0 ? Math.max(6, (row.activeMs / maxActiveMs) * 100) : 0
                                        return (
                                            <div key={row.bookId} className={styles.statsBarRow}>
                                                <div className={styles.statsBarLabel} title={row.title}>{row.title}</div>
                                                <div className={styles.statsBarTrack}>
                                                    <div className={styles.statsBarFill} style={{ width: `${widthPercent}%` }} />
                                                </div>
                                                <div className={styles.statsBarValue}>{formatDurationLabel(row.activeMs)}</div>
                                            </div>
                                        )
                                    })}
                                </div>
                            ) : (
                                <div className={styles.statsPieWrap}>
                                    <div className={styles.statsPieChart} style={{ backgroundImage: pieGradient }}>
                                        <div className={styles.statsPieInner} />
                                    </div>
                                    <div className={styles.statsPieLegend}>
                                        {pieSegments.map((segment) => (
                                            <div key={segment.label} className={styles.statsLegendItem}>
                                                <span className={styles.statsLegendDot} style={{ backgroundColor: segment.color }} />
                                                <span className={styles.statsLegendText}>{segment.label}</span>
                                                <span className={styles.statsLegendValue}>{formatDurationLabel(segment.value)}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className={styles.statsTable}>
                                <div className={styles.statsTableHead}>
                                    <span>图书</span>
                                    <span>阅读时长</span>
                                    <span>进度</span>
                                    <span>剩余时间</span>
                                </div>
                                {tableRows.map((row) => (
                                    <div key={row.bookId} className={styles.statsTableRow}>
                                        <span title={`${row.title} - ${row.author}`}>{row.title}</span>
                                        <span>{formatDurationLabel(row.activeMs)}</span>
                                        <span>{formatProgressLabel(row.progress)}</span>
                                        <span>{row.remainingMs === null ? '数据不足' : formatDurationLabel(row.remainingMs)}</span>
                                    </div>
                                ))}
                            </div>
                            {hiddenRowCount > 0 && (
                                <div className={styles.statsHint}>
                                    当前仅渲染前 {MAX_TABLE_ROW_COUNT} 本图书，剩余 {hiddenRowCount} 本用于减轻大数据量页面负载。
                                </div>
                            )}
                        </>
                    )}
                </>
            )}
        </div>
    )
}

