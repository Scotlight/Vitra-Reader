import { type MouseEvent as ReactMouseEvent, useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { BookMeta } from '../../services/storageService'
import { getBookCover } from '../../services/storageService'
import type { ShelfGroup } from '../../hooks/useShelfManager'
import { BookFormatPlaceholder } from './BookFormatPlaceholder'
import styles from './LibraryView.module.css'

const containerVariants = {
    hidden: { opacity: 0 },
    show: {
        opacity: 1,
        transition: { staggerChildren: 0 },
    },
}

const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    show: { y: 0, opacity: 1 },
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
                                <LazyCoverImage bookId={book.id} format={book.format} alt={book.title} />
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
