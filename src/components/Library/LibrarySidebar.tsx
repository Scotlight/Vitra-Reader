import type { MouseEvent as ReactMouseEvent } from 'react'
import type { BookMeta } from '../../services/storageService'
import type { useShelfManager } from '../../hooks/useShelfManager'
import heartIcon from '../../assets/icons/heart.svg'
import noteIcon from '../../assets/icons/note.svg'
import highlightIcon from '../../assets/icons/highlight.svg'
import trashIcon from '../../assets/icons/trash.svg'
import shelfAddIcon from '../../assets/icons/shelf-add.svg'
import shelfManageIcon from '../../assets/icons/shelf-manage.svg'
import settingsIcon from '../../assets/icons/settings.svg'
import libraryIcon from '../../assets/icons/library.svg'
import vitraLogo from '../../assets/icons/vitra-logo.svg'
import styles from './LibraryView.module.css'

type NavType = 'all' | 'fav' | 'notes' | 'highlight' | 'trash'

interface LibrarySidebarProps {
    activeNav: NavType
    setActiveNav: (nav: NavType) => void
    shelf: ReturnType<typeof useShelfManager>
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
    shelf,
    onOpenBook,
    onContextMenu,
    onToggleSettings,
}: LibrarySidebarProps) => {
    const {
        shelves,
        shelfBookMap,
        activeShelfId,
        setActiveShelfId,
        expandedShelves,
        toggleShelfExpanded,
        openCreateShelfModal,
        openManageShelfModal,
        bookById,
    } = shelf

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
                    setActiveShelfId(null)
                }}
            >
                <Icon className={styles.navIcon} src={libraryIcon} />全部图书
            </button>
            <button className={`${styles.navItem} ${activeNav === 'fav' ? styles.active : ''}`} onClick={() => setActiveNav('fav')}><Icon className={styles.navIcon} src={heartIcon} />我的喜爱</button>
            <button className={`${styles.navItem} ${activeNav === 'notes' ? styles.active : ''}`} onClick={() => setActiveNav('notes')}><Icon className={styles.navIcon} src={noteIcon} />我的笔记</button>
            <button className={`${styles.navItem} ${activeNav === 'highlight' ? styles.active : ''}`} onClick={() => setActiveNav('highlight')}><Icon className={styles.navIcon} src={highlightIcon} />我的高亮</button>
            <button className={`${styles.navItem} ${activeNav === 'trash' ? styles.active : ''}`} onClick={() => setActiveNav('trash')}><Icon className={styles.navIcon} src={trashIcon} />我的回收</button>
            <div className={styles.shelfTitle}>我的书架</div>
            <button className={styles.navItem} onClick={openCreateShelfModal}><Icon className={styles.navIcon} src={shelfAddIcon} />新建书架</button>
            <button className={styles.navItem} onClick={openManageShelfModal}><Icon className={styles.navIcon} src={shelfManageIcon} />管理书架</button>
            <div className={styles.shelfTree}>
                {shelves.map((shelfItem) => (
                    <div key={shelfItem.id} className={styles.shelfNode}>
                        <div className={`${styles.shelfNodeRow} ${activeShelfId === shelfItem.id ? styles.shelfNodeRowActive : ''}`}>
                            <button
                                className={styles.shelfExpandBtn}
                                onClick={() => toggleShelfExpanded(shelfItem.id)}
                                title={expandedShelves[shelfItem.id] ? '收起' : '展开'}
                            >
                                {expandedShelves[shelfItem.id] ? '▾' : '▸'}
                            </button>
                            <button
                                className={styles.shelfItem}
                                onClick={() => {
                                    setActiveShelfId(shelfItem.id)
                                    setActiveNav('all')
                                }}
                                title={shelfItem.name}
                            >
                                {shelfItem.name}
                            </button>
                        </div>
                        {expandedShelves[shelfItem.id] && (
                            <div className={styles.shelfChildren}>
                                {((shelfBookMap[shelfItem.id] || [])
                                    .map((bookId) => bookById.get(bookId))
                                    .filter((book): book is NonNullable<typeof book> => Boolean(book))
                                ).length === 0 ? (
                                    <div className={styles.shelfChildEmpty}>空书架</div>
                                ) : (
                                    (shelfBookMap[shelfItem.id] || [])
                                        .map((bookId) => bookById.get(bookId))
                                        .filter((book): book is BookMeta => Boolean(book))
                                        .map((book) => (
                                            <button
                                                key={book.id}
                                                className={styles.shelfChildBook}
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
