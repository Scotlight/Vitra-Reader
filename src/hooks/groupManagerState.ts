import type { BookMeta } from '../services/storageService'

export type GroupItem = {
    id: string
    name: string
}

export const GROUPS_SETTINGS_KEY = 'groups:groups'
export const GROUP_BOOK_MAP_SETTINGS_KEY = 'groups:bookMap'
export const GROUP_BOOK_ORDER_SETTINGS_KEY = 'groups:bookOrder'
export const HOME_ORDER_SETTINGS_KEY = 'groups:homeOrder'
export const LEGACY_SHELVES_SETTINGS_KEY = 'shelves'
export const LEGACY_SHELF_BOOK_MAP_SETTINGS_KEY = 'shelfBookMap'

// 存量旧键（迁移用）
export const LEGACY_GROUPS_KEY = 'groups'
export const LEGACY_GROUP_BOOK_MAP_KEY = 'groupBookMap'
export const LEGACY_GROUP_BOOK_ORDER_KEY = 'groupBookOrder'
export const LEGACY_HOME_ORDER_KEY = 'homeOrder'

const GROUP_KEY_PREFIX = 'group:'
const BOOK_KEY_PREFIX = 'book:'

export function buildHomeOrderKey(type: 'group' | 'book', id: string): string {
    return `${type === 'group' ? GROUP_KEY_PREFIX : BOOK_KEY_PREFIX}${id}`
}

export function parseHomeOrderKey(value: string): { type: 'group' | 'book'; id: string } | null {
    if (value.startsWith(GROUP_KEY_PREFIX)) {
        return { type: 'group', id: value.slice(GROUP_KEY_PREFIX.length) }
    }
    if (value.startsWith(BOOK_KEY_PREFIX)) {
        return { type: 'book', id: value.slice(BOOK_KEY_PREFIX.length) }
    }
    return null
}

export function normalizeGroupItems(value: unknown): GroupItem[] {
    if (!Array.isArray(value)) return []

    const seenIds = new Set<string>()
    return value
        .map((item) => {
            const candidate = item as Partial<GroupItem>
            return {
                id: String(candidate.id || ''),
                name: String(candidate.name || '').trim(),
            }
        })
        .filter((item) => item.id && item.name)
        .filter((item) => {
            if (seenIds.has(item.id)) return false
            seenIds.add(item.id)
            return true
        })
}

export function normalizeStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return []
    const seen = new Set<string>()
    return value
        .map((item) => String(item || ''))
        .filter((item) => item)
        .filter((item) => {
            if (seen.has(item)) return false
            seen.add(item)
            return true
        })
}

export function normalizeIdMap(value: unknown): Record<string, string[]> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    const normalized: Record<string, string[]> = {}
    Object.entries(value as Record<string, unknown>).forEach(([key, rawIds]) => {
        normalized[String(key)] = normalizeStringArray(rawIds)
    })
    return normalized
}

export function resolveOrderedIds(membershipIds: string[], storedOrder: string[] = []): string[] {
    const membershipSet = new Set(membershipIds)
    const resolved: string[] = []
    const seen = new Set<string>()

    storedOrder.forEach((id) => {
        if (!membershipSet.has(id) || seen.has(id)) return
        seen.add(id)
        resolved.push(id)
    })

    membershipIds.forEach((id) => {
        if (seen.has(id)) return
        seen.add(id)
        resolved.push(id)
    })

    return resolved
}

export function applyHomeOrder(availableKeys: string[], storedOrder: string[]): string[] {
    const availableSet = new Set(availableKeys)
    const resolved: string[] = []
    const seen = new Set<string>()

    storedOrder.forEach((key) => {
        if (!availableSet.has(key) || seen.has(key)) return
        seen.add(key)
        resolved.push(key)
    })

    availableKeys.forEach((key) => {
        if (seen.has(key)) return
        seen.add(key)
        resolved.push(key)
    })

    return resolved
}

export function reorderKeys(keys: string[], sourceKey: string, targetKey: string): string[] {
    if (sourceKey === targetKey) return [...keys]
    const sourceIndex = keys.indexOf(sourceKey)
    const targetIndex = keys.indexOf(targetKey)
    if (sourceIndex === -1 || targetIndex === -1) return [...keys]

    const next = [...keys]
    const [moved] = next.splice(sourceIndex, 1)
    next.splice(targetIndex, 0, moved)
    return next
}

export function buildMigratedGroupState(
    legacyGroups: GroupItem[],
    legacyGroupBookMap: Record<string, string[]>,
    books: Pick<BookMeta, 'id'>[],
): {
    groups: GroupItem[]
    groupBookMap: Record<string, string[]>
    groupBookOrder: Record<string, string[]>
    homeOrder: string[]
} {
    const groupedBookIds = new Set<string>()
    Object.values(legacyGroupBookMap).forEach((bookIds) => {
        bookIds.forEach((bookId) => groupedBookIds.add(bookId))
    })

    const groupBookOrder = Object.fromEntries(
        Object.entries(legacyGroupBookMap).map(([groupId, bookIds]) => [groupId, [...bookIds]]),
    )

    return {
        groups: legacyGroups,
        groupBookMap: legacyGroupBookMap,
        groupBookOrder,
        homeOrder: [
            ...legacyGroups.map((group) => buildHomeOrderKey('group', group.id)),
            ...books.filter((book) => !groupedBookIds.has(book.id)).map((book) => buildHomeOrderKey('book', book.id)),
        ],
    }
}

export function sanitizeGroupState(
    groups: GroupItem[],
    groupBookMap: Record<string, string[]>,
    groupBookOrder: Record<string, string[]>,
    homeOrder: string[],
    books: Pick<BookMeta, 'id'>[],
): {
    groups: GroupItem[]
    groupBookMap: Record<string, string[]>
    groupBookOrder: Record<string, string[]>
    homeOrder: string[]
} {
    const validBookIds = new Set(books.map((book) => book.id))
    const sanitizedGroupBookMap: Record<string, string[]> = {}

    groups.forEach((group) => {
        const seen = new Set<string>()
        sanitizedGroupBookMap[group.id] = (groupBookMap[group.id] || []).filter((bookId) => {
            if (!validBookIds.has(bookId) || seen.has(bookId)) return false
            seen.add(bookId)
            return true
        })
    })

    const sanitizedGroupBookOrder: Record<string, string[]> = {}
    groups.forEach((group) => {
        sanitizedGroupBookOrder[group.id] = resolveOrderedIds(
            sanitizedGroupBookMap[group.id] || [],
            groupBookOrder[group.id] || [],
        )
    })

    const groupedBookIds = new Set<string>()
    Object.values(sanitizedGroupBookMap).forEach((bookIds) => {
        bookIds.forEach((bookId) => groupedBookIds.add(bookId))
    })

    const availableHomeKeys = [
        ...groups.map((group) => buildHomeOrderKey('group', group.id)),
        ...books.filter((book) => !groupedBookIds.has(book.id)).map((book) => buildHomeOrderKey('book', book.id)),
    ]

    return {
        groups,
        groupBookMap: sanitizedGroupBookMap,
        groupBookOrder: sanitizedGroupBookOrder,
        homeOrder: applyHomeOrder(availableHomeKeys, homeOrder),
    }
}

export function areGroupStatesEqual(
    left: ReturnType<typeof sanitizeGroupState>,
    right: ReturnType<typeof sanitizeGroupState>,
): boolean {
    const arrEq = (a: readonly string[], b: readonly string[]) => {
        if (a.length !== b.length) return false
        for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
        return true
    }
    const groupsEq = (a: readonly GroupItem[], b: readonly GroupItem[]) => {
        if (a.length !== b.length) return false
        for (let i = 0; i < a.length; i++) {
            if (a[i].id !== b[i].id || a[i].name !== b[i].name) return false
        }
        return true
    }
    const mapEq = (a: Record<string, string[]>, b: Record<string, string[]>) => {
        const ak = Object.keys(a), bk = Object.keys(b)
        if (ak.length !== bk.length) return false
        for (const k of ak) {
            if (!(k in b) || !arrEq(a[k] || [], b[k] || [])) return false
        }
        return true
    }
    return groupsEq(left.groups, right.groups) &&
        mapEq(left.groupBookMap, right.groupBookMap) &&
        mapEq(left.groupBookOrder, right.groupBookOrder) &&
        arrEq(left.homeOrder, right.homeOrder)
}
