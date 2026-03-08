import { type MouseEvent as ReactMouseEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { BookMeta } from '../../services/storageService'
import type { ShelfGroup } from '../../hooks/useShelfManager'
import { BookFormatPlaceholder } from './BookFormatPlaceholder'
import styles from './LibraryView.module.css'

const containerVariants = {
    hidden: { opacity: 0 },
    show: {
        opacity: 1,
        transition: { staggerChildren: 0.05 },
    },
}

const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    show: { y: 0, opacity: 1 },
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
                                    {book.cover ? (
                                        <img src={book.cover} alt={book.title} />
                                    ) : (
                                        <BookFormatPlaceholder format={book.format} compact />
                                    )}
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
            <motion.div
                className={styles.grid}
                variants={containerVariants}
                initial="hidden"
                animate="show"
            >
                <AnimatePresence mode="popLayout">
                    {visibleBooks.map((book) => (
                        <motion.div
                            key={book.id}
                            className={styles.card}
                            variants={itemVariants}
                            layout
                            whileHover={{ y: -5, boxShadow: '0 8px 30px rgba(0,0,0,0.12)' }}
                            onClick={() => onOpenBook(book.id)}
                            onContextMenu={(event) => onContextMenu(event, book.id)}
                        >
                            <div className={styles.coverWrapper}>
                                {book.cover ? (
                                    <img src={book.cover} alt={book.title} className={styles.coverImage} />
                                ) : (
                                    <BookFormatPlaceholder format={book.format} />
                                )}
                                <div className={styles.cardOverlay} />
                            </div>
                            <div className={styles.meta}>
                                <h3 className={styles.title} title={book.title}>{book.title}</h3>
                                <p className={styles.author}>{book.author || 'Unknown'}</p>
                                <div className={styles.progressRow}>
                                    <span>{progressMap[book.id] ?? 0}%</span>
                                </div>
                                <div className={styles.progressTrack}>
                                    <div className={styles.progressFill} style={{ width: `${progressMap[book.id] ?? 0}%` }} />
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </AnimatePresence>
            </motion.div>
        )}
    </>
)
