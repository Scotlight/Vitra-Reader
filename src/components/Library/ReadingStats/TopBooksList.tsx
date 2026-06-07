import { formatDurationLabel } from '@/services/readingStatsService'
import styles from './TopBooksList.module.css'

const MAX_MONTHLY_TOP_BOOKS = 6

interface TopBookRow {
    bookId: string
    title: string
    author: string
    activeMs: number
    progress: number
}

interface TopBooksListProps {
    rows: TopBookRow[]
}

function formatProgressLabel(progress: number): string {
    return `${Math.round(Math.max(0, Math.min(1, progress)) * 100)}%`
}

export function TopBooksList({ rows }: TopBooksListProps) {
    const topRows = rows.slice(0, MAX_MONTHLY_TOP_BOOKS)
    const maxTopBookMs = Math.max(...topRows.map((row) => row.activeMs), 0)

    return (
        <section className={styles.reportSection} data-testid="monthly-top-books">
            <div className={styles.sectionTitle}>
                <h3>本月 Top 图书</h3>
                <span>{topRows.length > 0 ? `按阅读时长展示前 ${topRows.length} 本` : '暂无可展示图书'}</span>
            </div>
            {topRows.length === 0 ? (
                <div className={styles.empty}>本月还没有可统计的图书阅读时长。</div>
            ) : (
                <div className={styles.topBooksList}>
                    {topRows.map((row, index) => {
                        const widthPercent = maxTopBookMs > 0 ? Math.max(8, (row.activeMs / maxTopBookMs) * 100) : 0
                        return (
                            <div key={row.bookId} className={styles.topBookRow}>
                                <div className={styles.topBookMain}>
                                    <strong>{index + 1}. {row.title}</strong>
                                    <span>{row.author} · 进度 {formatProgressLabel(row.progress)}</span>
                                </div>
                                <div className={styles.topBookBar}>
                                    <div className={styles.topBookFill} style={{ width: `${widthPercent}%` }} />
                                </div>
                                <span className={styles.topBookMeta}>{formatDurationLabel(row.activeMs)}</span>
                            </div>
                        )
                    })}
                </div>
            )}
        </section>
    )
}
