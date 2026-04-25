import { useEffect, useState } from 'react'
import { getBookCover } from '../../../services/storageService'
import { BookFormatPlaceholder } from '../BookFormatPlaceholder'
import styles from '../LibraryView.module.css'

const bookCoverCache = new Map<string, string | null>()

export function LazyCoverImage({ bookId, format, alt, compact }: { bookId: string; format?: string; alt: string; compact?: boolean }) {
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
