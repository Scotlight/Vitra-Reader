import { useEffect, useMemo, useState } from 'react'
import { db } from '@/services/storageService'
import {
    estimateRemainingMsFromProgress,
    formatDurationLabel,
    loadReadingStatsSummary,
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
const MAX_TABLE_ROW_COUNT = 500

function formatProgressLabel(progress: number): string {
    return `${Math.round(Math.max(0, Math.min(1, progress)) * 100)}%`
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

export const ReadingStatsPanel = () => {
    const [period, setPeriod] = useState<ReadingStatsPeriod>('day')
    const [chartType, setChartType] = useState<ChartType>('bar')
    const [loading, setLoading] = useState(true)
    const [rows, setRows] = useState<ReadingStatsPanelRow[]>([])
    const [rangeLabel, setRangeLabel] = useState('')

    useEffect(() => {
        let cancelled = false

        const load = async () => {
            setLoading(true)
            try {
                const summary = await loadReadingStatsSummary(period)
                if (cancelled) return

                const bookIds = summary.byBook.map((item) => item.bookId)
                if (bookIds.length === 0) {
                    setRows([])
                    const hasRange = summary.startDateKey !== summary.endDateKey
                    setRangeLabel(hasRange ? `${summary.startDateKey} ~ ${summary.endDateKey}` : summary.startDateKey)
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
                const hasRange = summary.startDateKey !== summary.endDateKey
                setRangeLabel(hasRange ? `${summary.startDateKey} ~ ${summary.endDateKey}` : summary.startDateKey)
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
            </div>

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
        </div>
    )
}
