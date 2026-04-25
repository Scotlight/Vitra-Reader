import { useEffect, useState } from 'react'
import type { BookMeta } from '../services/storageService'
import {
    buildHomeOrderKey,
    reorderKeys,
    sanitizeGroupState,
    areGroupStatesEqual,
    type GroupItem,
} from './groupManagerState'
import {
    loadGroupState,
    saveGroupOrderingState,
    saveGroupState,
} from './groupManagerRepository'
import { useGroupModalState } from './useGroupModalState'
import { useGroupDerivedData } from './useGroupDerivedData'

export type GroupCollection = {
    id: string
    name: string
    bookIds: string[]
    books: BookMeta[]
}

interface UseGroupManagerOptions {
    books: BookMeta[]
    trashBookIdSet: Set<string>
    activeNav: string
    showInfoDialog: (message: string) => void
    showConfirmDialog: (message: string, onConfirm: () => Promise<void> | void) => void
}

export function useGroupManager(options: UseGroupManagerOptions) {
    const { books, trashBookIdSet, activeNav, showInfoDialog, showConfirmDialog } = options

    const [groups, setGroups] = useState<GroupItem[]>([])
    const [groupBookMap, setGroupBookMap] = useState<Record<string, string[]>>({})
    const [groupBookOrder, setGroupBookOrder] = useState<Record<string, string[]>>({})
    const [homeOrder, setHomeOrder] = useState<string[]>([])
    const [activeGroupId, setActiveGroupId] = useState<string | null>(null)
    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({})

    const modal = useGroupModalState({ groups, showInfoDialog })

    const derived = useGroupDerivedData({
        books, groups, groupBookMap, groupBookOrder,
        activeGroupId, activeNav, trashBookIdSet,
    })

    const persistGroupState = async (next: ReturnType<typeof sanitizeGroupState>) => {
        setGroups(next.groups)
        setGroupBookMap(next.groupBookMap)
        setGroupBookOrder(next.groupBookOrder)
        setHomeOrder(next.homeOrder)
        await saveGroupState(next)
    }

    // Initial load
    useEffect(() => {
        let cancelled = false
        const load = async () => {
            const loaded = await loadGroupState(books)
            const sanitized = sanitizeGroupState(
                loaded.groups, loaded.groupBookMap, loaded.groupBookOrder, loaded.homeOrder, books,
            )
            if (cancelled) return
            setGroups(sanitized.groups)
            setGroupBookMap(sanitized.groupBookMap)
            setGroupBookOrder(sanitized.groupBookOrder)
            setHomeOrder(sanitized.homeOrder)
            if (!loaded.hasNewState || !areGroupStatesEqual(sanitized, loaded)) {
                await saveGroupState(sanitized)
            }
        }
        void load()
        return () => { cancelled = true }
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    // Sync activeGroupId and expandedGroups when groups change
    useEffect(() => {
        if (groups.length === 0 && activeGroupId) { setActiveGroupId(null); return }
        if (activeGroupId && !groups.some((g) => g.id === activeGroupId)) setActiveGroupId(null)
        setExpandedGroups((prev) => {
            const next: Record<string, boolean> = {}
            groups.forEach((g) => { next[g.id] = prev[g.id] ?? false })
            return next
        })
    }, [activeGroupId, groups])

    // Re-sanitize when books change
    useEffect(() => {
        const sanitized = sanitizeGroupState(groups, groupBookMap, groupBookOrder, homeOrder, books)
        const current = { groups, groupBookMap, groupBookOrder, homeOrder }
        if (areGroupStatesEqual(sanitized, current as ReturnType<typeof sanitizeGroupState>)) return
        setGroupBookMap(sanitized.groupBookMap)
        setGroupBookOrder(sanitized.groupBookOrder)
        setHomeOrder(sanitized.homeOrder)
        void saveGroupOrderingState({
            groupBookMap: sanitized.groupBookMap,
            groupBookOrder: sanitized.groupBookOrder,
            homeOrder: sanitized.homeOrder,
        })
    }, [books, groups, groupBookMap, groupBookOrder, homeOrder])

    const toggleGroupExpanded = (groupId: string) => {
        setExpandedGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }))
    }

    const buildDefaultGroupName = () => {
        const base = '新分组'
        let index = 1
        let name = base
        const existing = new Set(groups.map((g) => g.name))
        while (existing.has(name)) { index += 1; name = `${base}${index}` }
        return name
    }

    const createGroup = async () => {
        const finalName = modal.newGroupName.trim()
        if (!finalName) { showInfoDialog('分组名称不能为空'); return }
        if (groups.some((g) => g.name === finalName)) { showInfoDialog('分组名称已存在'); return }
        const newGroup: GroupItem = { id: crypto.randomUUID(), name: finalName }
        const next = sanitizeGroupState(
            [...groups, newGroup],
            { ...groupBookMap, [newGroup.id]: [] },
            { ...groupBookOrder, [newGroup.id]: [] },
            [...homeOrder, buildHomeOrderKey('group', newGroup.id)],
            books,
        )
        await persistGroupState(next)
        setActiveGroupId(newGroup.id)
        modal.setShowCreateGroupModal(false)
    }

    const renameGroup = async (groupId: string, nextNameRaw: string) => {
        const nextName = nextNameRaw.trim()
        if (!nextName) return
        if (groups.some((g) => g.id !== groupId && g.name === nextName)) {
            showInfoDialog('分组名称已存在'); return
        }
        await persistGroupState(sanitizeGroupState(
            groups.map((g) => (g.id === groupId ? { ...g, name: nextName } : g)),
            groupBookMap, groupBookOrder, homeOrder, books,
        ))
    }

    const dissolveGroup = (groupId: string) => {
        showConfirmDialog('确认解散该分组？（不会删除书籍）', async () => {
            const nextGroups = groups.filter((g) => g.id !== groupId)
            const nextMap = { ...groupBookMap }
            const released = nextMap[groupId] || []
            delete nextMap[groupId]
            const nextOrder = { ...groupBookOrder }
            delete nextOrder[groupId]
            const stillGrouped = new Set<string>()
            Object.values(nextMap).forEach((ids) => ids.forEach((id) => stillGrouped.add(id)))
            const nextHome = homeOrder.filter((k) => k !== buildHomeOrderKey('group', groupId))
            released.forEach((bookId) => {
                if (stillGrouped.has(bookId)) return
                const key = buildHomeOrderKey('book', bookId)
                if (!nextHome.includes(key)) nextHome.push(key)
            })
            await persistGroupState(sanitizeGroupState(nextGroups, nextMap, nextOrder, nextHome, books))
            if (activeGroupId === groupId) setActiveGroupId(null)
        })
    }

    const moveGroupBooks = async (fromGroupId: string, toGroupId: string) => {
        if (!fromGroupId || !toGroupId || fromGroupId === toGroupId) return
        const srcOrder = derived.orderedGroupBookIdsByGroup[fromGroupId] || []
        const tgtOrder = derived.orderedGroupBookIdsByGroup[toGroupId] || []
        const merged = Array.from(new Set([...tgtOrder, ...srcOrder]))
        await persistGroupState(sanitizeGroupState(
            groups,
            { ...groupBookMap, [fromGroupId]: [], [toGroupId]: merged },
            { ...groupBookOrder, [fromGroupId]: [], [toGroupId]: merged },
            homeOrder, books,
        ))
    }

    const addBookToGroup = async (bookId: string) => {
        if (groups.length === 0) { showInfoDialog('请先新建分组'); return }
        const group = activeGroupId
            ? groups.find((g) => g.id === activeGroupId) || groups[0]
            : groups[0]
        const ids = groupBookMap[group.id] || []
        if (ids.includes(bookId)) return
        await persistGroupState(sanitizeGroupState(
            groups,
            { ...groupBookMap, [group.id]: [...ids, bookId] },
            { ...groupBookOrder, [group.id]: [...(groupBookOrder[group.id] || []), bookId] },
            homeOrder.filter((k) => k !== buildHomeOrderKey('book', bookId)),
            books,
        ))
    }

    const removeBookFromActiveGroup = async (bookId: string) => {
        if (!activeGroupId) return
        const ids = groupBookMap[activeGroupId] || []
        if (!ids.includes(bookId)) return
        const nextMap = { ...groupBookMap, [activeGroupId]: ids.filter((id) => id !== bookId) }
        const nextOrder = {
            ...groupBookOrder,
            [activeGroupId]: (groupBookOrder[activeGroupId] || []).filter((id) => id !== bookId),
        }
        const stillGrouped = Object.entries(nextMap).some(([, gids]) => gids.includes(bookId))
        const nextHome = [...homeOrder]
        if (!stillGrouped) {
            const key = buildHomeOrderKey('book', bookId)
            if (!nextHome.includes(key)) nextHome.push(key)
        }
        await persistGroupState(sanitizeGroupState(groups, nextMap, nextOrder, nextHome, books))
    }

    const reorderHomeItems = async (sourceKey: string, targetKey: string, availableKeys: string[]) => {
        const ordered = reorderKeys(availableKeys, sourceKey, targetKey)
        await persistGroupState(sanitizeGroupState(groups, groupBookMap, groupBookOrder, ordered, books))
    }

    const reorderActiveGroupBooks = async (sourceBookId: string, targetBookId: string) => {
        if (!activeGroupId) return
        const current = derived.orderedGroupBookIdsByGroup[activeGroupId] || []
        const next = reorderKeys(current, sourceBookId, targetBookId)
        await persistGroupState(sanitizeGroupState(
            groups,
            { ...groupBookMap, [activeGroupId]: next },
            { ...groupBookOrder, [activeGroupId]: next },
            homeOrder, books,
        ))
    }

    return {
        groups, groupBookMap, groupBookOrder, homeOrder,
        activeGroupId, setActiveGroupId,
        expandedGroups,

        ...modal,
        openCreateGroupModal: () => modal.openCreateGroupModal(buildDefaultGroupName()),

        ...derived,

        toggleGroupExpanded,
        createGroup,
        renameGroup,
        dissolveGroup,
        moveGroupBooks,
        addBookToGroup,
        removeBookFromActiveGroup,
        reorderHomeItems,
        reorderActiveGroupBooks,
    }
}
