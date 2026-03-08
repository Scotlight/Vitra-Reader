import { useEffect, useMemo, useState } from 'react'
import { db, type BookMeta } from '../services/storageService'

// ─── 类型 ────────────────────────────────────────────

export type ShelfItem = {
    id: string
    name: string
}

export type ShelfGroup = {
    id: string
    name: string
    books: BookMeta[]
}

interface UseShelfManagerOptions {
    books: BookMeta[]
    trashBookIdSet: Set<string>
    activeNav: string
    showInfoDialog: (message: string) => void
    showConfirmDialog: (message: string, onConfirm: () => Promise<void> | void) => void
}

// ─── Hook ────────────────────────────────────────────

export function useShelfManager(options: UseShelfManagerOptions) {
    const { books, trashBookIdSet, activeNav, showInfoDialog, showConfirmDialog } = options

    // ── 状态 ──────────────────────────────────────────
    const [shelves, setShelves] = useState<ShelfItem[]>([])
    const [shelfBookMap, setShelfBookMap] = useState<Record<string, string[]>>({})
    const [activeShelfId, setActiveShelfId] = useState<string | null>(null)
    const [expandedShelves, setExpandedShelves] = useState<Record<string, boolean>>({})
    const [showCreateShelfModal, setShowCreateShelfModal] = useState(false)
    const [newShelfName, setNewShelfName] = useState('')
    const [showManageShelfModal, setShowManageShelfModal] = useState(false)
    const [manageSourceShelfId, setManageSourceShelfId] = useState('')
    const [manageTargetShelfId, setManageTargetShelfId] = useState('')

    // ── 从 DB 加载 ───────────────────────────────────

    useEffect(() => {
        const loadShelves = async () => {
            const [shelvesEntry, mapEntry] = await Promise.all([
                db.settings.get('shelves'),
                db.settings.get('shelfBookMap'),
            ])
            const shelvesValue = shelvesEntry?.value
            const mapValue = mapEntry?.value
            if (Array.isArray(shelvesValue)) {
                const normalized = shelvesValue
                    .map((item) => {
                        const value = item as Partial<ShelfItem>
                        return {
                            id: String(value.id || ''),
                            name: String(value.name || ''),
                        }
                    })
                    .filter((item) => item.id && item.name)
                setShelves(normalized)
            } else {
                setShelves([])
            }
            if (mapValue && typeof mapValue === 'object' && !Array.isArray(mapValue)) {
                const normalized: Record<string, string[]> = {}
                Object.entries(mapValue as Record<string, unknown>).forEach(([key, value]) => {
                    if (!Array.isArray(value)) return
                    normalized[key] = value.map((bookId) => String(bookId))
                })
                setShelfBookMap(normalized)
            } else {
                setShelfBookMap({})
            }
        }
        void loadShelves()
    }, [])

    // ── 同步 activeShelfId / expanded ────────────────

    useEffect(() => {
        if (shelves.length === 0 && activeShelfId) {
            setActiveShelfId(null)
            return
        }
        if (activeShelfId && !shelves.some((shelf) => shelf.id === activeShelfId)) {
            setActiveShelfId(null)
        }
        if (shelves.length > 0) {
            if (!manageSourceShelfId || !shelves.some((item) => item.id === manageSourceShelfId)) {
                setManageSourceShelfId(shelves[0].id)
            }
            if (!manageTargetShelfId || !shelves.some((item) => item.id === manageTargetShelfId)) {
                setManageTargetShelfId(shelves[0].id)
            }
        } else {
            setManageSourceShelfId('')
            setManageTargetShelfId('')
        }

        setExpandedShelves((prev) => {
            const existingIds = new Set(shelves.map((shelf) => shelf.id))
            const next: Record<string, boolean> = {}
            shelves.forEach((shelf) => {
                next[shelf.id] = prev[shelf.id] ?? false
            })
            const changed = Object.keys(prev).some((id) => !existingIds.has(id))
            return changed ? next : { ...next }
        })
    }, [activeShelfId, shelves])

    // ── 清理已删除图书的 shelfBookMap ────────────────

    useEffect(() => {
        const validBookIds = new Set(books.map((book) => book.id))
        let changed = false
        const nextMap: Record<string, string[]> = {}
        Object.entries(shelfBookMap).forEach(([shelfId, bookIds]) => {
            const filtered = bookIds.filter((bookId) => validBookIds.has(bookId))
            nextMap[shelfId] = filtered
            if (filtered.length !== bookIds.length) changed = true
        })
        if (!changed) return
        setShelfBookMap(nextMap)
        void db.settings.put({ key: 'shelfBookMap', value: nextMap })
    }, [books, shelfBookMap])

    // ── 计算属性 ─────────────────────────────────────

    const bookById = useMemo(() => {
        const map = new Map<string, BookMeta>()
        books.forEach((book) => map.set(book.id, book))
        return map
    }, [books])

    const activeShelfBookIdSet = useMemo(() => {
        if (!(activeNav === 'all' && activeShelfId)) return null
        return new Set(shelfBookMap[activeShelfId] || [])
    }, [activeNav, activeShelfId, shelfBookMap])

    const shelfGroups = useMemo<ShelfGroup[]>(() => {
        return shelves
            .map((shelf) => {
                const shelfBooks = (shelfBookMap[shelf.id] || [])
                    .map((bookId) => bookById.get(bookId))
                    .filter((book): book is NonNullable<typeof book> => Boolean(book))
                    .filter((book) => !trashBookIdSet.has(book.id))
                return {
                    id: shelf.id,
                    name: shelf.name,
                    books: shelfBooks,
                }
            })
            .filter((group) => group.books.length > 0)
    }, [shelves, shelfBookMap, bookById, trashBookIdSet])

    // ── 持久化辅助 ───────────────────────────────────

    const persistShelves = async (next: ShelfItem[]) => {
        setShelves(next)
        await db.settings.put({ key: 'shelves', value: next })
    }

    const persistShelfBookMap = async (next: Record<string, string[]>) => {
        setShelfBookMap(next)
        await db.settings.put({ key: 'shelfBookMap', value: next })
    }

    // ── 操作 ─────────────────────────────────────────

    const toggleShelfExpanded = (shelfId: string) => {
        setExpandedShelves((prev) => ({ ...prev, [shelfId]: !prev[shelfId] }))
    }

    const buildDefaultShelfName = () => {
        const base = '新书架'
        let index = 1
        let nextName = base
        const existed = new Set(shelves.map((shelf) => shelf.name))
        while (existed.has(nextName)) {
            index += 1
            nextName = `${base}${index}`
        }
        return nextName
    }

    const openCreateShelfModal = () => {
        setNewShelfName(buildDefaultShelfName())
        setShowCreateShelfModal(true)
    }

    const createShelf = async () => {
        const finalName = newShelfName.trim()
        if (!finalName) {
            showInfoDialog('书架名称不能为空')
            return
        }
        if (shelves.some((shelf) => shelf.name === finalName)) {
            showInfoDialog('书架名称已存在')
            return
        }

        const newShelf: ShelfItem = { id: crypto.randomUUID(), name: finalName }
        const nextShelves = [...shelves, newShelf]
        await persistShelves(nextShelves)
        await persistShelfBookMap({ ...shelfBookMap, [newShelf.id]: [] })
        setActiveShelfId(newShelf.id)
        setShowCreateShelfModal(false)
    }

    const openManageShelfModal = () => {
        if (shelves.length === 0) {
            showInfoDialog('当前没有书架，请先新建书架。')
            return
        }
        setShowManageShelfModal(true)
    }

    const renameShelf = async (shelfId: string, nextNameRaw: string) => {
        const nextName = nextNameRaw.trim()
        if (!nextName) return
        const duplicated = shelves.some((item) => item.id !== shelfId && item.name === nextName)
        if (duplicated) {
            showInfoDialog('书架名称已存在')
            return
        }
        const nextShelves = shelves.map((item) => (item.id === shelfId ? { ...item, name: nextName } : item))
        await persistShelves(nextShelves)
    }

    const dissolveShelf = (shelfId: string) => {
        showConfirmDialog('确认解散该书架？（不会删除书籍）', async () => {
            const nextShelves = shelves.filter((item) => item.id !== shelfId)
            const nextMap = { ...shelfBookMap }
            delete nextMap[shelfId]
            await persistShelves(nextShelves)
            await persistShelfBookMap(nextMap)
            if (activeShelfId === shelfId) setActiveShelfId(null)
        })
    }

    const moveShelfBooks = async (fromShelfId: string, toShelfId: string) => {
        if (!fromShelfId || !toShelfId || fromShelfId === toShelfId) return
        const sourceIds = shelfBookMap[fromShelfId] || []
        const targetIds = shelfBookMap[toShelfId] || []
        const merged = Array.from(new Set([...targetIds, ...sourceIds]))
        await persistShelfBookMap({
            ...shelfBookMap,
            [fromShelfId]: [],
            [toShelfId]: merged,
        })
    }

    const addBookToShelf = async (bookId: string) => {
        if (shelves.length === 0) {
            showInfoDialog('请先新建书架')
            return
        }
        const shelf = activeShelfId
            ? shelves.find((item) => item.id === activeShelfId) || shelves[0]
            : shelves[0]
        const ids = shelfBookMap[shelf.id] || []
        if (ids.includes(bookId)) return
        await persistShelfBookMap({
            ...shelfBookMap,
            [shelf.id]: [...ids, bookId],
        })
    }

    const removeBookFromActiveShelf = async (bookId: string) => {
        if (!activeShelfId) return
        const ids = shelfBookMap[activeShelfId] || []
        if (!ids.includes(bookId)) return
        await persistShelfBookMap({
            ...shelfBookMap,
            [activeShelfId]: ids.filter((id) => id !== bookId),
        })
    }

    return {
        // 状态
        shelves,
        shelfBookMap,
        activeShelfId,
        setActiveShelfId,
        expandedShelves,

        // 弹窗状态
        showCreateShelfModal,
        setShowCreateShelfModal,
        newShelfName,
        setNewShelfName,
        showManageShelfModal,
        setShowManageShelfModal,
        manageSourceShelfId,
        setManageSourceShelfId,
        manageTargetShelfId,
        setManageTargetShelfId,

        // 计算属性
        bookById,
        activeShelfBookIdSet,
        shelfGroups,

        // 操作
        toggleShelfExpanded,
        openCreateShelfModal,
        createShelf,
        openManageShelfModal,
        renameShelf,
        dissolveShelf,
        moveShelfBooks,
        addBookToShelf,
        removeBookFromActiveShelf,
    }
}
