import { db, type BookMeta } from '../services/storageService'
import {
    GROUPS_SETTINGS_KEY,
    GROUP_BOOK_MAP_SETTINGS_KEY,
    GROUP_BOOK_ORDER_SETTINGS_KEY,
    HOME_ORDER_SETTINGS_KEY,
    LEGACY_SHELVES_SETTINGS_KEY,
    LEGACY_SHELF_BOOK_MAP_SETTINGS_KEY,
    LEGACY_GROUPS_KEY,
    LEGACY_GROUP_BOOK_MAP_KEY,
    LEGACY_GROUP_BOOK_ORDER_KEY,
    LEGACY_HOME_ORDER_KEY,
    buildMigratedGroupState,
    normalizeGroupItems,
    normalizeIdMap,
    normalizeStringArray,
    type GroupItem,
} from './groupManagerState'

export interface GroupStateSnapshot {
    groups: GroupItem[]
    groupBookMap: Record<string, string[]>
    groupBookOrder: Record<string, string[]>
    homeOrder: string[]
}

export interface LoadedGroupStateSnapshot extends GroupStateSnapshot {
    hasNewState: boolean
}

export async function loadGroupState(books: BookMeta[]): Promise<LoadedGroupStateSnapshot> {
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

    // 迁移旧键（无前缀 → groups: 前缀）
    if (!groupsEntry && !groupBookMapEntry && !groupBookOrderEntry && !homeOrderEntry) {
        const [oldGroups, oldMap, oldOrder, oldHome] = await Promise.all([
            db.settings.get(LEGACY_GROUPS_KEY),
            db.settings.get(LEGACY_GROUP_BOOK_MAP_KEY),
            db.settings.get(LEGACY_GROUP_BOOK_ORDER_KEY),
            db.settings.get(LEGACY_HOME_ORDER_KEY),
        ])
        const migrations: Promise<unknown>[] = []
        if (oldGroups) {
            migrations.push(
                db.settings.put({ key: GROUPS_SETTINGS_KEY, value: oldGroups.value }),
                db.settings.delete(LEGACY_GROUPS_KEY),
            )
        }
        if (oldMap) {
            migrations.push(
                db.settings.put({ key: GROUP_BOOK_MAP_SETTINGS_KEY, value: oldMap.value }),
                db.settings.delete(LEGACY_GROUP_BOOK_MAP_KEY),
            )
        }
        if (oldOrder) {
            migrations.push(
                db.settings.put({ key: GROUP_BOOK_ORDER_SETTINGS_KEY, value: oldOrder.value }),
                db.settings.delete(LEGACY_GROUP_BOOK_ORDER_KEY),
            )
        }
        if (oldHome) {
            migrations.push(
                db.settings.put({ key: HOME_ORDER_SETTINGS_KEY, value: oldHome.value }),
                db.settings.delete(LEGACY_HOME_ORDER_KEY),
            )
        }
        if (migrations.length > 0) await Promise.all(migrations)
        // 用迁移后的值继续
        const hasNewState = Boolean(oldGroups || oldMap || oldOrder || oldHome)
        const state = hasNewState
            ? {
                groups: normalizeGroupItems(oldGroups?.value),
                groupBookMap: normalizeIdMap(oldMap?.value),
                groupBookOrder: normalizeIdMap(oldOrder?.value),
                homeOrder: normalizeStringArray(oldHome?.value),
            }
            : buildMigratedGroupState(
                normalizeGroupItems(legacyGroupsEntry?.value),
                normalizeIdMap(legacyGroupBookMapEntry?.value),
                books,
            )
        return { ...state, hasNewState }
    }

    const hasNewState = Boolean(groupsEntry || groupBookMapEntry || groupBookOrderEntry || homeOrderEntry)
    const state = hasNewState
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

    return { ...state, hasNewState }
}

export async function saveGroupState(state: GroupStateSnapshot): Promise<void> {
    await Promise.all([
        db.settings.put({ key: GROUPS_SETTINGS_KEY, value: state.groups }),
        db.settings.put({ key: GROUP_BOOK_MAP_SETTINGS_KEY, value: state.groupBookMap }),
        db.settings.put({ key: GROUP_BOOK_ORDER_SETTINGS_KEY, value: state.groupBookOrder }),
        db.settings.put({ key: HOME_ORDER_SETTINGS_KEY, value: state.homeOrder }),
    ])
}

export async function saveGroupOrderingState(state: Pick<GroupStateSnapshot, 'groupBookMap' | 'groupBookOrder' | 'homeOrder'>): Promise<void> {
    await Promise.all([
        db.settings.put({ key: GROUP_BOOK_MAP_SETTINGS_KEY, value: state.groupBookMap }),
        db.settings.put({ key: GROUP_BOOK_ORDER_SETTINGS_KEY, value: state.groupBookOrder }),
        db.settings.put({ key: HOME_ORDER_SETTINGS_KEY, value: state.homeOrder }),
    ])
}
