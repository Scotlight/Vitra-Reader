import type { BookMeta } from '@/services/storageService'

/**
 * 移动端书架列表数据派生 —— 纯函数，无 IO、无 React
 *
 * why 不复用 useLibraryDerivedData.filteredBooks：
 * 那份在 showMixedHome 时返回混合了分组卡片的 homeItems（不是纯书籍）；
 * 且 chips 的"分组/未读"维度与 LibraryActiveNav 语义正交，硬套会污染 5 处共用的派生链。
 * 参考首页（mobileHomeData）已验证成功的模式：自建窄派生，不碰公共链。
 */

/** progressMap 的量纲是 0~100 整数（libraryMetaRepository 存入时已做 Math.round(percentage * 100)） */
export type LibraryProgressMap = Record<string, number>

export type ShelfChip =
    | { kind: 'all' }
    | { kind: 'fav' }
    | { kind: 'unread' }
    | { kind: 'trash' }
    | { kind: 'group'; groupId: string; name: string }

/**
 * 构造书架 chips 数组。
 * 返回 [全部, ...真实分组按原顺序, 收藏, 未读, 回收站]。
 * 回收站放最后：语义上是"垃圾桶"不是常用筛选，不该挤在分组前面。
 */
export function buildShelfChips(
    groups: ReadonlyArray<{ id: string; name: string }>,
): readonly ShelfChip[] {
    const chips: ShelfChip[] = [{ kind: 'all' }]
    groups.forEach((g) => {
        chips.push({ kind: 'group', groupId: g.id, name: g.name })
    })
    chips.push({ kind: 'fav' }, { kind: 'unread' }, { kind: 'trash' })
    return chips
}

/**
 * 按 chip 过滤书架列表。
 *
 * - all: 全部非回收站，按 lastReadAt 降序（缺失沉底）
 * - fav: 收藏 ∩ 非回收站（进回收站的收藏书隐藏，恢复后重新出现），按 lastReadAt 降序
 * - unread: progress === 0 或 undefined（新书 progressMap 里没键）
 * - trash: 唯一显示回收站内书籍的 chip，按 lastReadAt 降序
 * - group: groupBookMap[groupId] 内的书，保持分组内已有顺序（用户拖拽排过）
 *
 * why groupBookMap 参数而不是 GroupCollection.books：
 * GroupCollection.books 是 useGroupDerivedData 派生的完整对象，依赖它会让纯函数测试
 * 必须构造整个 group 派生链。传窄的 Record<string, string[]> + books，测试只需拼字面量。
 */
export function filterShelfBooks(
    books: readonly BookMeta[],
    chip: ShelfChip,
    progressMap: LibraryProgressMap,
    trashBookIdSet: ReadonlySet<string>,
    groupBookMap: Record<string, string[]>,
    favoriteBookIdSet: ReadonlySet<string>,
): readonly BookMeta[] {
    const byLastRead = (list: readonly BookMeta[]) =>
        list.slice().sort((a, b) => (b.lastReadAt ?? 0) - (a.lastReadAt ?? 0))

    if (chip.kind === 'trash') {
        return byLastRead(books.filter((book) => trashBookIdSet.has(book.id)))
    }

    const nonTrash = books.filter((book) => !trashBookIdSet.has(book.id))

    if (chip.kind === 'all') {
        return byLastRead(nonTrash)
    }

    if (chip.kind === 'fav') {
        return byLastRead(nonTrash.filter((book) => favoriteBookIdSet.has(book.id)))
    }

    if (chip.kind === 'unread') {
        return byLastRead(nonTrash.filter((book) => (progressMap[book.id] ?? 0) === 0))
    }

    // group: 保持 groupBookMap 内的顺序，不重排
    const groupBookIds = groupBookMap[chip.groupId] ?? []
    const bookMap = new Map(nonTrash.map((book) => [book.id, book]))
    return groupBookIds.map((id) => bookMap.get(id)).filter((book): book is BookMeta => book !== undefined)
}
