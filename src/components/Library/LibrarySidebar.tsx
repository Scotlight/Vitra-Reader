import type { MouseEvent as ReactMouseEvent } from 'react'
import type { BookMeta } from '@/services/storageService'
import {
    BOOK_SHELF_LABEL,
    BOOK_SHELF_LABEL_DISPLAY,
    BOOK_SHELF_LABEL_VALUES,
} from '@/services/storageService'
import type { useGroupManager } from '@/hooks/useGroupManager'
import type { LibraryActiveNav, ShelfLabelCounts } from './libraryView/useLibraryDerivedData'
import noteIcon from '@/assets/icons/note.svg'
import highlightIcon from '@/assets/icons/highlight.svg'
import trashIcon from '@/assets/icons/trash.svg'
import gridIcon from '@/assets/icons/grid.svg'
import settingsIcon from '@/assets/icons/settings.svg'
import libraryIcon from '@/assets/icons/library.svg'
import vitraLogo from '@/assets/icons/vitra-logo.svg'
import styles from './LibraryView.module.css'

interface LibrarySidebarProps {
    activeNav: LibraryActiveNav
    isSettingsOpen: boolean
    setActiveNav: (nav: LibraryActiveNav) => void
    group: ReturnType<typeof useGroupManager>
    totalBookCount: number
    shelfLabelCounts: ShelfLabelCounts
    onOpenBook: (id: string) => void
    onContextMenu: (event: ReactMouseEvent<HTMLElement>, bookId: string) => void
    onToggleSettings: () => void
}

const Icon = ({ src, className }: { src: string; className?: string }) => (
    <img className={className} src={src} alt="" />
)

export const LibrarySidebar = ({
    activeNav,
    isSettingsOpen,
    setActiveNav,
    group,
    totalBookCount,
    shelfLabelCounts,
    onOpenBook,
    onContextMenu,
    onToggleSettings,
}: LibrarySidebarProps) => {
    const {
        groups,
        activeGroupId,
        setActiveGroupId,
        expandedGroups,
        toggleGroupExpanded,
        bookById,
        orderedGroupBookIdsByGroup,
    } = group

    return (
        <aside className={styles.sidebar}>
            <div className={styles.brand}>
                <img className={styles.brandLogo} src={vitraLogo} alt="Vitra Reader" />
                <span className={styles.brandText}>Vitra</span>
            </div>
            <button
                className={`${styles.navItem} ${activeNav === 'all' && !activeGroupId ? styles.active : ''}`}
                onClick={() => {
                    setActiveNav('all')
                    setActiveGroupId(null)
                }}
            >
                <Icon className={styles.navIcon} src={libraryIcon} />
                <span className={styles.navItemLabel}>全部图书</span>
                <span className={styles.navItemCount}>{totalBookCount}</span>
            </button>

            {/* 固定标签筛选：与自定义分组视觉分区，数量来自非回收书库。 */}
            <div className={styles.shelfLabelNav}>
                {BOOK_SHELF_LABEL_VALUES.map((label) => (
                    <button
                        key={label}
                        className={`${styles.navItem} ${styles.shelfLabelNavItem} ${activeNav === label ? styles.active : ''}`}
                        data-shelf-label={label}
                        onClick={() => {
                            setActiveNav(label)
                            setActiveGroupId(null)
                        }}
                    >
                        <span className={`${styles.shelfLabelDot} ${styles[`shelfLabelDot_${label}`]}`} aria-hidden="true" />
                        <span className={styles.navItemLabel}>{BOOK_SHELF_LABEL_DISPLAY[label]}</span>
                        <span className={styles.navItemCount}>{shelfLabelCounts[label]}</span>
                    </button>
                ))}
            </div>

            {groups.length > 0 && (
                <div className={styles.groupTree}>
                    {groups.map((groupItem) => (
                        <div key={groupItem.id} className={styles.groupNode}>
                            <div className={`${styles.groupNodeRow} ${activeNav === 'all' && activeGroupId === groupItem.id ? styles.groupNodeRowActive : ''}`}>
                                <button
                                    className={styles.groupExpandBtn}
                                    onClick={() => toggleGroupExpanded(groupItem.id)}
                                    title={expandedGroups[groupItem.id] ? '收起' : '展开'}
                                >
                                    {expandedGroups[groupItem.id] ? '▾' : '▸'}
                                </button>
                                <button
                                    className={styles.groupItem}
                                    onClick={() => {
                                        setActiveGroupId(groupItem.id)
                                        setActiveNav('all')
                                    }}
                                    title={groupItem.name}
                                >
                                    {groupItem.name}
                                </button>
                            </div>
                            {expandedGroups[groupItem.id] && (
                                <div className={styles.groupChildren}>
                                    {((orderedGroupBookIdsByGroup[groupItem.id] || [])
                                        .map((bookId) => bookById.get(bookId))
                                        .filter((book): book is NonNullable<typeof book> => Boolean(book))
                                    ).length === 0 ? (
                                        <div className={styles.groupChildEmpty}>空分组</div>
                                    ) : (
                                        (orderedGroupBookIdsByGroup[groupItem.id] || [])
                                            .map((bookId) => bookById.get(bookId))
                                            .filter((book): book is BookMeta => Boolean(book))
                                            .map((book) => (
                                                <button
                                                    key={book.id}
                                                    className={styles.groupChildBook}
                                                    title={book.title}
                                                    onClick={() => onOpenBook(book.id)}
                                                    onContextMenu={(event) => onContextMenu(event, book.id)}
                                                >
                                                    {book.title}
                                                </button>
                                            ))
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
            <button className={`${styles.navItem} ${activeNav === 'notes' ? styles.active : ''}`} onClick={() => setActiveNav('notes')}><Icon className={styles.navIcon} src={noteIcon} />我的笔记</button>
            <button className={`${styles.navItem} ${activeNav === 'highlight' ? styles.active : ''}`} onClick={() => setActiveNav('highlight')}><Icon className={styles.navIcon} src={highlightIcon} />我的高亮</button>
            <button className={`${styles.navItem} ${activeNav === 'trash' ? styles.active : ''}`} onClick={() => setActiveNav('trash')}><Icon className={styles.navIcon} src={trashIcon} />我的回收</button>
            <button
                className={`${styles.navItem} ${activeNav === 'stats' ? styles.active : ''}`}
                onClick={() => {
                    setActiveNav('stats')
                    setActiveGroupId(null)
                }}
            >
                <Icon className={styles.navIcon} src={gridIcon} />阅读统计
            </button>
            <button className={`${styles.navItemBottom} ${isSettingsOpen ? styles.active : ''}`} onClick={onToggleSettings}>
                <Icon className={styles.navIcon} src={settingsIcon} />设置
            </button>
        </aside>
    )
}

// 保留常量导出，方便测试断言侧栏标签顺序与显示名一致。
export { BOOK_SHELF_LABEL, BOOK_SHELF_LABEL_DISPLAY }
