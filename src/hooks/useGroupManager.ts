import { useEffect, useMemo, useState } from 'react'
import type { BookMeta } from '../services/storageService'
import {
    buildHomeOrderKey,
    reorderKeys,
    resolveOrderedIds,
    sanitizeGroupState,
    type GroupItem,
} from './groupManagerState'
import {
    loadGroupState,
    saveGroupOrderingState,
    saveGroupState,
} from './groupManagerRepository'

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

function areStatesEqual(
    left: ReturnType<typeof sanitizeGroupState>,
    right: ReturnType<typeof sanitizeGroupState>,
): boolean {
    const areStringArraysEqual = (leftValues: readonly string[], rightValues: readonly string[]) => {
        if (leftValues.length !== rightValues.length) return false
        for (let index = 0; index < leftValues.length; index += 1) {
            if (leftValues[index] !== rightValues[index]) return false
        }
        return true
    }

    const areGroupArraysEqual = (leftGroups: readonly GroupItem[], rightGroups: readonly GroupItem[]) => {
        if (leftGroups.length !== rightGroups.length) return false
        for (let index = 0; index < leftGroups.length; index += 1) {
            if (leftGroups[index].id !== rightGroups[index].id) return false
            if (leftGroups[index].name !== rightGroups[index].name) return false
        }
        return true
    }

    const areIdMapsEqual = (
        leftMap: Record<string, string[]>,
        rightMap: Record<string, string[]>,
    ) => {
        const leftKeys = Object.keys(leftMap)
        const rightKeys = Object.keys(rightMap)
        if (leftKeys.length !== rightKeys.length) return false
        for (const key of leftKeys) {
            if (!(key in rightMap)) return false
            if (!areStringArraysEqual(leftMap[key] || [], rightMap[key] || [])) return false
        }
        return true
    }

    return (
        areGroupArraysEqual(left.groups, right.groups) &&
        areIdMapsEqual(left.groupBookMap, right.groupBookMap) &&
        areIdMapsEqual(left.groupBookOrder, right.groupBookOrder) &&
        areStringArraysEqual(left.homeOrder, right.homeOrder)
    )
}

export function useGroupManager(options: UseGroupManagerOptions) {
    const { books, trashBookIdSet, activeNav, showInfoDialog, showConfirmDialog } = options

    const [groups, setGroups] = useState<GroupItem[]>([])
    const [groupBookMap, setGroupBookMap] = useState<Record<string, string[]>>({})
    const [groupBookOrder, setGroupBookOrder] = useState<Record<string, string[]>>({})
    const [homeOrder, setHomeOrder] = useState<string[]>([])
    const [activeGroupId, setActiveGroupId] = useState<string | null>(null)
    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({})
    const [showCreateGroupModal, setShowCreateGroupModal] = useState(false)
    const [newGroupName, setNewGroupName] = useState('')
    const [showManageGroupModal, setShowManageGroupModal] = useState(false)
    const [manageSourceGroupId, setManageSourceGroupId] = useState('')
    const [manageTargetGroupId, setManageTargetGroupId] = useState('')

    const persistGroupState = async (next: ReturnType<typeof sanitizeGroupState>) => {
        setGroups(next.groups)
        setGroupBookMap(next.groupBookMap)
        setGroupBookOrder(next.groupBookOrder)
        setHomeOrder(next.homeOrder)
        await saveGroupState(next)
    }

    useEffect(() => {
        let cancelled = false

        const loadGroups = async () => {
            const loadedState = await loadGroupState(books)
            const sanitized = sanitizeGroupState(
                loadedState.groups,
                loadedState.groupBookMap,
                loadedState.groupBookOrder,
                loadedState.homeOrder,
                books,
            )

            if (cancelled) return

            setGroups(sanitized.groups)
            setGroupBookMap(sanitized.groupBookMap)
            setGroupBookOrder(sanitized.groupBookOrder)
            setHomeOrder(sanitized.homeOrder)

            if (!loadedState.hasNewState || !areStatesEqual(sanitized, loadedState)) {
                await saveGroupState(sanitized)
            }
        }

        void loadGroups()

        return () => {
            cancelled = true
        }
    }, [])

    useEffect(() => {
        if (groups.length === 0 && activeGroupId) {
            setActiveGroupId(null)
            return
        }
        if (activeGroupId && !groups.some((group) => group.id === activeGroupId)) {
            setActiveGroupId(null)
        }

        if (groups.length > 0) {
            if (!manageSourceGroupId || !groups.some((group) => group.id === manageSourceGroupId)) {
                setManageSourceGroupId(groups[0].id)
            }
            if (!manageTargetGroupId || !groups.some((group) => group.id === manageTargetGroupId)) {
                setManageTargetGroupId(groups[0].id)
            }
        } else {
            setManageSourceGroupId('')
            setManageTargetGroupId('')
        }

        setExpandedGroups((previous) => {
            const next: Record<string, boolean> = {}
            groups.forEach((group) => {
                next[group.id] = previous[group.id] ?? false
            })
            return next
        })
    }, [activeGroupId, groups])

    useEffect(() => {
        const sanitized = sanitizeGroupState(groups, groupBookMap, groupBookOrder, homeOrder, books)
        const current = { groups, groupBookMap, groupBookOrder, homeOrder }
        if (areStatesEqual(sanitized, current as ReturnType<typeof sanitizeGroupState>)) return

        setGroupBookMap(sanitized.groupBookMap)
        setGroupBookOrder(sanitized.groupBookOrder)
        setHomeOrder(sanitized.homeOrder)
        void saveGroupOrderingState({
            groupBookMap: sanitized.groupBookMap,
            groupBookOrder: sanitized.groupBookOrder,
            homeOrder: sanitized.homeOrder,
        })
    }, [books, groups, groupBookMap, groupBookOrder, homeOrder])

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
            return {
                id: group.id,
                name: group.name,
                bookIds: orderedBookIds,
                books: visibleBooks,
            }
        })
    }, [groups, orderedGroupBookIdsByGroup, bookById, trashBookIdSet])

    const toggleGroupExpanded = (groupId: string) => {
        setExpandedGroups((previous) => ({ ...previous, [groupId]: !previous[groupId] }))
    }

    const buildDefaultGroupName = () => {
        const base = '新分组'
        let index = 1
        let nextName = base
        const existingNames = new Set(groups.map((group) => group.name))
        while (existingNames.has(nextName)) {
            index += 1
            nextName = `${base}${index}`
        }
        return nextName
    }

    const openCreateGroupModal = () => {
        setNewGroupName(buildDefaultGroupName())
        setShowCreateGroupModal(true)
    }

    const createGroup = async () => {
        const finalName = newGroupName.trim()
        if (!finalName) {
            showInfoDialog('分组名称不能为空')
            return
        }
        if (groups.some((group) => group.name === finalName)) {
            showInfoDialog('分组名称已存在')
            return
        }

        const newGroup: GroupItem = { id: crypto.randomUUID(), name: finalName }
        const nextState = sanitizeGroupState(
            [...groups, newGroup],
            { ...groupBookMap, [newGroup.id]: [] },
            { ...groupBookOrder, [newGroup.id]: [] },
            [...homeOrder, buildHomeOrderKey('group', newGroup.id)],
            books,
        )
        await persistGroupState(nextState)
        setActiveGroupId(newGroup.id)
        setShowCreateGroupModal(false)
    }

    const openManageGroupModal = () => {
        if (groups.length === 0) {
            showInfoDialog('当前没有分组，请先新建分组。')
            return
        }
        setShowManageGroupModal(true)
    }

    const renameGroup = async (groupId: string, nextNameRaw: string) => {
        const nextName = nextNameRaw.trim()
        if (!nextName) return
        if (groups.some((group) => group.id !== groupId && group.name === nextName)) {
            showInfoDialog('分组名称已存在')
            return
        }
        await persistGroupState(sanitizeGroupState(
            groups.map((group) => (group.id === groupId ? { ...group, name: nextName } : group)),
            groupBookMap,
            groupBookOrder,
            homeOrder,
            books,
        ))
    }

    const dissolveGroup = (groupId: string) => {
        showConfirmDialog('确认解散该分组？（不会删除书籍）', async () => {
            const nextGroups = groups.filter((group) => group.id !== groupId)
            const nextGroupBookMap = { ...groupBookMap }
            const releasedBookIds = nextGroupBookMap[groupId] || []
            delete nextGroupBookMap[groupId]
            const nextGroupBookOrder = { ...groupBookOrder }
            delete nextGroupBookOrder[groupId]
            const remainingGroupedIds = new Set<string>()
            Object.values(nextGroupBookMap).forEach((bookIds) => {
                bookIds.forEach((bookId) => remainingGroupedIds.add(bookId))
            })
            const nextHomeOrder = homeOrder.filter((key) => key !== buildHomeOrderKey('group', groupId))
            releasedBookIds.forEach((bookId) => {
                if (remainingGroupedIds.has(bookId)) return
                const homeKey = buildHomeOrderKey('book', bookId)
                if (!nextHomeOrder.includes(homeKey)) nextHomeOrder.push(homeKey)
            })
            await persistGroupState(sanitizeGroupState(nextGroups, nextGroupBookMap, nextGroupBookOrder, nextHomeOrder, books))
            if (activeGroupId === groupId) setActiveGroupId(null)
        })
    }

    const moveGroupBooks = async (fromGroupId: string, toGroupId: string) => {
        if (!fromGroupId || !toGroupId || fromGroupId === toGroupId) return
        const sourceOrder = orderedGroupBookIdsByGroup[fromGroupId] || []
        const targetOrder = orderedGroupBookIdsByGroup[toGroupId] || []
        const mergedOrder = Array.from(new Set([...targetOrder, ...sourceOrder]))
        await persistGroupState(sanitizeGroupState(
            groups,
            {
                ...groupBookMap,
                [fromGroupId]: [],
                [toGroupId]: mergedOrder,
            },
            {
                ...groupBookOrder,
                [fromGroupId]: [],
                [toGroupId]: mergedOrder,
            },
            homeOrder,
            books,
        ))
    }

    const addBookToGroup = async (bookId: string) => {
        if (groups.length === 0) {
            showInfoDialog('请先新建分组')
            return
        }
        const group = activeGroupId
            ? groups.find((item) => item.id === activeGroupId) || groups[0]
            : groups[0]
        const ids = groupBookMap[group.id] || []
        if (ids.includes(bookId)) return

        await persistGroupState(sanitizeGroupState(
            groups,
            {
                ...groupBookMap,
                [group.id]: [...ids, bookId],
            },
            {
                ...groupBookOrder,
                [group.id]: [...(groupBookOrder[group.id] || []), bookId],
            },
            homeOrder.filter((key) => key !== buildHomeOrderKey('book', bookId)),
            books,
        ))
    }

    const removeBookFromActiveGroup = async (bookId: string) => {
        if (!activeGroupId) return
        const ids = groupBookMap[activeGroupId] || []
        if (!ids.includes(bookId)) return
        const nextGroupBookMap = {
            ...groupBookMap,
            [activeGroupId]: ids.filter((id) => id !== bookId),
        }
        const nextGroupBookOrder = {
            ...groupBookOrder,
            [activeGroupId]: (groupBookOrder[activeGroupId] || []).filter((id) => id !== bookId),
        }
        const stillGrouped = Object.entries(nextGroupBookMap).some(([, groupIds]) => groupIds.includes(bookId))
        const nextHomeOrder = [...homeOrder]
        if (!stillGrouped) {
            const bookKey = buildHomeOrderKey('book', bookId)
            if (!nextHomeOrder.includes(bookKey)) nextHomeOrder.push(bookKey)
        }
        await persistGroupState(sanitizeGroupState(groups, nextGroupBookMap, nextGroupBookOrder, nextHomeOrder, books))
    }

    const reorderHomeItems = async (sourceKey: string, targetKey: string, availableKeys: string[]) => {
        const orderedKeys = reorderKeys(availableKeys, sourceKey, targetKey)
        await persistGroupState(sanitizeGroupState(groups, groupBookMap, groupBookOrder, orderedKeys, books))
    }

    const reorderActiveGroupBooks = async (sourceBookId: string, targetBookId: string) => {
        if (!activeGroupId) return
        const currentOrderedIds = orderedGroupBookIdsByGroup[activeGroupId] || []
        const nextOrderedIds = reorderKeys(currentOrderedIds, sourceBookId, targetBookId)
        await persistGroupState(sanitizeGroupState(
            groups,
            {
                ...groupBookMap,
                [activeGroupId]: nextOrderedIds,
            },
            {
                ...groupBookOrder,
                [activeGroupId]: nextOrderedIds,
            },
            homeOrder,
            books,
        ))
    }

    return {
        groups,
        groupBookMap,
        groupBookOrder,
        homeOrder,
        activeGroupId,
        setActiveGroupId,
        expandedGroups,

        showCreateGroupModal,
        setShowCreateGroupModal,
        newGroupName,
        setNewGroupName,
        showManageGroupModal,
        setShowManageGroupModal,
        manageSourceGroupId,
        setManageSourceGroupId,
        manageTargetGroupId,
        setManageTargetGroupId,

        bookById,
        groupedBookIdSet,
        activeGroupBookIdSet,
        orderedGroupBookIdsByGroup,
        groupCollections,

        toggleGroupExpanded,
        openCreateGroupModal,
        createGroup,
        openManageGroupModal,
        renameGroup,
        dissolveGroup,
        moveGroupBooks,
        addBookToGroup,
        removeBookFromActiveGroup,
        reorderHomeItems,
        reorderActiveGroupBooks,
    }
}
