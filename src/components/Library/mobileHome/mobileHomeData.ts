import type { BookMeta } from '@/services/storageService'

/**
 * 首页数据派生 —— 纯函数，无 IO、无 React
 *
 * 抽出来的理由：首页那两块（继续阅读 / 最近添加）的选书规则有前提假设，
 * 内联在组件里下次改 JSX 时很容易被顺手改坏。放这里 + 单测锁住。
 */

/** progressMap 的量纲是 0~100 整数（`libraryMetaRepository` 存入时已做 `Math.round(percentage * 100)`） */
export type LibraryProgressMap = Record<string, number>

export interface ContinueReadingPick {
    readonly book: BookMeta
    /** 0~100，与 progressMap 同量纲 */
    readonly progress: number
}

/** progress 落在这个开区间内才算"在读"——0 是没开过，100 是读完了，两头都不该占据首页那张卡 */
function isInProgress(progress: number): boolean {
    return progress > 0 && progress < 100
}

/**
 * 首页「继续阅读」选书。
 *
 * 优先级：在读的书里 `lastReadAt` 最新的一本 → 没有在读的书时退回最近添加的一本。
 *
 * why 这个顺序：这张卡的职责是"一键回到刚才"，所以在读优先、且按最后阅读时间而非
 * 添加时间排。已读完的书再推给用户是噪音，故 100% 的书不参与第一轮竞争。
 * 但全新书库也不该露一张空卡，所以用最近添加兜底——此时 progress 取其真实值（通常 0），
 * 卡片上的进度条自然显示为空，不需要调用方特判。
 *
 * `lastReadAt` 允许缺失（老数据 / 从未打开过），缺失按 0 处理，排序时自然沉底。
 */
export function pickContinueReading(
    books: readonly BookMeta[],
    progressMap: LibraryProgressMap,
    excludedBookIds: ReadonlySet<string>,
): ContinueReadingPick | null {
    const candidates = books.filter((book) => !excludedBookIds.has(book.id))
    if (candidates.length === 0) return null

    const reading = candidates.filter((book) => isInProgress(progressMap[book.id] ?? 0))
    // 有在读的书就按 lastReadAt 挑，否则整池按 addedAt 挑——两条路的排序键不同，不能合并
    const pool = reading.length > 0 ? reading : candidates
    const rank = reading.length > 0
        ? (book: BookMeta) => book.lastReadAt ?? 0
        : (book: BookMeta) => book.addedAt ?? 0

    const picked = pool.reduce((best, book) => (rank(book) > rank(best) ? book : best))
    return { book: picked, progress: progressMap[picked.id] ?? 0 }
}

/**
 * 首页「最近添加」网格取书。按 `addedAt` 倒序取前 limit 本。
 *
 * why 不复用 `useLibraryStore.books` 的天然顺序：那份是 `orderBy('lastReadAt')`
 * （见 useLibraryStore.loadBooks），语义是"最近读的"。首页这一栏是"新入库的"，
 * 两块内容同源会导致首页上下两处显示同一批书。
 */
export function pickRecentlyAdded(
    books: readonly BookMeta[],
    excludedBookIds: ReadonlySet<string>,
    limit: number,
): readonly BookMeta[] {
    if (limit <= 0) return []
    return books
        .filter((book) => !excludedBookIds.has(book.id))
        .slice()
        .sort((left, right) => (right.addedAt ?? 0) - (left.addedAt ?? 0))
        .slice(0, limit)
}
