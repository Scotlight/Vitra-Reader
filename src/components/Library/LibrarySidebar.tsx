import type { MouseEvent as ReactMouseEvent } from 'react'
import type { BookMeta } from '../../services/storageService'
import type { useGroupManager } from '../../hooks/useGroupManager'
import heartIcon from '../../assets/icons/heart.svg'
import noteIcon from '../../assets/icons/note.svg'
import highlightIcon from '../../assets/icons/highlight.svg'
import trashIcon from '../../assets/icons/trash.svg'
import gridIcon from '../../assets/icons/grid.svg'
import groupAddIcon from '../../assets/icons/shelf-add.svg'
import groupManageIcon from '../../assets/icons/shelf-manage.svg'
import settingsIcon from '../../assets/icons/settings.svg'
import libraryIcon from '../../assets/icons/library.svg'
import vitraLogo from '../../assets/icons/vitra-logo.svg'
import styles from './LibraryView.module.css'

type NavType = 'all' | 'fav' | 'notes' | 'highlight' | 'trash' | 'stats'

interface LibrarySidebarProps {
    activeNav: NavType
    setActiveNav: (nav: NavType) => void
    group: ReturnType<typeof useGroupManager>
    onOpenBook: (id: string) => void
    onContextMenu: (event: ReactMouseEvent<HTMLElement>, bookId: string) => void
    onToggleSettings: () => void
}

const Icon = ({ src, className }: { src: string; className?: string }) => (
    <img className={className} src={src} alt="" />
)

export const LibrarySidebar = ({
    activeNav,
    setActiveNav,
    group,
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
        openCreateGroupModal,
        openManageGroupModal,
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
                className={`${styles.navItem} ${activeNav === 'all' ? styles.active : ''}`}
                onClick={() => {
                    setActiveNav('all')
                    setActiveGroupId(null)
                }}
            >
                <Icon className={styles.navIcon} src={libraryIcon} />全部图书
            </button>
            <button className={`${styles.navItem} ${activeNav === 'fav' ? styles.active : ''}`} onClick={() => setActiveNav('fav')}><Icon className={styles.navIcon} src={heartIcon} />我的喜爱</button>
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
            <div className={styles.groupTitle}>我的分组</div>
            <button className={styles.navItem} onClick={openCreateGroupModal}><Icon className={styles.navIcon} src={groupAddIcon} />新建分组</button>
            <button className={styles.navItem} onClick={openManageGroupModal}><Icon className={styles.navIcon} src={groupManageIcon} />管理分组</button>
            <div className={styles.groupTree}>
                {groups.map((groupItem) => (
                    <div key={groupItem.id} className={styles.groupNode}>
                        <div className={`${styles.groupNodeRow} ${activeGroupId === groupItem.id ? styles.groupNodeRowActive : ''}`}>
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
            <button className={styles.navItemBottom} onClick={onToggleSettings}>
                <Icon className={styles.navIcon} src={settingsIcon} />设置
            </button>
        </aside>
    )
}
