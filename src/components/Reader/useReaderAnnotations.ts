import { useEffect, useState } from 'react'
import { db, type Bookmark, type Highlight } from '@/services/storageService'
import type { ReaderPanelTab } from './ReaderLeftPanel'

interface UseReaderAnnotationsArgs {
    readonly activeTab: ReaderPanelTab
    readonly bookId: string
    readonly leftPanelOpen: boolean
}

export function useReaderAnnotations({ activeTab, bookId, leftPanelOpen }: UseReaderAnnotationsArgs) {
    const [highlights, setHighlights] = useState<Highlight[]>([])
    const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
    const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null)

    useEffect(() => {
        if (!leftPanelOpen || activeTab !== 'annotations') return

        const loadAnnotations = async () => {
            const [loadedHighlights, loadedBookmarks] = await Promise.all([
                db.highlights.where('bookId').equals(bookId).toArray(),
                db.bookmarks.where('bookId').equals(bookId).toArray(),
            ])

            setHighlights(loadedHighlights.sort((left, right) => right.createdAt - left.createdAt))
            setBookmarks(loadedBookmarks.sort((left, right) => right.createdAt - left.createdAt))
        }

        void loadAnnotations()
    }, [leftPanelOpen, activeTab, bookId])

    const deleteHighlight = async (id: string) => {
        await db.highlights.delete(id)
        setHighlights((previous) => previous.filter((highlight) => highlight.id !== id))
    }

    const deleteBookmark = async (id: string) => {
        await db.bookmarks.delete(id)
        setBookmarks((previous) => previous.filter((bookmark) => bookmark.id !== id))
    }

    return {
        bookmarks,
        deleteBookmark,
        deleteHighlight,
        expandedNoteId,
        highlights,
        setExpandedNoteId,
    }
}
