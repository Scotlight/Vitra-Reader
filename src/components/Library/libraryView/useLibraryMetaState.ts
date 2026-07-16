import { useCallback, useEffect, useRef, useState } from 'react'
import type { Bookmark, Highlight } from '@/services/storageService'
import {
    areProgressMapsEqual,
    areStringListsEqual,
    type LibraryActiveNav,
} from './useLibraryDerivedData'
import {
    loadLibraryAnnotationMeta,
    loadLibraryCoreMeta,
    saveFavoriteBookIds,
    saveTrashBookIds,
} from './libraryMetaRepository'

interface UseLibraryMetaStateOptions {
    activeNav: LibraryActiveNav
}

function isAnnotationNav(nav: LibraryActiveNav): boolean {
    return nav === 'notes' || nav === 'highlight'
}

export function useLibraryMetaState(options: UseLibraryMetaStateOptions) {
    const { activeNav } = options
    const [progressMap, setProgressMap] = useState<Record<string, number>>({})
    // 旧收藏列表仅保留一个发布周期：迁移读源 + 彻底删除时顺带清理，UI 不再消费。
    const [favoriteBookIds, setFavoriteBookIds] = useState<string[]>([])
    const [trashBookIds, setTrashBookIds] = useState<string[]>([])
    const [noteBookIds, setNoteBookIds] = useState<string[]>([])
    const [highlightBookIds, setHighlightBookIds] = useState<string[]>([])
    const [allHighlights, setAllHighlights] = useState<Highlight[]>([])
    const [allBookmarks, setAllBookmarks] = useState<Bookmark[]>([])
    const metaRefreshTaskRef = useRef<Promise<void> | null>(null)
    const annotationRefreshTaskRef = useRef<Promise<void> | null>(null)
    const activeNavRef = useRef<LibraryActiveNav>(activeNav)

    const loadCoreMeta = useCallback(async () => {
        if (metaRefreshTaskRef.current) return metaRefreshTaskRef.current

        const task = (async () => {
            const snapshot = await loadLibraryCoreMeta()

            setProgressMap((previous) => (areProgressMapsEqual(previous, snapshot.progressMap) ? previous : snapshot.progressMap))
            setFavoriteBookIds((previous) => (areStringListsEqual(previous, snapshot.favoriteBookIds) ? previous : snapshot.favoriteBookIds))
            setTrashBookIds((previous) => (areStringListsEqual(previous, snapshot.trashBookIds) ? previous : snapshot.trashBookIds))
            setNoteBookIds((previous) => (areStringListsEqual(previous, snapshot.noteBookIds) ? previous : snapshot.noteBookIds))
            setHighlightBookIds((previous) => (areStringListsEqual(previous, snapshot.highlightBookIds) ? previous : snapshot.highlightBookIds))
        })().finally(() => {
            if (metaRefreshTaskRef.current === task) {
                metaRefreshTaskRef.current = null
            }
        })

        metaRefreshTaskRef.current = task
        return task
    }, [])

    const loadAnnotationMeta = useCallback(async () => {
        if (annotationRefreshTaskRef.current) return annotationRefreshTaskRef.current

        const task = (async () => {
            const snapshot = await loadLibraryAnnotationMeta()

            setNoteBookIds((previous) => (areStringListsEqual(previous, snapshot.noteBookIds) ? previous : snapshot.noteBookIds))
            setHighlightBookIds((previous) => (areStringListsEqual(previous, snapshot.highlightBookIds) ? previous : snapshot.highlightBookIds))
            setAllHighlights(snapshot.allHighlights)
            setAllBookmarks(snapshot.allBookmarks)
        })().finally(() => {
            if (annotationRefreshTaskRef.current === task) {
                annotationRefreshTaskRef.current = null
            }
        })

        annotationRefreshTaskRef.current = task
        return task
    }, [])

    useEffect(() => {
        activeNavRef.current = activeNav
        if (isAnnotationNav(activeNav)) {
            void loadAnnotationMeta()
        }
    }, [activeNav, loadAnnotationMeta])

    useEffect(() => {
        void loadCoreMeta()
        const handleFocus = () => {
            if (document.visibilityState === 'hidden') return
            void loadCoreMeta()
            if (isAnnotationNav(activeNavRef.current)) {
                void loadAnnotationMeta()
            }
        }
        document.addEventListener('visibilitychange', handleFocus)
        window.addEventListener('focus', handleFocus)
        return () => {
            document.removeEventListener('visibilitychange', handleFocus)
            window.removeEventListener('focus', handleFocus)
        }
    }, [loadCoreMeta, loadAnnotationMeta])

    const persistFavorites = async (next: string[]) => {
        setFavoriteBookIds(next)
        await saveFavoriteBookIds(next)
    }

    const persistTrash = async (next: string[]) => {
        setTrashBookIds(next)
        await saveTrashBookIds(next)
    }

    const moveToTrash = async (bookId: string) => {
        if (trashBookIds.includes(bookId)) return
        await persistTrash([...trashBookIds, bookId])
        // 旧收藏键仍可能残留；进回收时顺手摘掉，避免迁移回滚时脏数据。
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
        moveToTrash,
        restoreFromTrash,
        reloadCoreMeta: loadCoreMeta,
    }
}
