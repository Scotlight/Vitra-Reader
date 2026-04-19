import {
    type MouseEvent as ReactMouseEvent,
    type PointerEvent as ReactPointerEvent,
    useEffect,
    useLayoutEffect,
    useMemo,
    useReducer,
    useRef,
    useState,
} from 'react'
import { motion } from 'framer-motion'
import type { BookMeta } from '../../services/storageService'
import { getBookCover } from '../../services/storageService'
import type { GroupCollection } from '../../hooks/useGroupManager'
import { BookFormatPlaceholder } from './BookFormatPlaceholder'
import { buildVirtualGridMetrics, chunkItemsIntoRows, resolveVisibleVirtualRows } from './libraryVirtualGrid'
import styles from './LibraryView.module.css'

const PROBE_CARD_LIMIT = 24
const ROW_OVERSCAN_COUNT = 2
const ROW_GROUP_EPSILON_PX = 2
const LONG_PRESS_MS = 320
const LONG_PRESS_CANCEL_DISTANCE = 10

interface VirtualGridLayoutSnapshot {
    columnCount: number
    rowGap: number
    columnGap: number
    topPadding: number
    gridTopOffset: number
    initialEstimatedRowHeight: number
}

export type LibraryGridItem =
    | { key: string; type: 'book'; book: BookMeta }
    | { key: string; type: 'group'; group: GroupCollection }

function readPixelValue(value: string): number {
    const parsed = Number.parseFloat(value)
    return Number.isFinite(parsed) ? parsed : 0
}

function collectVirtualGridProbeLayout(
    probeGrid: HTMLDivElement,
    scrollContainer: HTMLDivElement,
): (VirtualGridLayoutSnapshot & { initialRowHeights: Map<number, number> }) | null {
    const cards = Array.from(probeGrid.querySelectorAll<HTMLElement>('[data-virtual-card="true"]'))
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

function resolveSortTargetKey(clientX: number, clientY: number, sortContextKey: string | null): string | null {
    if (!sortContextKey) return null
    const target = document
        .elementFromPoint(clientX, clientY)
        ?.closest<HTMLElement>('[data-sort-key][data-sort-context]')

    if (!target || target.dataset.sortContext !== sortContextKey) return null
    return target.dataset.sortKey || null
}

const bookCoverCache = new Map<string, string | null>()

function LazyCoverImage({ bookId, format, alt, compact }: { bookId: string; format?: string; alt: string; compact?: boolean }) {
    const [cover, setCover] = useState<string | null>(() => bookCoverCache.get(bookId) ?? null)
    const [loaded, setLoaded] = useState(() => Boolean(bookCoverCache.get(bookId)))

    useEffect(() => {
        let cancelled = false
        const cachedCover = bookCoverCache.has(bookId) ? (bookCoverCache.get(bookId) ?? null) : null
        if (cachedCover) {
            setCover(cachedCover)
            setLoaded(true)
        } else if (bookCoverCache.has(bookId)) {
            setCover(null)
            setLoaded(false)
        }

        getBookCover(bookId).then((url) => {
            if (cancelled) return
            const nextCover = url ?? null
            const previousCachedCover = bookCoverCache.has(bookId) ? (bookCoverCache.get(bookId) ?? null) : null
            bookCoverCache.set(bookId, nextCover)
            setCover((previous) => (previous === nextCover ? previous : nextCover))
            setLoaded(Boolean(nextCover) && previousCachedCover === nextCover)
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
            onError={() => {
                bookCoverCache.set(bookId, null)
                setCover(null)
                setLoaded(false)
            }}
        />
    )
}

interface DragHandlers {
    draggingKey: string | null
    onClickCapture: (event: ReactMouseEvent<HTMLElement>) => void
    onPointerDown: (event: ReactPointerEvent<HTMLElement>, key: string) => void
    onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void
    onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void
    onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => void
}

interface GridCardProps {
    item: LibraryGridItem
    progressMap: Record<string, number>
    onOpenBook: (id: string) => void
    onOpenGroup: (id: string) => void
    onContextMenu: (event: ReactMouseEvent<HTMLElement>, bookId: string) => void
    sortable: boolean
    sortContextKey: string | null
    dragHandlers: DragHandlers
}

function GridCard({
    item,
    progressMap,
    onOpenBook,
    onOpenGroup,
    onContextMenu,
    sortable,
    sortContextKey,
    dragHandlers,
}: GridCardProps) {
    const commonProps = {
        'data-virtual-card': 'true',
        'data-library-item': 'true',
        'data-sort-key': sortable ? item.key : undefined,
        'data-sort-context': sortable && sortContextKey ? sortContextKey : undefined,
        className: `${item.type === 'book' ? styles.card : styles.groupCard} ${dragHandlers.draggingKey === item.key ? styles.dragSortingCard : ''}`,
        initial: false,
        whileHover: dragHandlers.draggingKey === item.key ? undefined : { y: -5, boxShadow: '0 8px 30px rgba(0,0,0,0.12)' },
        onClickCapture: dragHandlers.onClickCapture,
        onPointerDown: sortable ? (event: ReactPointerEvent<HTMLElement>) => dragHandlers.onPointerDown(event, item.key) : undefined,
        onPointerMove: sortable ? dragHandlers.onPointerMove : undefined,
        onPointerUp: sortable ? dragHandlers.onPointerUp : undefined,
        onPointerCancel: sortable ? dragHandlers.onPointerCancel : undefined,
    } satisfies Record<string, unknown>

    if (item.type === 'group') {
        return (
            <motion.div
                {...commonProps}
                title={`${item.group.name}（${item.group.books.length} 本）`}
                onClick={() => onOpenGroup(item.group.id)}
                onContextMenu={(event: ReactMouseEvent<HTMLElement>) => {
                    event.preventDefault()
                    event.stopPropagation()
                }}
            >
                <div className={styles.groupCovers}>
                    {Array.from({ length: 4 }, (_, index) => item.group.books[index] ?? null).map((book, index) => (
                        <div key={book?.id ?? `${item.group.id}-placeholder-${index}`} className={styles.groupCover}>
                            {book ? (
                                <LazyCoverImage bookId={book.id} format={book.format} alt={book.title} compact />
                            ) : (
                                <BookFormatPlaceholder compact />
                            )}
                        </div>
                    ))}
                </div>
                <div className={styles.groupMeta}>
                    <strong>{item.group.name}</strong>
                    <span>{item.group.books.length} 本</span>
                </div>
            </motion.div>
        )
    }

    const { book } = item
    const progress = progressMap[book.id] ?? 0

    return (
        <motion.div
            {...commonProps}
            onClick={() => onOpenBook(book.id)}
            onContextMenu={(event: ReactMouseEvent<HTMLElement>) => onContextMenu(event, book.id)}
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

interface VirtualItemGridProps {
    items: LibraryGridItem[]
    progressMap: Record<string, number>
    onOpenBook: (id: string) => void
    onOpenGroup: (id: string) => void
    onContextMenu: (event: ReactMouseEvent<HTMLElement>, bookId: string) => void
    scrollContainer: HTMLDivElement | null
    sortable: boolean
    sortContextKey: string | null
    onReorder?: (sourceKey: string, targetKey: string) => void | Promise<void>
}

function VirtualItemGrid({
    items,
    progressMap,
    onOpenBook,
    onOpenGroup,
    onContextMenu,
    scrollContainer,
    sortable,
    sortContextKey,
    onReorder,
}: VirtualItemGridProps) {
    const probeGridRef = useRef<HTMLDivElement | null>(null)
    const rowElementMapRef = useRef(new Map<number, HTMLDivElement>())
    const [layout, setLayout] = useState<VirtualGridLayoutSnapshot | null>(null)
    const [measuredRowHeights, setMeasuredRowHeights] = useState<Map<number, number>>(new Map())
    const [viewport, setViewport] = useState({ scrollTop: 0, height: 0 })
    const [layoutResetToken, forceLayoutReset] = useReducer((value: number) => value + 1, 0)
    const [draggingKey, setDraggingKey] = useState<string | null>(null)
    const suppressClickUntilRef = useRef(0)
    const itemSignature = useMemo(
        () => items.map((item) => `${item.type}:${item.key}`).join('\u001f'),
        [items],
    )
    const sortGestureRef = useRef<{
        timeoutId: number | null
        active: boolean
        pointerId: number | null
        sourceKey: string | null
        startX: number
        startY: number
        latestTargetKey: string | null
    }>({
        timeoutId: null,
        active: false,
        pointerId: null,
        sourceKey: null,
        startX: 0,
        startY: 0,
        latestTargetKey: null,
    })

    const resetSortGesture = () => {
        const gesture = sortGestureRef.current
        if (gesture.timeoutId !== null) {
            window.clearTimeout(gesture.timeoutId)
        }
        sortGestureRef.current = {
            timeoutId: null,
            active: false,
            pointerId: null,
            sourceKey: null,
            startX: 0,
            startY: 0,
            latestTargetKey: null,
        }
        setDraggingKey(null)
    }

    useEffect(() => {
        rowElementMapRef.current.clear()
        setMeasuredRowHeights(new Map())
        setLayout(null)
        resetSortGesture()
    }, [itemSignature])

    useEffect(() => resetSortGesture, [])

    useEffect(() => {
        if (!sortable || !sortContextKey) {
            resetSortGesture()
        }
    }, [sortable, sortContextKey])

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
        () => chunkItemsIntoRows(items, layout?.columnCount ?? 1),
        [items, layout?.columnCount],
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

    const handlePointerDown = (event: ReactPointerEvent<HTMLElement>, key: string) => {
        if (!sortable || !sortContextKey || event.button !== 0) return

        resetSortGesture()
        try {
            event.currentTarget.setPointerCapture(event.pointerId)
        } catch {
            // noop
        }

        const pointerId = event.pointerId
        sortGestureRef.current = {
            timeoutId: window.setTimeout(() => {
                if (sortGestureRef.current.pointerId !== pointerId || sortGestureRef.current.sourceKey !== key) return
                sortGestureRef.current.active = true
                sortGestureRef.current.timeoutId = null
                sortGestureRef.current.latestTargetKey = key
                setDraggingKey(key)
            }, LONG_PRESS_MS),
            active: false,
            pointerId,
            sourceKey: key,
            startX: event.clientX,
            startY: event.clientY,
            latestTargetKey: null,
        }
    }

    const handlePointerMove = (event: ReactPointerEvent<HTMLElement>) => {
        const gesture = sortGestureRef.current
        if (gesture.pointerId !== event.pointerId) return

        if (!gesture.active) {
            const movedDistance = Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY)
            if (movedDistance > LONG_PRESS_CANCEL_DISTANCE) {
                resetSortGesture()
            }
            return
        }

        const targetKey = resolveSortTargetKey(event.clientX, event.clientY, sortContextKey)
        if (targetKey) {
            gesture.latestTargetKey = targetKey
        }
        event.preventDefault()
    }

    const finishPointerGesture = (event: ReactPointerEvent<HTMLElement>, cancelled = false) => {
        const gesture = sortGestureRef.current
        if (gesture.pointerId !== event.pointerId) return

        const wasActive = gesture.active
        const sourceKey = gesture.sourceKey
        const targetKey = wasActive
            ? (resolveSortTargetKey(event.clientX, event.clientY, sortContextKey) ?? gesture.latestTargetKey)
            : null

        resetSortGesture()

        if (!wasActive) return

        suppressClickUntilRef.current = Date.now() + 400
        event.preventDefault()

        if (!cancelled && sourceKey && targetKey && sourceKey !== targetKey && onReorder) {
            void onReorder(sourceKey, targetKey)
        }
    }

    const handleClickCapture = (event: ReactMouseEvent<HTMLElement>) => {
        if (suppressClickUntilRef.current <= Date.now()) return
        event.preventDefault()
        event.stopPropagation()
    }

    const dragHandlers: DragHandlers = {
        draggingKey,
        onClickCapture: handleClickCapture,
        onPointerDown: handlePointerDown,
        onPointerMove: handlePointerMove,
        onPointerUp: (event) => finishPointerGesture(event, false),
        onPointerCancel: (event) => finishPointerGesture(event, true),
    }

    const probeItems = items.slice(0, PROBE_CARD_LIMIT)

    if (!layout || !metrics) {
        return (
            <div ref={probeGridRef} className={styles.grid} data-testid="book-grid-probe">
                {probeItems.map((item) => (
                    <GridCard
                        key={item.key}
                        item={item}
                        progressMap={progressMap}
                        onOpenBook={onOpenBook}
                        onOpenGroup={onOpenGroup}
                        onContextMenu={onContextMenu}
                        sortable={sortable}
                        sortContextKey={sortContextKey}
                        dragHandlers={dragHandlers}
                    />
                ))}
            </div>
        )
    }

    const renderedRows = [] as JSX.Element[]
    for (let rowIndex = visibleRange.startRow; rowIndex <= visibleRange.endRow; rowIndex += 1) {
        const rowItems = rows[rowIndex]
        if (!rowItems || rowItems.length === 0) continue
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
                {rowItems.map((item) => (
                    <GridCard
                        key={item.key}
                        item={item}
                        progressMap={progressMap}
                        onOpenBook={onOpenBook}
                        onOpenGroup={onOpenGroup}
                        onContextMenu={onContextMenu}
                        sortable={sortable}
                        sortContextKey={sortContextKey}
                        dragHandlers={dragHandlers}
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
    items: LibraryGridItem[]
    emptyMessage: string
    progressMap: Record<string, number>
    onOpenBook: (id: string) => void
    onOpenGroup: (id: string) => void
    onContextMenu: (event: ReactMouseEvent<HTMLElement>, bookId: string) => void
    scrollContainer: HTMLDivElement | null
    sortable: boolean
    sortContextKey: string | null
    onReorder?: (sourceKey: string, targetKey: string) => void | Promise<void>
}

export const BookGrid = ({
    items,
    emptyMessage,
    progressMap,
    onOpenBook,
    onOpenGroup,
    onContextMenu,
    scrollContainer,
    sortable,
    sortContextKey,
    onReorder,
}: BookGridProps) => {
    if (items.length === 0) {
        return (
            <div className={styles.emptyState}>
                <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 0.5 }}
                    transition={{ delay: 0.2 }}
                >
                    {emptyMessage}
                </motion.p>
            </div>
        )
    }

    return (
        <VirtualItemGrid
            items={items}
            progressMap={progressMap}
            onOpenBook={onOpenBook}
            onOpenGroup={onOpenGroup}
            onContextMenu={onContextMenu}
            scrollContainer={scrollContainer}
            sortable={sortable}
            sortContextKey={sortContextKey}
            onReorder={onReorder}
        />
    )
}
