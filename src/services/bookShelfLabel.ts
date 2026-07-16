// 固定书架标签：互斥单选，与自定义分组正交。
// 迁移/筛选/UI 文案都从这里读，避免各处散落字面量。

export const BOOK_SHELF_LABEL = {
    TO_READ: 'to_read',
    READING: 'reading',
    READ: 'read',
    GOOD: 'good',
} as const

export type BookShelfLabel = (typeof BOOK_SHELF_LABEL)[keyof typeof BOOK_SHELF_LABEL]

export const BOOK_SHELF_LABEL_VALUES: readonly BookShelfLabel[] = [
    BOOK_SHELF_LABEL.TO_READ,
    BOOK_SHELF_LABEL.READING,
    BOOK_SHELF_LABEL.READ,
    BOOK_SHELF_LABEL.GOOD,
]

export const BOOK_SHELF_LABEL_DISPLAY: Record<BookShelfLabel, string> = {
    [BOOK_SHELF_LABEL.TO_READ]: '待看',
    [BOOK_SHELF_LABEL.READING]: '在看',
    [BOOK_SHELF_LABEL.READ]: '已看',
    [BOOK_SHELF_LABEL.GOOD]: '好看',
}

/** 旧收藏 settings 键，迁移后保留一个发布周期供回滚，不主动删除。 */
export const LEGACY_FAVORITE_BOOK_IDS_KEY = 'library:favoriteBookIds'
export const LEGACY_FAVORITE_BOOK_IDS_LEGACY_KEY = 'favoriteBookIds'

export function isBookShelfLabel(value: unknown): value is BookShelfLabel {
    return typeof value === 'string' && (BOOK_SHELF_LABEL_VALUES as readonly string[]).includes(value)
}

/**
 * 按设计文档优先级推断标签：
 * 1. 已收藏 → good
 * 2. 进度 100% → read
 * 3. 进度 > 0 → reading
 * 4. 其余 → to_read
 */
export function resolveMigratedShelfLabel(options: {
    isFavorite: boolean
    percentage?: number | null
}): BookShelfLabel {
    if (options.isFavorite) return BOOK_SHELF_LABEL.GOOD
    const percentage = options.percentage ?? 0
    if (percentage >= 1) return BOOK_SHELF_LABEL.READ
    if (percentage > 0) return BOOK_SHELF_LABEL.READING
    return BOOK_SHELF_LABEL.TO_READ
}

export function normalizeShelfLabel(value: unknown, fallback: BookShelfLabel = BOOK_SHELF_LABEL.TO_READ): BookShelfLabel {
    return isBookShelfLabel(value) ? value : fallback
}
