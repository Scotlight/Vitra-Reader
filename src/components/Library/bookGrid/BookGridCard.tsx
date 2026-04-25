import { motion } from 'framer-motion'
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react'
import { BookFormatPlaceholder } from '../BookFormatPlaceholder'
import type { LibraryGridItem } from '../BookGrid'
import { LazyCoverImage } from './LazyCoverImage'
import styles from '../LibraryView.module.css'

export interface DragHandlers {
    draggingKey: string | null
    onClickCapture: (event: ReactMouseEvent<HTMLElement>) => void
    onPointerDown: (event: ReactPointerEvent<HTMLElement>, key: string) => void
    onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void
    onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void
    onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => void
}

interface BookGridCardProps {
    item: LibraryGridItem
    progressMap: Record<string, number>
    onOpenBook: (id: string) => void
    onOpenGroup: (id: string) => void
    onContextMenu: (event: ReactMouseEvent<HTMLElement>, bookId: string) => void
    sortable: boolean
    sortContextKey: string | null
    dragHandlers: DragHandlers
}

export function BookGridCard({
    item,
    progressMap,
    onOpenBook,
    onOpenGroup,
    onContextMenu,
    sortable,
    sortContextKey,
    dragHandlers,
}: BookGridCardProps) {
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
