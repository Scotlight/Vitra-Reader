import { useMemo } from 'react'
import type { BookMeta } from '@/services/storageService'
import { resolveOrderedIds, buildHomeOrderKey, type GroupItem } from './groupManagerState'
import type { GroupCollection } from './useGroupManager'

interface UseGroupDerivedDataOptions {
    books: BookMeta[]
    groups: GroupItem[]
    groupBookMap: Record<string, string[]>
    groupBookOrder: Record<string, string[]>
    activeGroupId: string | null
    activeNav: string
    trashBookIdSet: Set<string>
}

export function useGroupDerivedData({
    books,
    groups,
    groupBookMap,
    groupBookOrder,
    activeGroupId,
    activeNav,
    trashBookIdSet,
}: UseGroupDerivedDataOptions) {
    const bookById = useMemo(() => {
        const map = new Map<string, BookMeta>()
        books.forEach((book) => map.set(book.id, book))
        return map
    }, [books])

    const orderedGroupBookIdsByGroup = useMemo(() => {
        const next: Record<string, string[]> = {}
        groups.forEach((group) => {
            next[group.id] = resolveOrderedIds(groupBookMap[group.id] || [], groupBookOrder[group.id] || [])
        })
        return next
    }, [groups, groupBookMap, groupBookOrder])

    const groupedBookIdSet = useMemo(() => {
        const next = new Set<string>()
        Object.values(groupBookMap).forEach((bookIds) => {
            bookIds.forEach((bookId) => next.add(bookId))
        })
        return next
    }, [groupBookMap])

    const activeGroupBookIdSet = useMemo(() => {
        if (!(activeNav === 'all' && activeGroupId)) return null
        return new Set(orderedGroupBookIdsByGroup[activeGroupId] || [])
    }, [activeNav, activeGroupId, orderedGroupBookIdsByGroup])

    const groupCollections = useMemo<GroupCollection[]>(() => {
        return groups.map((group) => {
            const orderedBookIds = orderedGroupBookIdsByGroup[group.id] || []
            const visibleBooks = orderedBookIds
                .map((bookId) => bookById.get(bookId))
                .filter((book): book is BookMeta => Boolean(book))
                .filter((book) => !trashBookIdSet.has(book.id))
            return { id: group.id, name: group.name, bookIds: orderedBookIds, books: visibleBooks }
        })
    }, [groups, orderedGroupBookIdsByGroup, bookById, trashBookIdSet])

    return { bookById, orderedGroupBookIdsByGroup, groupedBookIdSet, activeGroupBookIdSet, groupCollections }
}

// Re-export buildHomeOrderKey so callers don't need to import from groupManagerState
export { buildHomeOrderKey }
