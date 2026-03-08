import { motion } from 'framer-motion'
import type { Highlight, Bookmark } from '../../services/storageService'
import styles from './LibraryView.module.css'

type AnnotationGroup<T> = {
    bookId: string
    bookTitle: string
    items: T[]
}

interface AnnotationListProps {
    activeNav: 'highlight' | 'notes'
    groupedHighlights: AnnotationGroup<Highlight>[]
    groupedBookmarks: AnnotationGroup<Bookmark>[]
    onOpenBook: (id: string, jump?: { location: string; searchText?: string }) => void
}

export const AnnotationList = ({
    activeNav,
    groupedHighlights,
    groupedBookmarks,
    onOpenBook,
}: AnnotationListProps) => {
    const isEmpty = (activeNav === 'highlight' ? groupedHighlights : groupedBookmarks).length === 0

    return (
        <div className={styles.annotationGroups}>
            {isEmpty ? (
                <div className={styles.emptyState}>
                    <motion.p initial={{ opacity: 0 }} animate={{ opacity: 0.5 }} transition={{ delay: 0.2 }}>
                        {activeNav === 'highlight' ? '还没有高亮标注。' : '还没有笔记。'}
                    </motion.p>
                </div>
            ) : (activeNav === 'highlight' ? groupedHighlights : []).map((group) => (
                <div key={group.bookId} className={styles.annotationGroup}>
                    <button className={styles.annotationGroupTitle} onClick={() => onOpenBook(group.bookId)}>
                        <span>{group.bookTitle}</span>
                        <span className={styles.annotationCount}>{group.items.length}</span>
                    </button>
                    {group.items.map((h) => (
                        <div key={h.id} className={styles.annotationEntry} onClick={() => onOpenBook(group.bookId, { location: h.cfiRange, searchText: h.text })} style={{ cursor: 'pointer' }}>
                            <span className={styles.highlightBar} style={{ background: h.color }} />
                            <span className={styles.annotationText}>{h.text}</span>
                            <span className={styles.annotationDate}>{new Date(h.createdAt).toLocaleDateString()}</span>
                        </div>
                    ))}
                </div>
            ))}
            {activeNav === 'notes' && groupedBookmarks.map((group) => (
                <div key={group.bookId} className={styles.annotationGroup}>
                    <button className={styles.annotationGroupTitle} onClick={() => onOpenBook(group.bookId)}>
                        <span>{group.bookTitle}</span>
                        <span className={styles.annotationCount}>{group.items.length}</span>
                    </button>
                    {group.items.map((b) => (
                        <div key={b.id} className={styles.annotationEntry} onClick={() => onOpenBook(group.bookId, { location: b.location, searchText: b.title })} style={{ cursor: 'pointer' }}>
                            <span className={styles.noteIcon}>📝</span>
                            <div className={styles.noteContent}>
                                {b.title && <span className={styles.noteQuote}>{b.title}</span>}
                                {b.note && <span className={styles.noteBody}>{b.note}</span>}
                            </div>
                            <span className={styles.annotationDate}>{new Date(b.createdAt).toLocaleDateString()}</span>
                        </div>
                    ))}
                </div>
            ))}
        </div>
    )
}
