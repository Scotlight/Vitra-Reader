import { useMemo, useState } from 'react'
import type { BookMeta } from '@/services/storageService'
import { emitBookOpenFromCard } from '../bookOpenTransitionHelpers'
import { LazyCoverImage } from '../bookGrid/LazyCoverImage'
import {
    buildShelfChips,
    filterShelfBooks,
    type LibraryProgressMap,
    type ShelfChip,
} from './mobileShelfData'
import styles from './MobileShelfView.module.css'

/**
 * 移动端书架列表视图（设计原型 1a Phase 2）
 *
 * 顶部横向滚动 chips（全部 / 各分组 / 未读），下方书籍列表（44×60 封面 + 书名/作者 + 进度 meta）。
 * chip 选中态是本组件内部 useState，不上提到 LibraryView——避免给 4 态导航网加第 5 个维度。
 * 切走 tab 再回来重置为"全部"是可接受行为（iOS 系统应用同款）。
 */

interface MobileShelfViewProps {
    readonly books: readonly BookMeta[]
    readonly progressMap: LibraryProgressMap
    readonly trashBookIdSet: ReadonlySet<string>
    readonly groups: ReadonlyArray<{ id: string; name: string }>
    readonly groupBookMap: Record<string, string[]>
    readonly onOpenBook: (id: string) => void
}

export function MobileShelfView({
    books,
    progressMap,
    trashBookIdSet,
    groups,
    groupBookMap,
    onOpenBook,
}: MobileShelfViewProps) {
    const chips = useMemo(() => buildShelfChips(groups), [groups])
    // buildShelfChips 永远至少返回 [全部, 未读]，但 noUncheckedIndexedAccess 下 chips[0]
    // 类型上可能 undefined，用字面量兜底而不是 !，保持类型诚实
    const [activeChip, setActiveChip] = useState<ShelfChip>({ kind: 'all' })

    const filteredBooks = useMemo(
        () => filterShelfBooks(books, activeChip, progressMap, trashBookIdSet, groupBookMap),
        [books, activeChip, progressMap, trashBookIdSet, groupBookMap],
    )

    // 分组数据异步加载，chips 数组会从 [全部, 未读] 补成 [全部, ...分组, 未读]
    // 保证补位不打断已选中的 chip（按 kind+groupId 判断，不按 index）
    useMemo(() => {
        const stillExists = chips.some((chip) => {
            if (chip.kind !== activeChip.kind) return false
            if (chip.kind === 'group' && activeChip.kind === 'group') {
                return chip.groupId === activeChip.groupId
            }
            return true
        })
        if (!stillExists) setActiveChip({ kind: 'all' })
    }, [chips, activeChip])

    const getEmptyText = (): string => {
        if (books.length === 0) return '书库为空，请添加书籍'
        if (activeChip.kind === 'unread') return '所有书籍都已阅读'
        if (activeChip.kind === 'group') return `分组「${activeChip.name}」中没有书籍`
        return '没有书籍'
    }

    const isChipActive = (chip: ShelfChip): boolean => {
        if (chip.kind !== activeChip.kind) return false
        if (chip.kind === 'group' && activeChip.kind === 'group') {
            return chip.groupId === activeChip.groupId
        }
        return true
    }

    return (
        <div className={styles.shelf} data-mobile-shelf="true">
            <nav className={styles.chips} aria-label="书架筛选">
                {chips.map((chip) => {
                    const label =
                        chip.kind === 'all' ? '全部'
                        : chip.kind === 'unread' ? '未读'
                        : chip.name
                    const key =
                        chip.kind === 'group' ? `group-${chip.groupId}` : chip.kind
                    return (
                        <button
                            key={key}
                            type="button"
                            className={isChipActive(chip) ? styles.chipActive : styles.chip}
                            onClick={() => setActiveChip(chip)}
                            aria-current={isChipActive(chip) ? 'true' : undefined}
                        >
                            {label}
                        </button>
                    )
                })}
            </nav>

            {filteredBooks.length === 0 ? (
                <p className={styles.empty}>{getEmptyText()}</p>
            ) : (
                <div className={styles.list}>
                    {filteredBooks.map((book, index) => {
                        const progress = progressMap[book.id] ?? 0
                        const progressText = progress > 0 ? `${progress}%` : '未读'
                        return (
                            <button
                                key={book.id}
                                type="button"
                                className={styles.row}
                                style={{ '--row-index': Math.min(index, 12) } as React.CSSProperties}
                                onClick={(event) => emitBookOpenFromCard(event, book.id, onOpenBook)}
                            >
                                <span className={styles.cover}>
                                    <LazyCoverImage
                                        bookId={book.id}
                                        format={book.format}
                                        alt=""
                                        compact
                                    />
                                </span>
                                <span className={styles.meta}>
                                    <span className={styles.title}>{book.title}</span>
                                    <span className={styles.author}>{book.author}</span>
                                </span>
                                <span className={styles.progress}>{progressText}</span>
                            </button>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
