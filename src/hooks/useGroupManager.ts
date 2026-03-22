import { useEffect, useMemo, useState } from 'react'
import { db, type BookMeta } from '../services/storageService'
import {
    GROUPS_SETTINGS_KEY,
    GROUP_BOOK_MAP_SETTINGS_KEY,
    GROUP_BOOK_ORDER_SETTINGS_KEY,
    HOME_ORDER_SETTINGS_KEY,
    LEGACY_SHELVES_SETTINGS_KEY,
    LEGACY_SHELF_BOOK_MAP_SETTINGS_KEY,
    buildHomeOrderKey,
    buildMigratedGroupState,
    normalizeGroupItems,
    normalizeIdMap,
    normalizeStringArray,
    reorderKeys,
    resolveOrderedIds,
    sanitizeGroupState,
    type GroupItem,
} from './groupManagerState'

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
    return JSON.stringify(left) === JSON.stringify(right)
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
        await Promise.all([
            db.settings.put({ key: GROUPS_SETTINGS_KEY, value: next.groups }),
            db.settings.put({ key: GROUP_BOOK_MAP_SETTINGS_KEY, value: next.groupBookMap }),
            db.settings.put({ key: GROUP_BOOK_ORDER_SETTINGS_KEY, value: next.groupBookOrder }),
            db.settings.put({ key: HOME_ORDER_SETTINGS_KEY, value: next.homeOrder }),
        ])
    }

    useEffect(() => {
        let cancelled = false

        const loadGroups = async () => {
            const [
                groupsEntry,
                groupBookMapEntry,
                groupBookOrderEntry,
                homeOrderEntry,
                legacyGroupsEntry,
                legacyGroupBookMapEntry,
            ] = await Promise.all([
                db.settings.get(GROUPS_SETTINGS_KEY),
                db.settings.get(GROUP_BOOK_MAP_SETTINGS_KEY),
                db.settings.get(GROUP_BOOK_ORDER_SETTINGS_KEY),
                db.settings.get(HOME_ORDER_SETTINGS_KEY),
                db.settings.get(LEGACY_SHELVES_SETTINGS_KEY),
                db.settings.get(LEGACY_SHELF_BOOK_MAP_SETTINGS_KEY),
            ])

            const hasNewState = Boolean(groupsEntry || groupBookMapEntry || groupBookOrderEntry || homeOrderEntry)
            const loadedState = hasNewState
                ? {
                    groups: normalizeGroupItems(groupsEntry?.value),
                    groupBookMap: normalizeIdMap(groupBookMapEntry?.value),
                    groupBookOrder: normalizeIdMap(groupBookOrderEntry?.value),
                    homeOrder: normalizeStringArray(homeOrderEntry?.value),
                }
                : buildMigratedGroupState(
                    normalizeGroupItems(legacyGroupsEntry?.value),
                    normalizeIdMap(legacyGroupBookMapEntry?.value),
                    books,
                )

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

            if (!hasNewState || !areStatesEqual(sanitized, loadedState as ReturnType<typeof sanitizeGroupState>)) {
                await Promise.all([
                    db.settings.put({ key: GROUPS_SETTINGS_KEY, value: sanitized.groups }),
                    db.settings.put({ key: GROUP_BOOK_MAP_SETTINGS_KEY, value: sanitized.groupBookMap }),
                    db.settings.put({ key: GROUP_BOOK_ORDER_SETTINGS_KEY, value: sanitized.groupBookOrder }),
                    db.settings.put({ key: HOME_ORDER_SETTINGS_KEY, value: sanitized.homeOrder }),
                ])
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
        void Promise.all([
            db.settings.put({ key: GROUP_BOOK_MAP_SETTINGS_KEY, value: sanitized.groupBookMap }),
            db.settings.put({ key: GROUP_BOOK_ORDER_SETTINGS_KEY, value: sanitized.groupBookOrder }),
            db.settings.put({ key: HOME_ORDER_SETTINGS_KEY, value: sanitized.homeOrder }),
        ])
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
