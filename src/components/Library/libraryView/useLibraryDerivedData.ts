import { useMemo } from 'react'
import {
    BOOK_SHELF_LABEL,
    BOOK_SHELF_LABEL_DISPLAY,
    BOOK_SHELF_LABEL_VALUES,
    normalizeShelfLabel,
    type Bookmark,
    type BookMeta,
    type BookShelfLabel,
    type Highlight,
} from '@/services/storageService'
import type { GroupCollection } from '@/hooks/useGroupManager'
import { applyHomeOrder, buildHomeOrderKey, parseHomeOrderKey } from '@/hooks/groupManagerState'
import type { LibraryGridItem } from '../BookGrid'

export function areStringListsEqual(left: readonly string[], right: readonly string[]): boolean {
    if (left === right) return true
    if (left.length !== right.length) return false
    for (let index = 0; index < left.length; index += 1) {
        if (left[index] !== right[index]) return false
    }
    return true
}

export function areProgressMapsEqual(left: Record<string, number>, right: Record<string, number>): boolean {
    const leftKeys = Object.keys(left)
    const rightKeys = Object.keys(right)
    if (leftKeys.length !== rightKeys.length) return false
    for (const key of leftKeys) {
        if (left[key] !== right[key]) return false
    }
    return true
}

export type LibraryActiveNav =
    | 'all'
    | BookShelfLabel
    | 'notes'
    | 'highlight'
    | 'trash'
    | 'stats'
export type LibrarySortMode = 'lastRead' | 'addedAt' | 'title' | 'author'

export type ShelfLabelCounts = Record<BookShelfLabel, number>

export function isShelfLabelNav(nav: LibraryActiveNav): nav is BookShelfLabel {
    return (BOOK_SHELF_LABEL_VALUES as readonly string[]).includes(nav)
}

/** 统计非回收书籍的标签数量，供侧栏展示。 */
export function countShelfLabels(books: readonly BookMeta[], trashBookIds: readonly string[]): ShelfLabelCounts {
    const trashSet = new Set(trashBookIds)
    const counts: ShelfLabelCounts = {
        [BOOK_SHELF_LABEL.TO_READ]: 0,
        [BOOK_SHELF_LABEL.READING]: 0,
        [BOOK_SHELF_LABEL.READ]: 0,
        [BOOK_SHELF_LABEL.GOOD]: 0,
    }
    for (const book of books) {
        if (trashSet.has(book.id)) continue
        counts[normalizeShelfLabel(book.shelfLabel)] += 1
    }
    return counts
}

type AnnotationGroup<T> = {
    bookId: string
    bookTitle: string
    items: T[]
}

interface UseLibraryDerivedDataOptions {
    books: BookMeta[]
    keyword: string
    sortMode: LibrarySortMode
    activeNav: LibraryActiveNav
    activeGroupId: string | null
    trashBookIds: string[]
    noteBookIds: string[]
    highlightBookIds: string[]
    groupCollections: GroupCollection[]
    groupedBookIdSet: Set<string>
    homeOrder: string[]
    allHighlights: Highlight[]
    allBookmarks: Bookmark[]
    bookById: Map<string, BookMeta>
}

export function useLibraryDerivedData(options: UseLibraryDerivedDataOptions) {
    const {
        books,
        keyword,
        sortMode,
        activeNav,
        activeGroupId,
        trashBookIds,
        noteBookIds,
        highlightBookIds,
        groupCollections,
        groupedBookIdSet,
        homeOrder,
        allHighlights,
        allBookmarks,
        bookById,
    } = options

    const trashBookIdSet = useMemo(() => new Set(trashBookIds), [trashBookIds])
    const noteBookIdSet = useMemo(() => new Set(noteBookIds), [noteBookIds])
    const highlightBookIdSet = useMemo(() => new Set(highlightBookIds), [highlightBookIds])
    const shelfLabelCounts = useMemo(
        () => countShelfLabels(books, trashBookIds),
        [books, trashBookIds],
    )

    const filteredBooks = useMemo(() => {
        if (activeNav === 'stats') return []

        const q = keyword.trim().toLowerCase()
        const matchesKeyword = (title: string, author: string) => title.toLowerCase().includes(q) || author.toLowerCase().includes(q)
        const sourceBase = !q
            ? books
            : books.filter((book) => matchesKeyword(book.title, book.author))
        const source = activeNav === 'trash'
            ? sourceBase.filter((book) => trashBookIdSet.has(book.id))
            : sourceBase.filter((book) => !trashBookIdSet.has(book.id))

        const navFiltered =
            isShelfLabelNav(activeNav)
                ? source.filter((book) => normalizeShelfLabel(book.shelfLabel) === activeNav)
                : activeNav === 'notes'
                    ? source.filter((book) => noteBookIdSet.has(book.id))
                    : activeNav === 'highlight'
                        ? source.filter((book) => highlightBookIdSet.has(book.id))
                        : source

        if (activeNav === 'all' && activeGroupId) {
            const activeGroupCollection = groupCollections.find((item) => item.id === activeGroupId)
            const orderedBooks = activeGroupCollection?.books ?? []
            return !q ? orderedBooks : orderedBooks.filter((book) => matchesKeyword(book.title, book.author))
        }

        return [...navFiltered].sort((left, right) => {
            if (sortMode === 'title') return left.title.localeCompare(right.title, 'zh-CN')
            if (sortMode === 'author') return left.author.localeCompare(right.author, 'zh-CN')
            if (sortMode === 'addedAt') return (right.addedAt || 0) - (left.addedAt || 0)
            return (right.lastReadAt || 0) - (left.lastReadAt || 0)
        })
    }, [activeGroupId, activeNav, books, groupCollections, highlightBookIdSet, keyword, noteBookIdSet, sortMode, trashBookIdSet])

    const showMixedHome = activeNav === 'all' && !activeGroupId && keyword.trim() === ''

    const visibleBooks = useMemo(() => {
        if (!showMixedHome) return filteredBooks
        return filteredBooks.filter((book) => !groupedBookIdSet.has(book.id))
    }, [filteredBooks, groupedBookIdSet, showMixedHome])

    const homeItems = useMemo<LibraryGridItem[]>(() => {
        if (!showMixedHome) return []

        const availableKeys = [
            ...groupCollections.map((collection) => buildHomeOrderKey('group', collection.id)),
            ...visibleBooks.map((book) => buildHomeOrderKey('book', book.id)),
        ]
        const groupsById = new Map(groupCollections.map((collection) => [collection.id, collection]))
        const visibleBooksById = new Map(visibleBooks.map((book) => [book.id, book]))
        const orderedItems: LibraryGridItem[] = []

        applyHomeOrder(availableKeys, homeOrder).forEach((key) => {
            const parsed = parseHomeOrderKey(key)
            if (!parsed) return

            if (parsed.type === 'group') {
                const collection = groupsById.get(parsed.id)
                if (collection) {
                    orderedItems.push({ key, type: 'group', group: collection })
                }
                return
            }

            const book = visibleBooksById.get(parsed.id)
            if (book) {
                orderedItems.push({ key, type: 'book', book })
            }
        })

        return orderedItems
    }, [groupCollections, homeOrder, showMixedHome, visibleBooks])

    const gridItems = useMemo<LibraryGridItem[]>(() => {
        if (showMixedHome) return homeItems
        return visibleBooks.map((book) => ({ key: book.id, type: 'book', book }))
    }, [homeItems, showMixedHome, visibleBooks])

    const groupedHighlights = useMemo<AnnotationGroup<Highlight>[]>(() => {
        const map = new Map<string, Highlight[]>()
        allHighlights.forEach((item) => {
            if (!map.has(item.bookId)) map.set(item.bookId, [])
            map.get(item.bookId)!.push(item)
        })
        return Array.from(map.entries())
            .map(([bookId, items]) => ({
                bookId,
                bookTitle: bookById.get(bookId)?.title ?? '未知书籍',
                items: items.sort((left, right) => right.createdAt - left.createdAt),
            }))
            .sort((left, right) => (right.items[0]?.createdAt ?? 0) - (left.items[0]?.createdAt ?? 0))
    }, [allHighlights, bookById])

    const groupedBookmarks = useMemo<AnnotationGroup<Bookmark>[]>(() => {
        const map = new Map<string, Bookmark[]>()
        allBookmarks.forEach((item) => {
            if (!map.has(item.bookId)) map.set(item.bookId, [])
            map.get(item.bookId)!.push(item)
        })
        return Array.from(map.entries())
            .map(([bookId, items]) => ({
                bookId,
                bookTitle: bookById.get(bookId)?.title ?? '未知书籍',
                items: items.sort((left, right) => right.createdAt - left.createdAt),
            }))
            .sort((left, right) => (right.items[0]?.createdAt ?? 0) - (left.items[0]?.createdAt ?? 0))
    }, [allBookmarks, bookById])

    const currentGroupName = activeGroupId
        ? groupCollections.find((item) => item.id === activeGroupId)?.name ?? '当前分组'
        : ''

    const emptyMessage = isShelfLabelNav(activeNav)
        ? `还没有标记为「${BOOK_SHELF_LABEL_DISPLAY[activeNav]}」的图书。`
        : activeNav === 'trash'
            ? '回收站还是空的。'
            : activeNav === 'stats'
                ? '暂无阅读统计。'
                : activeNav === 'all' && activeGroupId
                    ? (keyword.trim() ? `${currentGroupName} 中没有匹配的图书。` : `${currentGroupName} 里还没有图书。`)
                    : activeNav === 'all' && showMixedHome
                        ? '还没有分组和图书，导入一本书开始阅读吧。'
                        : keyword.trim()
                            ? '没有找到匹配的图书。'
                            : '还没有图书，导入一本书开始阅读吧。'

    const statusText = activeNav === 'stats'
        ? '阅读统计'
        : activeNav === 'highlight'
            ? `${allHighlights.length} 条高亮`
            : activeNav === 'notes'
                ? `${allBookmarks.length} 条笔记`
                : showMixedHome
                    ? `${gridItems.length} 项`
                    : `${gridItems.length} 本书`

    const sortModeLabel = sortMode === 'lastRead'
        ? '最近阅读'
        : sortMode === 'addedAt'
            ? '最近导入'
            : sortMode === 'title'
                ? '书名'
                : '作者'

    return {
        showMixedHome,
        homeItems,
        gridItems,
        groupedHighlights,
        groupedBookmarks,
        emptyMessage,
        statusText,
        sortModeLabel,
        shelfLabelCounts,
    }
}
