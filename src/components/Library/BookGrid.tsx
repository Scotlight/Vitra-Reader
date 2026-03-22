import { type MouseEvent as ReactMouseEvent, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import type { BookMeta } from '../../services/storageService'
import { getBookCover } from '../../services/storageService'
import type { ShelfGroup } from '../../hooks/useShelfManager'
import { BookFormatPlaceholder } from './BookFormatPlaceholder'
import { buildVirtualGridMetrics, chunkItemsIntoRows, resolveVisibleVirtualRows } from './libraryVirtualGrid'
import styles from './LibraryView.module.css'

const PROBE_CARD_LIMIT = 24
const ROW_OVERSCAN_COUNT = 2
const ROW_GROUP_EPSILON_PX = 2

interface VirtualGridLayoutSnapshot {
    columnCount: number
    rowGap: number
    columnGap: number
    topPadding: number
    gridTopOffset: number
    initialEstimatedRowHeight: number
}

function readPixelValue(value: string): number {
    const parsed = Number.parseFloat(value)
    return Number.isFinite(parsed) ? parsed : 0
}

function collectVirtualGridProbeLayout(
    probeGrid: HTMLDivElement,
    scrollContainer: HTMLDivElement,
): (VirtualGridLayoutSnapshot & { initialRowHeights: Map<number, number> }) | null {
    const cards = Array.from(probeGrid.querySelectorAll<HTMLDivElement>('[data-virtual-card="true"]'))
    if (cards.length === 0) return null

    const computedStyle = window.getComputedStyle(probeGrid)
    const rowGap = readPixelValue(computedStyle.rowGap)
    const columnGap = readPixelValue(computedStyle.columnGap)
    const topPadding = readPixelValue(computedStyle.paddingTop)
    const rows: Array<{ top: number; count: number; height: number }> = []

    cards.forEach((card) => {
        const cardTop = card.offsetTop
        const cardHeight = Math.ceil(card.getBoundingClientRect().height || card.offsetHeight)
        const existingRow = rows.find((row) => Math.abs(row.top - cardTop) <= ROW_GROUP_EPSILON_PX)
        if (existingRow) {
            existingRow.count += 1
            existingRow.height = Math.max(existingRow.height, cardHeight)
            return
        }
        rows.push({ top: cardTop, count: 1, height: cardHeight })
    })

    rows.sort((left, right) => left.top - right.top)
    const columnCount = Math.max(1, rows[0]?.count ?? 1)
    const initialRowHeights = new Map<number, number>()
    rows.forEach((row, rowIndex) => {
        initialRowHeights.set(rowIndex, row.height)
    })

    const estimatedRowHeight = rows.reduce((sum, row) => sum + row.height, 0) / rows.length
    const scrollRect = scrollContainer.getBoundingClientRect()
    const gridRect = probeGrid.getBoundingClientRect()

    return {
        columnCount,
        rowGap,
        columnGap,
        topPadding,
        gridTopOffset: gridRect.top - scrollRect.top + scrollContainer.scrollTop,
        initialEstimatedRowHeight: Number.isFinite(estimatedRowHeight) && estimatedRowHeight > 0 ? estimatedRowHeight : 1,
        initialRowHeights,
    }
}

/** 封面懒加载：仅在需要时才读取 IndexedDB，避免全量加载 Base64 */
function LazyCoverImage({ bookId, format, alt, compact }: { bookId: string; format?: string; alt: string; compact?: boolean }) {
    const [cover, setCover] = useState<string | null>(null)
    const [loaded, setLoaded] = useState(false)

    useEffect(() => {
        let cancelled = false
        getBookCover(bookId).then((url) => {
            if (!cancelled) setCover(url ?? null)
        })
        return () => { cancelled = true }
    }, [bookId])

    if (!cover) return <BookFormatPlaceholder format={format} compact={compact} />
    return (
        <img
            src={cover}
            alt={alt}
            loading="lazy"
            decoding="async"
            className={compact ? undefined : styles.coverImage}
            style={{ opacity: loaded ? 1 : 0, transition: 'opacity 0.15s', width: '100%', height: '100%', objectFit: 'cover' }}
            onLoad={() => setLoaded(true)}
        />
    )
}

interface BookCardProps {
    book: BookMeta
    progress: number
    onOpenBook: (id: string) => void
    onContextMenu: (event: ReactMouseEvent<HTMLElement>, bookId: string) => void
}

function BookCard({ book, progress, onOpenBook, onContextMenu }: BookCardProps) {
    return (
        <motion.div
            data-virtual-card="true"
            className={styles.card}
            initial={false}
            whileHover={{ y: -5, boxShadow: '0 8px 30px rgba(0,0,0,0.12)' }}
            onClick={() => onOpenBook(book.id)}
            onContextMenu={(event) => onContextMenu(event, book.id)}
        >
            <div className={styles.coverWrapper}>
                <LazyCoverImage bookId={book.id} format={book.format} alt={book.title} />
                <div className={styles.cardOverlay} />
            </div>
            <div className={styles.meta}>
                <h3 className={styles.title} title={book.title}>{book.title}</h3>
                <p className={styles.author}>{book.author || 'Unknown'}</p>
                <div className={styles.progressRow}>
                    <span>{progress}%</span>
                </div>
                <div className={styles.progressTrack}>
                    <div className={styles.progressFill} style={{ width: `${progress}%` }} />
                </div>
            </div>
        </motion.div>
    )
}

interface VirtualBookGridProps {
    visibleBooks: BookMeta[]
    progressMap: Record<string, number>
    onOpenBook: (id: string) => void
    onContextMenu: (event: ReactMouseEvent<HTMLElement>, bookId: string) => void
    scrollContainer: HTMLDivElement | null
}

function VirtualBookGrid({
    visibleBooks,
    progressMap,
    onOpenBook,
    onContextMenu,
    scrollContainer,
}: VirtualBookGridProps) {
    const probeGridRef = useRef<HTMLDivElement | null>(null)
    const rowElementMapRef = useRef(new Map<number, HTMLDivElement>())
    const [layout, setLayout] = useState<VirtualGridLayoutSnapshot | null>(null)
    const [measuredRowHeights, setMeasuredRowHeights] = useState<Map<number, number>>(new Map())
    const [viewport, setViewport] = useState({ scrollTop: 0, height: 0 })
    const [layoutResetToken, forceLayoutReset] = useReducer((value: number) => value + 1, 0)

    useEffect(() => {
        rowElementMapRef.current.clear()
        setMeasuredRowHeights(new Map())
        setLayout(null)
    }, [visibleBooks])

    useEffect(() => {
        if (!scrollContainer) return

        let frameId: number | null = null
        let lastWidth = scrollContainer.clientWidth
        const updateViewport = () => {
            setViewport({
                scrollTop: scrollContainer.scrollTop,
                height: scrollContainer.clientHeight,
            })
        }
        const scheduleViewportUpdate = () => {
            if (frameId !== null) return
            frameId = window.requestAnimationFrame(() => {
                frameId = null
                updateViewport()
            })
        }

        updateViewport()
        scrollContainer.addEventListener('scroll', scheduleViewportUpdate, { passive: true })

        const resizeObserver = typeof ResizeObserver !== 'undefined'
            ? new ResizeObserver(() => {
                scheduleViewportUpdate()
                const nextWidth = scrollContainer.clientWidth
                if (Math.abs(nextWidth - lastWidth) > 1) {
                    lastWidth = nextWidth
                    rowElementMapRef.current.clear()
                    setMeasuredRowHeights(new Map())
                    setLayout(null)
                    forceLayoutReset()
                }
            })
            : null

        resizeObserver?.observe(scrollContainer)

        return () => {
            scrollContainer.removeEventListener('scroll', scheduleViewportUpdate)
            resizeObserver?.disconnect()
            if (frameId !== null) {
                window.cancelAnimationFrame(frameId)
            }
        }
    }, [scrollContainer])

    useLayoutEffect(() => {
        if (layout || !scrollContainer || !probeGridRef.current) return

        const frameId = window.requestAnimationFrame(() => {
            const nextLayout = collectVirtualGridProbeLayout(probeGridRef.current!, scrollContainer)
            if (!nextLayout) return
            setMeasuredRowHeights(new Map(nextLayout.initialRowHeights))
            setLayout({
                columnCount: nextLayout.columnCount,
                rowGap: nextLayout.rowGap,
                columnGap: nextLayout.columnGap,
                topPadding: nextLayout.topPadding,
                gridTopOffset: nextLayout.gridTopOffset,
                initialEstimatedRowHeight: nextLayout.initialEstimatedRowHeight,
            })
        })

        return () => {
            window.cancelAnimationFrame(frameId)
        }
    }, [layout, scrollContainer, layoutResetToken])

    const effectiveEstimatedRowHeight = useMemo(() => {
        if (!layout) return 1
        if (measuredRowHeights.size === 0) return layout.initialEstimatedRowHeight
        let total = 0
        measuredRowHeights.forEach((value) => {
            total += value
        })
        return total / measuredRowHeights.size
    }, [layout, measuredRowHeights])

    const rows = useMemo(
        () => chunkItemsIntoRows(visibleBooks, layout?.columnCount ?? 1),
        [visibleBooks, layout?.columnCount],
    )

    const metrics = useMemo(() => {
        if (!layout) return null
        return buildVirtualGridMetrics(rows.length, layout.rowGap, effectiveEstimatedRowHeight, measuredRowHeights)
    }, [layout, rows.length, effectiveEstimatedRowHeight, measuredRowHeights])

    const visibleRange = useMemo(() => {
        if (!layout || !metrics) return { startRow: 0, endRow: -1 }
        const effectiveScrollTop = Math.max(0, viewport.scrollTop - layout.gridTopOffset - layout.topPadding)
        return resolveVisibleVirtualRows(
            metrics,
            effectiveScrollTop,
            viewport.height,
            effectiveEstimatedRowHeight * ROW_OVERSCAN_COUNT,
        )
    }, [layout, metrics, viewport, effectiveEstimatedRowHeight])

    useEffect(() => {
        if (!layout || typeof ResizeObserver === 'undefined') return

        const resizeObserver = new ResizeObserver((entries) => {
            setMeasuredRowHeights((previous) => {
                let next = previous
                let changed = false
                entries.forEach((entry) => {
                    const rowIndex = Number((entry.target as HTMLElement).dataset.rowIndex)
                    const nextHeight = Math.ceil(entry.contentRect.height)
                    if (!Number.isFinite(rowIndex) || nextHeight <= 0 || previous.get(rowIndex) === nextHeight) return
                    if (!changed) {
                        next = new Map(previous)
                        changed = true
                    }
                    next.set(rowIndex, nextHeight)
                })
                return changed ? next : previous
            })
        })

        rowElementMapRef.current.forEach((node, rowIndex) => {
            if (rowIndex < visibleRange.startRow || rowIndex > visibleRange.endRow) return
            resizeObserver.observe(node)
        })

        return () => {
            resizeObserver.disconnect()
        }
    }, [layout, visibleRange.startRow, visibleRange.endRow])

    const probeBooks = visibleBooks.slice(0, PROBE_CARD_LIMIT)

    if (!layout || !metrics) {
        return (
            <div ref={probeGridRef} className={styles.grid} data-testid="book-grid-probe">
                {probeBooks.map((book) => (
                    <BookCard
                        key={book.id}
                        book={book}
                        progress={progressMap[book.id] ?? 0}
                        onOpenBook={onOpenBook}
                        onContextMenu={onContextMenu}
                    />
                ))}
            </div>
        )
    }

    const renderedRows = [] as JSX.Element[]
    for (let rowIndex = visibleRange.startRow; rowIndex <= visibleRange.endRow; rowIndex += 1) {
        const rowBooks = rows[rowIndex]
        if (!rowBooks || rowBooks.length === 0) continue
        renderedRows.push(
            <div
                key={`virtual-row-${rowIndex}`}
                ref={(node) => {
                    if (node) {
                        rowElementMapRef.current.set(rowIndex, node)
                    } else {
                        rowElementMapRef.current.delete(rowIndex)
                    }
                }}
                data-row-index={rowIndex}
                className={styles.virtualGridRow}
                style={{
                    top: layout.topPadding + metrics.rowTops[rowIndex],
                    gap: `${layout.rowGap}px ${layout.columnGap}px`,
                    gridTemplateColumns: `repeat(${layout.columnCount}, minmax(0, 1fr))`,
                }}
            >
                {rowBooks.map((book) => (
                    <BookCard
                        key={book.id}
                        book={book}
                        progress={progressMap[book.id] ?? 0}
                        onOpenBook={onOpenBook}
                        onContextMenu={onContextMenu}
                    />
                ))}
            </div>,
        )
    }

    return (
        <div
            className={styles.virtualGrid}
            style={{ height: layout.topPadding + metrics.totalHeight }}
            data-testid="book-grid-virtual"
        >
            {renderedRows}
        </div>
    )
}

interface BookGridProps {
    activeNav: string
    activeShelfId: string | null
    shelfGroups: ShelfGroup[]
    visibleBooks: BookMeta[]
    progressMap: Record<string, number>
    onOpenBook: (id: string) => void
    onSetActiveShelf: (id: string) => void
    onContextMenu: (event: ReactMouseEvent<HTMLElement>, bookId: string) => void
    scrollContainer: HTMLDivElement | null
}

export const BookGrid = ({
    activeNav,
    activeShelfId,
    shelfGroups,
    visibleBooks,
    progressMap,
    onOpenBook,
    onSetActiveShelf,
    onContextMenu,
    scrollContainer,
}: BookGridProps) => (
    <>
        {activeNav === 'all' && !activeShelfId && shelfGroups.length > 0 && (
            <div className={styles.shelfGroups}>
                {shelfGroups.map((group) => (
                    <button
                        key={group.id}
                        className={styles.shelfGroupCard}
                        onClick={() => onSetActiveShelf(group.id)}
                        title={`${group.name}（${group.books.length} 本）`}
                    >
                        <div className={styles.shelfGroupCovers}>
                            {group.books.slice(0, 4).map((book) => (
                                <div key={book.id} className={styles.shelfGroupCover}>
                                    <LazyCoverImage bookId={book.id} format={book.format} alt={book.title} compact />
                                </div>
                            ))}
                        </div>
                        <div className={styles.shelfGroupMeta}>
                            <strong>{group.name}</strong>
                            <span>{group.books.length} 本</span>
                        </div>
                    </button>
                ))}
            </div>
        )}
        {visibleBooks.length === 0 ? (
            <div className={styles.emptyState}>
                <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 0.5 }}
                    transition={{ delay: 0.2 }}
                >
                    书架空空如也，导入一本书开始阅读吧。
                </motion.p>
            </div>
        ) : (
            <VirtualBookGrid
                visibleBooks={visibleBooks}
                progressMap={progressMap}
                onOpenBook={onOpenBook}
                onContextMenu={onContextMenu}
                scrollContainer={scrollContainer}
            />
        )}
    </>
)
