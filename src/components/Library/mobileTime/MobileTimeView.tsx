import { useEffect, useMemo, useState } from 'react'
import { db, type BookMeta } from '@/services/storageService'
import {
    estimateRemainingMsFromProgress,
    formatDurationLabel,
    loadBookTotalActiveMs,
    loadCurrentReadingStreak,
    loadDailyActiveTrend,
    loadReadingStatsSummary,
    type BookReadingStatsItem,
    type DailyReadingStatsItem,
} from '@/services/readingStatsService'
import { LazyCoverImage } from '../bookGrid/LazyCoverImage'
import { pickContinueReading, type LibraryProgressMap } from '../mobileHome/mobileHomeData'
import {
    formatCompactDuration,
    normalizeTrendBars,
    resolveTodayBarIndex,
    toTopBookRatios,
} from './mobileTimeData'
import styles from './MobileTimeView.module.css'

/**
 * 移动端阅读时间页（设计原型 1a Phase 3）
 *
 * 四模块：stat 卡（连击/本月时长）、近 7 天柱图、进度环、读得最多排行。
 * 统计一律走 db.readingStatsDaily 链路；进度环的量纲必须用 db.progress 的
 * 0~1 原始 percentage —— progressMap 是 0~100，喂给 estimateRemainingMsFromProgress
 * 会被钳成 1 静默显示"剩余 0 分钟"（phase3 文档 §4.1 的头号地雷）。
 */

interface MobileTimeViewProps {
    readonly books: readonly BookMeta[]
    readonly progressMap: LibraryProgressMap
    readonly trashBookIdSet: ReadonlySet<string>
}

interface TimeStats {
    readonly streakDays: number
    readonly monthTotalMs: number
    readonly trend: readonly DailyReadingStatsItem[]
    readonly topBooks: readonly BookReadingStatsItem[]
    /** 0~1 浮点；null = 没有可估算的在读进度 */
    readonly ringRatio: number | null
    readonly remainingMs: number | null
}

const TREND_DAYS = 7
const TOP_BOOKS_LIMIT = 5

export function MobileTimeView({ books, progressMap, trashBookIdSet }: MobileTimeViewProps) {
    const [stats, setStats] = useState<TimeStats | null>(null)

    const bookById = useMemo(() => new Map(books.map((book) => [book.id, book])), [books])

    // 环的归属复用首页"继续阅读"的选书语义（同一本书，用户认知一致）。
    // 但 fallback 分支可能给出 progress 为 0/100 的书——那不是"在读"，环不该亮
    const continueReading = useMemo(
        () => pickContinueReading(books, progressMap, trashBookIdSet),
        [books, progressMap, trashBookIdSet],
    )
    const ringBook =
        continueReading && continueReading.progress > 0 && continueReading.progress < 100
            ? continueReading.book
            : null

    useEffect(() => {
        let cancelled = false

        const load = async () => {
            const [streakDays, trend, summary] = await Promise.all([
                loadCurrentReadingStreak(),
                loadDailyActiveTrend(TREND_DAYS),
                loadReadingStatsSummary('month'),
            ])

            let ringRatio: number | null = null
            let remainingMs: number | null = null
            if (ringBook) {
                const [progressRow, bookActiveMs] = await Promise.all([
                    db.progress.get(ringBook.id),
                    loadBookTotalActiveMs(ringBook.id),
                ])
                const ratio = Number(progressRow?.percentage) || 0
                if (ratio > 0 && ratio < 1) {
                    ringRatio = ratio
                    remainingMs = estimateRemainingMsFromProgress(bookActiveMs, ratio)
                }
            }

            if (cancelled) return
            setStats({
                streakDays,
                monthTotalMs: summary.totalActiveMs,
                trend,
                topBooks: summary.byBook.slice(0, TOP_BOOKS_LIMIT),
                ringRatio,
                remainingMs,
            })
        }

        void load()
        return () => {
            cancelled = true
        }
    }, [ringBook])

    if (!stats) return null

    const trendBars = normalizeTrendBars(stats.trend)
    const todayIndex = resolveTodayBarIndex(stats.trend)
    const hasTrendData = stats.trend.some((item) => item.activeMs > 0)
    const topRatios = toTopBookRatios(stats.topBooks)
    // streak 可能来自上月末（今天没读、连击未清零），单看月累计判空会误杀
    const hasAnyStats = stats.monthTotalMs > 0 || stats.streakDays > 0 || hasTrendData

    if (!hasAnyStats) {
        return (
            <div className={styles.time} data-mobile-time="true">
                <p className={styles.empty}>开始阅读以查看统计</p>
            </div>
        )
    }

    return (
        <div className={styles.time} data-mobile-time="true">
            <div className={styles.statCards}>
                <div className={styles.statCard}>
                    <span className={styles.statLabel}>连续阅读</span>
                    <span className={styles.statValue}>
                        {stats.streakDays}
                        <span className={styles.statUnit}>天</span>
                    </span>
                </div>
                <div className={styles.statCard}>
                    <span className={styles.statLabel}>本月阅读</span>
                    <span className={styles.statValue}>{formatCompactDuration(stats.monthTotalMs)}</span>
                </div>
            </div>

            <section aria-label="近 7 天阅读趋势">
                <h2 className={styles.sectionLabel}>近 7 天</h2>
                {hasTrendData ? (
                    <div className={styles.trendChart}>
                        {stats.trend.map((item, index) => (
                            <span
                                key={item.dateKey}
                                className={`${styles.trendBar} ${index === todayIndex ? styles.trendBarToday : ''}`}
                                style={
                                    {
                                        '--bar-ratio': trendBars[index] ?? 0,
                                        '--bar-index': index,
                                    } as React.CSSProperties
                                }
                                aria-label={`${item.dateKey} 阅读 ${formatDurationLabel(item.activeMs)}`}
                            />
                        ))}
                    </div>
                ) : (
                    <p className={styles.sectionEmpty}>近 7 天没有阅读记录</p>
                )}
            </section>

            <section className={styles.ringSection} aria-label="当前阅读进度">
                <span
                    className={styles.ring}
                    style={{ '--ring-ratio': stats.ringRatio ?? 0 } as React.CSSProperties}
                >
                    <span className={styles.ringValue}>
                        {stats.ringRatio !== null ? `${Math.round(stats.ringRatio * 100)}%` : '--%'}
                    </span>
                </span>
                <span className={styles.ringMeta}>
                    {ringBook && stats.ringRatio !== null ? (
                        <>
                            <span className={styles.ringTitle}>{ringBook.title}</span>
                            {stats.remainingMs !== null && (
                                <span className={styles.ringHint}>
                                    剩余约 {formatDurationLabel(stats.remainingMs)}
                                </span>
                            )}
                        </>
                    ) : (
                        <span className={styles.ringHint}>还没有正在读的书</span>
                    )}
                </span>
            </section>

            {stats.topBooks.length > 0 && (
                <section aria-label="读得最多">
                    <h2 className={styles.sectionLabel}>读得最多</h2>
                    <div className={styles.topList}>
                        {stats.topBooks.map((item, index) => {
                            const book = bookById.get(item.bookId)
                            return (
                                <div key={item.bookId} className={styles.topRow}>
                                    <span
                                        className={`${styles.topRank} ${index === 0 ? styles.topRankFirst : ''}`}
                                    >
                                        {index + 1}
                                    </span>
                                    <span className={styles.topCover}>
                                        {book && (
                                            <LazyCoverImage
                                                bookId={book.id}
                                                format={book.format}
                                                alt=""
                                                compact
                                            />
                                        )}
                                    </span>
                                    <span className={styles.topMeta}>
                                        <span className={styles.topTitle}>{book?.title ?? '未知书籍'}</span>
                                        <span className={styles.topTrack}>
                                            <span
                                                className={styles.topFill}
                                                style={{ width: `${(topRatios[index] ?? 0) * 100}%` }}
                                            />
                                        </span>
                                    </span>
                                    <span className={styles.topDuration}>{formatDurationLabel(item.activeMs)}</span>
                                </div>
                            )
                        })}
                    </div>
                </section>
            )}
        </div>
    )
}
