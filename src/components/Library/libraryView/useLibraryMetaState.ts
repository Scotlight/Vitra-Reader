import { useEffect, useRef, useState } from 'react'
import { db, type Bookmark, type Highlight } from '../../../services/storageService'
import { areProgressMapsEqual, areStringListsEqual } from './useLibraryDerivedData'

export function useLibraryMetaState() {
    const [progressMap, setProgressMap] = useState<Record<string, number>>({})
    const [favoriteBookIds, setFavoriteBookIds] = useState<string[]>([])
    const [trashBookIds, setTrashBookIds] = useState<string[]>([])
    const [noteBookIds, setNoteBookIds] = useState<string[]>([])
    const [highlightBookIds, setHighlightBookIds] = useState<string[]>([])
    const [allHighlights, setAllHighlights] = useState<Highlight[]>([])
    const [allBookmarks, setAllBookmarks] = useState<Bookmark[]>([])
    const metaRefreshTaskRef = useRef<Promise<void> | null>(null)

    useEffect(() => {
        const loadAllMeta = async () => {
            if (metaRefreshTaskRef.current) return metaRefreshTaskRef.current

            const task = (async () => {
                const [allProgress, favoriteEntry, trashEntry, bookmarks, highlights] = await Promise.all([
                    db.progress.toArray(),
                    db.settings.get('favoriteBookIds'),
                    db.settings.get('trashBookIds'),
                    db.bookmarks.toArray(),
                    db.highlights.toArray(),
                ])
                const nextProgressMap = allProgress.reduce<Record<string, number>>((acc, item) => {
                    acc[item.bookId] = Math.round((item.percentage || 0) * 100)
                    return acc
                }, {})
                const favoriteValue = favoriteEntry?.value
                const nextFavoriteBookIds = Array.isArray(favoriteValue) ? favoriteValue.map((item) => String(item)) : []
                const trashValue = trashEntry?.value
                const nextTrashBookIds = Array.isArray(trashValue) ? trashValue.map((item) => String(item)) : []
                const nextNoteBookIds = Array.from(new Set(bookmarks.map((item) => item.bookId)))
                const nextHighlightBookIds = Array.from(new Set(highlights.map((item) => item.bookId)))

                setProgressMap((previous) => (areProgressMapsEqual(previous, nextProgressMap) ? previous : nextProgressMap))
                setFavoriteBookIds((previous) => (areStringListsEqual(previous, nextFavoriteBookIds) ? previous : nextFavoriteBookIds))
                setTrashBookIds((previous) => (areStringListsEqual(previous, nextTrashBookIds) ? previous : nextTrashBookIds))
                setNoteBookIds((previous) => (areStringListsEqual(previous, nextNoteBookIds) ? previous : nextNoteBookIds))
                setHighlightBookIds((previous) => (areStringListsEqual(previous, nextHighlightBookIds) ? previous : nextHighlightBookIds))
                setAllHighlights(highlights)
                setAllBookmarks(bookmarks)
            })().finally(() => {
                if (metaRefreshTaskRef.current === task) {
                    metaRefreshTaskRef.current = null
                }
            })

            metaRefreshTaskRef.current = task
            return task
        }

        void loadAllMeta()
        const handleFocus = () => {
            if (document.visibilityState === 'hidden') return
            void loadAllMeta()
        }
        document.addEventListener('visibilitychange', handleFocus)
        window.addEventListener('focus', handleFocus)
        return () => {
            document.removeEventListener('visibilitychange', handleFocus)
            window.removeEventListener('focus', handleFocus)
        }
    }, [])

    const persistFavorites = async (next: string[]) => {
        setFavoriteBookIds(next)
        await db.settings.put({ key: 'favoriteBookIds', value: next })
    }

    const persistTrash = async (next: string[]) => {
        setTrashBookIds(next)
        await db.settings.put({ key: 'trashBookIds', value: next })
    }

    const toggleFavorite = async (bookId: string) => {
        const exists = favoriteBookIds.includes(bookId)
        const next = exists ? favoriteBookIds.filter((id) => id !== bookId) : [...favoriteBookIds, bookId]
        await persistFavorites(next)
    }

    const moveToTrash = async (bookId: string) => {
        if (trashBookIds.includes(bookId)) return
        await persistTrash([...trashBookIds, bookId])
        if (favoriteBookIds.includes(bookId)) {
            await persistFavorites(favoriteBookIds.filter((id) => id !== bookId))
        }
    }

    const restoreFromTrash = async (bookId: string) => {
        await persistTrash(trashBookIds.filter((id) => id !== bookId))
    }

    return {
        progressMap,
        favoriteBookIds,
        trashBookIds,
        noteBookIds,
        highlightBookIds,
        allHighlights,
        allBookmarks,
        persistFavorites,
        persistTrash,
        toggleFavorite,
        moveToTrash,
        restoreFromTrash,
    }
}
