import {
    type MouseEvent as ReactMouseEvent,
    type PointerEvent as ReactPointerEvent,
    useCallback,
    useEffect,
    useRef,
    useState,
} from 'react'
import { motion } from 'framer-motion'
import type { BookMeta } from '../../services/storageService'
import type { GroupCollection } from '../../hooks/useGroupManager'
import { BookGridCard, type DragHandlers } from './bookGrid/BookGridCard'
import { useVirtualBookGridLayout } from './bookGrid/useVirtualBookGridLayout'
import styles from './LibraryView.module.css'

const LONG_PRESS_MS = 320
const LONG_PRESS_CANCEL_DISTANCE = 10

export type LibraryGridItem =
    | { key: string; type: 'book'; book: BookMeta }
    | { key: string; type: 'group'; group: GroupCollection }

function resolveSortTargetKey(clientX: number, clientY: number, sortContextKey: string | null): string | null {
    if (!sortContextKey) return null
    const target = document
        .elementFromPoint(clientX, clientY)
        ?.closest<HTMLElement>('[data-sort-key][data-sort-context]')

    if (!target || target.dataset.sortContext !== sortContextKey) return null
    return target.dataset.sortKey || null
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
    const [draggingKey, setDraggingKey] = useState<string | null>(null)
    const suppressClickUntilRef = useRef(0)
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

    const resetSortGesture = useCallback(() => {
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
    }, [])

    const {
        probeGridRef,
        rowElementMapRef,
        layout,
        metrics,
        rows,
        visibleRange,
        probeItems,
    } = useVirtualBookGridLayout({
        items,
        scrollContainer,
        onItemsReset: resetSortGesture,
    })

    useEffect(() => resetSortGesture, [])

    useEffect(() => {
        if (!sortable || !sortContextKey) {
            resetSortGesture()
        }
    }, [sortable, sortContextKey])

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

    if (!layout || !metrics) {
        return (
            <div ref={probeGridRef} className={styles.grid} data-testid="book-grid-probe">
                {probeItems.map((item) => (
                    <BookGridCard
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
                    <BookGridCard
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
