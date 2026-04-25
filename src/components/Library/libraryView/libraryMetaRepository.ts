import { db, type Bookmark, type Highlight } from '../../../services/storageService'

const K_FAVORITES = 'library:favoriteBookIds'
const K_TRASH = 'library:trashBookIds'

async function dbGetWithMigration(newKey: string, legacyKey: string) {
    const row = await db.settings.get(newKey)
    if (row !== undefined) return row
    const legacy = await db.settings.get(legacyKey)
    if (!legacy) return undefined
    await db.settings.put({ key: newKey, value: legacy.value })
    await db.settings.delete(legacyKey)
    return { key: newKey, value: legacy.value }
}

export interface LibraryCoreMetaSnapshot {
    progressMap: Record<string, number>
    favoriteBookIds: string[]
    trashBookIds: string[]
    noteBookIds: string[]
    highlightBookIds: string[]
}

export interface LibraryAnnotationMetaSnapshot {
    noteBookIds: string[]
    highlightBookIds: string[]
    allHighlights: Highlight[]
    allBookmarks: Bookmark[]
}

export async function loadLibraryCoreMeta(): Promise<LibraryCoreMetaSnapshot> {
    const [allProgress, favoriteEntry, trashEntry, bookmarkBookIds, highlightBookIdsRaw] = await Promise.all([
        db.progress.toArray(),
        dbGetWithMigration(K_FAVORITES, 'favoriteBookIds'),
        dbGetWithMigration(K_TRASH, 'trashBookIds'),
        db.bookmarks.orderBy('bookId').uniqueKeys(),
        db.highlights.orderBy('bookId').uniqueKeys(),
    ])

    const progressMap = allProgress.reduce<Record<string, number>>((acc, item) => {
        acc[item.bookId] = Math.round((item.percentage || 0) * 100)
        return acc
    }, {})
    const favoriteValue = favoriteEntry?.value
    const trashValue = trashEntry?.value

    return {
        progressMap,
        favoriteBookIds: Array.isArray(favoriteValue) ? favoriteValue.map((item) => String(item)) : [],
        trashBookIds: Array.isArray(trashValue) ? trashValue.map((item) => String(item)) : [],
        noteBookIds: bookmarkBookIds.map((item) => String(item)),
        highlightBookIds: highlightBookIdsRaw.map((item) => String(item)),
    }
}

export async function loadLibraryAnnotationMeta(): Promise<LibraryAnnotationMetaSnapshot> {
    const [bookmarks, highlights] = await Promise.all([
        db.bookmarks.toArray(),
        db.highlights.toArray(),
    ])

    return {
        noteBookIds: Array.from(new Set(bookmarks.map((item) => item.bookId))),
        highlightBookIds: Array.from(new Set(highlights.map((item) => item.bookId))),
        allHighlights: highlights,
        allBookmarks: bookmarks,
    }
}

export async function saveFavoriteBookIds(next: string[]): Promise<void> {
    await db.settings.put({ key: K_FAVORITES, value: next })
}

export async function saveTrashBookIds(next: string[]): Promise<void> {
    await db.settings.put({ key: K_TRASH, value: next })
}
