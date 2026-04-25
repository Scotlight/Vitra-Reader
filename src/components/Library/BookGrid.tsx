import { type MouseEvent as ReactMouseEvent } from 'react'
import { motion } from 'framer-motion'
import type { BookMeta } from '@/services/storageService'
import type { GroupCollection } from '@/hooks/useGroupManager'
import { BookGridCard } from './bookGrid/BookGridCard'
import { useBookGridDragSort } from './bookGrid/useBookGridDragSort'
import { useVirtualBookGridLayout } from './bookGrid/useVirtualBookGridLayout'
import styles from './LibraryView.module.css'

export type LibraryGridItem =
    | { key: string; type: 'book'; book: BookMeta }
    | { key: string; type: 'group'; group: GroupCollection }

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
    const { dragHandlers, resetSortGesture } = useBookGridDragSort({
        sortable,
        sortContextKey,
        onReorder,
    })

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
