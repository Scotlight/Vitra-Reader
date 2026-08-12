import { useMemo } from 'react'
import type { BookMeta } from '@/services/storageService'
import { emitBookOpenFromCard } from '../bookOpenTransitionHelpers'
import { LazyCoverImage } from '../bookGrid/LazyCoverImage'
import { pickContinueReading, pickRecentlyAdded, type LibraryProgressMap } from './mobileHomeData'
import styles from './MobileHomeView.module.css'

/**
 * 移动端首页（设计原型 1a）
 *
 * 三块：继续阅读卡 / 4 个圆形快捷入口 / "最近添加" 3 列网格。
 *
 * 与 BookGrid 的分工：首页不走 `gridItems`（那份带分组、虚拟滚动、拖拽排序），
 * 首页只是"精选摘要"，自己从 books 派生（见 mobileHomeData）。所以 `LibraryActiveNav`
 * 不需要新增 'home' 值，避免污染桌面端共用的派生链。
 */

/** 快捷入口语义。调用方负责映射到真实的 nav + 排序，本组件只管点了哪个 */
export type MobileHomeShortcut = 'search' | 'fav' | 'recentlyAdded' | 'recentlyRead' | 'trash'

interface MobileHomeViewProps {
    readonly books: readonly BookMeta[]
    readonly progressMap: LibraryProgressMap
    readonly trashBookIdSet: ReadonlySet<string>
    readonly onOpenBook: (id: string) => void
    readonly onShortcut: (shortcut: MobileHomeShortcut) => void
}

/** 最近添加只露一屏能扫完的量：3 列 × 2 行 */
const RECENTLY_ADDED_LIMIT = 6

interface ShortcutSpec {
    readonly key: Exclude<MobileHomeShortcut, 'search'>
    readonly label: string
    /** 原型给的色相，直接用 oklch 保持与设计稿一致 */
    readonly hue: string
}

const shortcuts: ReadonlyArray<ShortcutSpec> = [
    { key: 'fav', label: '收藏', hue: 'oklch(0.62 0.15 20)' },
    { key: 'recentlyAdded', label: '最近添加', hue: 'oklch(0.58 0.09 200)' },
    { key: 'recentlyRead', label: '最近阅读', hue: 'oklch(0.58 0.09 165)' },
    { key: 'trash', label: '回收站', hue: 'oklch(0.55 0.07 60)' },
]

export function MobileHomeView({
    books,
    progressMap,
    trashBookIdSet,
    onOpenBook,
    onShortcut,
}: MobileHomeViewProps) {
    const continueReading = useMemo(
        () => pickContinueReading(books, progressMap, trashBookIdSet),
        [books, progressMap, trashBookIdSet],
    )
    const recentlyAdded = useMemo(
        () => pickRecentlyAdded(books, trashBookIdSet, RECENTLY_ADDED_LIMIT),
        [books, trashBookIdSet],
    )

    return (
        <div className={styles.home} data-mobile-home="true">
            {continueReading && (
                <button
                    type="button"
                    className={styles.continueCard}
                    onClick={(event) => emitBookOpenFromCard(event, continueReading.book.id, onOpenBook)}
                >
                    <span className={styles.continueCover}>
                        <LazyCoverImage
                            bookId={continueReading.book.id}
                            format={continueReading.book.format}
                            alt=""
                            compact
                        />
                    </span>
                    <span className={styles.continueMeta}>
                        <span className={styles.continueTitle}>{continueReading.book.title}</span>
                        <span className={styles.continueAuthor}>{continueReading.book.author}</span>
                        <span className={styles.continueProgressLabel}>
                            阅读进度：{continueReading.progress}%
                        </span>
                        <span className={styles.continueTrack}>
                            <span
                                className={styles.continueFill}
                                style={{ width: `${continueReading.progress}%` }}
                            />
                        </span>
                    </span>
                </button>
            )}

            <nav className={styles.shortcuts} aria-label="书库快捷入口">
                {shortcuts.map(({ key, label, hue }) => (
                    <button
                        key={key}
                        type="button"
                        className={styles.shortcut}
                        onClick={() => onShortcut(key)}
                    >
                        <span className={styles.shortcutCircle} style={{ color: hue }}>
                            <ShortcutIcon name={key} />
                        </span>
                        <span className={styles.shortcutLabel}>{label}</span>
                    </button>
                ))}
            </nav>

            <h2 className={styles.sectionLabel}>最近添加</h2>
            {recentlyAdded.length === 0 ? (
                <p className={styles.empty}>书库还是空的 —— 用右上角「导入」添加第一本书</p>
            ) : (
                <div className={styles.recentGrid}>
                    {recentlyAdded.map((book) => (
                        <button
                            key={book.id}
                            type="button"
                            className={styles.recentCard}
                            onClick={(event) => emitBookOpenFromCard(event, book.id, onOpenBook)}
                        >
                            <span className={styles.recentCover}>
                                <LazyCoverImage bookId={book.id} format={book.format} alt="" compact />
                            </span>
                            <span className={styles.recentTitle}>{book.title}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    )
}

function ShortcutIcon({ name }: { readonly name: ShortcutSpec['key'] }) {
    // 内联 SVG 而不是 <img src=*.svg>：快捷入口要按 hue 逐个染色，
    // currentColor 是唯一能同时兼顾任意色相与深浅主题的做法（filter 那套只能做黑/白反转）
    const common = {
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.7,
        strokeLinecap: 'round' as const,
        strokeLinejoin: 'round' as const,
        'aria-hidden': true,
    }
    if (name === 'fav') {
        return (
            <svg {...common}>
                <path d="M12 20s-7-4.4-7-9.3A4 4 0 0 1 12 8a4 4 0 0 1 7 2.7c0 4.9-7 9.3-7 9.3Z" />
            </svg>
        )
    }
    if (name === 'recentlyAdded') {
        return (
            <svg {...common}>
                <circle cx="12" cy="12" r="8" />
                <path d="M12 8.5v7M8.5 12h7" />
            </svg>
        )
    }
    if (name === 'recentlyRead') {
        return (
            <svg {...common}>
                <path d="M5 16.5 10 11l3.5 3.5L19 8" />
                <path d="M19 12V8h-4" />
            </svg>
        )
    }
    return (
        <svg {...common}>
            <path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" />
        </svg>
    )
}
