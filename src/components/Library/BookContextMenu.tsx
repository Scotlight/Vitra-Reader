import type { MouseEvent as ReactMouseEvent } from 'react'
import styles from './LibraryView.module.css'

interface BookContextMenuProps {
    contextMenu: { visible: boolean; x: number; y: number; bookId: string | null }
    setContextMenu: (state: { visible: boolean; x: number; y: number; bookId: null }) => void
    trashBookIds: string[]
    favoriteBookIds: string[]
    activeShelfId: string | null
    shelfBookMap: Record<string, string[]>
    onRestoreFromTrash: (bookId: string) => Promise<void>
    onPermanentDelete: (bookId: string) => void
    onOpenProperties: (bookId: string) => void
    onToggleFavorite: (bookId: string) => Promise<void>
    onAddToShelf: (bookId: string) => Promise<void>
    onRemoveFromShelf: (bookId: string) => Promise<void>
    onMoveToTrash: (bookId: string) => Promise<void>
}

const dismiss = { visible: false as const, x: 0, y: 0, bookId: null }

export const BookContextMenu = ({
    contextMenu,
    setContextMenu,
    trashBookIds,
    favoriteBookIds,
    activeShelfId,
    shelfBookMap,
    onRestoreFromTrash,
    onPermanentDelete,
    onOpenProperties,
    onToggleFavorite,
    onAddToShelf,
    onRemoveFromShelf,
    onMoveToTrash,
}: BookContextMenuProps) => {
    if (!contextMenu.visible || !contextMenu.bookId) return null
    const bookId = contextMenu.bookId

    return (
        <div
            className={styles.contextMenu}
            style={{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }}
            onClick={(event: MouseEvent | ReactMouseEvent) => event.stopPropagation()}
        >
            {trashBookIds.includes(bookId) ? (
                <>
                    <button
                        className={styles.contextMenuItem}
                        onClick={async () => { await onRestoreFromTrash(bookId); setContextMenu(dismiss) }}
                    >
                        恢复图书
                    </button>
                    <button
                        className={`${styles.contextMenuItem} ${styles.contextDanger}`}
                        onClick={() => { onPermanentDelete(bookId); setContextMenu(dismiss) }}
                    >
                        彻底删除
                    </button>
                </>
            ) : (
                <>
                    <button
                        className={styles.contextMenuItem}
                        onClick={() => { onOpenProperties(bookId); setContextMenu(dismiss) }}
                    >
                        属性
                    </button>
                    <button
                        className={styles.contextMenuItem}
                        onClick={async () => { await onToggleFavorite(bookId); setContextMenu(dismiss) }}
                    >
                        {favoriteBookIds.includes(bookId) ? '取消喜爱' : '加入喜爱'}
                    </button>
                    <button
                        className={styles.contextMenuItem}
                        onClick={async () => { await onAddToShelf(bookId); setContextMenu(dismiss) }}
                    >
                        加入书架
                    </button>
                    {activeShelfId && (shelfBookMap[activeShelfId] || []).includes(bookId) && (
                        <button
                            className={styles.contextMenuItem}
                            onClick={async () => { await onRemoveFromShelf(bookId); setContextMenu(dismiss) }}
                        >
                            从当前书架移除
                        </button>
                    )}
                    <button
                        className={`${styles.contextMenuItem} ${styles.contextDanger}`}
                        onClick={async () => { await onMoveToTrash(bookId); setContextMenu(dismiss) }}
                    >
                        移到回收
                    </button>
                </>
            )}
        </div>
    )
}
