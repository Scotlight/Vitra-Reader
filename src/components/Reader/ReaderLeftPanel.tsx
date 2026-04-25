import { AnimatePresence, motion } from 'framer-motion'
import type { RefObject } from 'react'
import type { Bookmark, Highlight } from '@/services/storageService'
import type { SearchResult, TocItem } from '@/engine/core/contentProvider'
import { isTocHrefActive } from './readerToc'
import styles from './ReaderView.module.css'

export type ReaderPanelTab = 'toc' | 'search' | 'annotations'

interface ReaderLeftPanelProps {
    readonly activeTab: ReaderPanelTab
    readonly bookmarks: readonly Bookmark[]
    readonly currentSectionHref: string
    readonly deleteBookmark: (id: string) => Promise<void>
    readonly deleteHighlight: (id: string) => Promise<void>
    readonly expandedNoteId: string | null
    readonly handleSearch: () => Promise<void>
    readonly handleTocClick: (href: string) => Promise<void>
    readonly highlights: readonly Highlight[]
    readonly isOpen: boolean
    readonly isSearching: boolean
    readonly jumpToAnnotation: (location: string, searchText?: string) => Promise<void>
    readonly onExpandedNoteChange: (noteId: string | null) => void
    readonly onSearchQueryChange: (value: string) => void
    readonly onTabChange: (tab: ReaderPanelTab) => void
    readonly searchQuery: string
    readonly searchResults: readonly SearchResult[]
    readonly toc: readonly TocItem[]
    readonly tocListRef: RefObject<HTMLDivElement>
}

export function ReaderLeftPanel({
    activeTab,
    bookmarks,
    currentSectionHref,
    deleteBookmark,
    deleteHighlight,
    expandedNoteId,
    handleSearch,
    handleTocClick,
    highlights,
    isOpen,
    isSearching,
    jumpToAnnotation,
    onExpandedNoteChange,
    onSearchQueryChange,
    onTabChange,
    searchQuery,
    searchResults,
    toc,
    tocListRef,
}: ReaderLeftPanelProps) {
    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    className={styles.panelLeft}
                    initial={{ x: -300, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: -300, opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                >
                    <div className={styles.tabContainer}>
                        <button className={`${styles.tabBtn} ${activeTab === 'toc' ? styles.activeTab : ''}`} onClick={() => onTabChange('toc')}>
                            目录
                        </button>
                        <button className={`${styles.tabBtn} ${activeTab === 'search' ? styles.activeTab : ''}`} onClick={() => onTabChange('search')}>
                            搜索
                        </button>
                        <button className={`${styles.tabBtn} ${activeTab === 'annotations' ? styles.activeTab : ''}`} onClick={() => onTabChange('annotations')}>
                            标注
                        </button>
                    </div>

                    {activeTab === 'toc' && (
                        <div ref={tocListRef} className={styles.tocList}>
                            {toc.length === 0 ? <p className={styles.emptyText}>无目录信息</p> : renderTocItems(toc, currentSectionHref, handleTocClick)}
                        </div>
                    )}

                    {activeTab === 'search' && (
                        <div className={styles.searchContainer}>
                            <div className={styles.searchBox}>
                                <input
                                    type="text"
                                    placeholder="输入关键词..."
                                    value={searchQuery}
                                    onChange={(event) => onSearchQueryChange(event.target.value)}
                                    onKeyDown={(event) => event.key === 'Enter' && void handleSearch()}
                                />
                                <button onClick={() => void handleSearch()} disabled={isSearching}>
                                    {isSearching ? '...' : 'Go'}
                                </button>
                            </div>
                            <div className={styles.resultList}>
                                {searchResults.map((result, index) => (
                                    <div
                                        key={`${result.cfi}-${index}`}
                                        className={styles.resultItem}
                                        onClick={() => void jumpToAnnotation(result.cfi, searchQuery.trim() || undefined)}
                                        role="button"
                                        tabIndex={0}
                                        onKeyDown={(event) => {
                                            if (event.key !== 'Enter' && event.key !== ' ') return
                                            event.preventDefault()
                                            void jumpToAnnotation(result.cfi, searchQuery.trim() || undefined)
                                        }}
                                    >
                                        <p className={styles.excerpt}>...{renderSearchExcerpt(result.excerpt, searchQuery)}...</p>
                                    </div>
                                ))}
                                {!isSearching && searchResults.length === 0 && searchQuery && (
                                    <p className={styles.emptyText}>未找到结果</p>
                                )}
                            </div>
                        </div>
                    )}

                    {activeTab === 'annotations' && (
                        <div className={styles.annotationsContainer}>
                            <div className={styles.annotationSection}>
                                <h4 className={styles.annotationSectionTitle}>高亮 ({highlights.length})</h4>
                                {highlights.length === 0 ? (
                                    <p className={styles.emptyText}>暂无高亮</p>
                                ) : (
                                    <div className={styles.annotationList}>
                                        {highlights.map((highlight) => (
                                            <div key={highlight.id} className={styles.annotationItem} onClick={() => void jumpToAnnotation(highlight.cfiRange, highlight.text)}>
                                                <div className={styles.highlightColor} style={{ backgroundColor: highlight.color }} />
                                                <div className={styles.annotationContent}>
                                                    <p className={styles.annotationText}>{highlight.text}</p>
                                                    <span className={styles.annotationTime}>{new Date(highlight.createdAt).toLocaleDateString()}</span>
                                                </div>
                                                <button
                                                    className={styles.deleteBtn}
                                                    onClick={(event) => {
                                                        event.stopPropagation()
                                                        void deleteHighlight(highlight.id)
                                                    }}
                                                    title="删除"
                                                >
                                                    ×
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className={styles.annotationSection}>
                                <h4 className={styles.annotationSectionTitle}>笔记 ({bookmarks.length})</h4>
                                {bookmarks.length === 0 ? (
                                    <p className={styles.emptyText}>暂无笔记</p>
                                ) : (
                                    <div className={styles.annotationList}>
                                        {bookmarks.map((bookmark) => (
                                            <div key={bookmark.id} className={styles.annotationItem} onClick={() => void jumpToAnnotation(bookmark.location, bookmark.title)}>
                                                <div className={styles.noteIcon}>📝</div>
                                                <div className={styles.annotationContent}>
                                                    <p className={styles.annotationQuote}>"{bookmark.title}"</p>
                                                    {bookmark.note && (
                                                        <p
                                                            className={`${styles.noteText} ${expandedNoteId === bookmark.id ? styles.expanded : ''}`}
                                                            onClick={(event) => {
                                                                event.stopPropagation()
                                                                onExpandedNoteChange(expandedNoteId === bookmark.id ? null : bookmark.id)
                                                            }}
                                                        >
                                                            {bookmark.note}
                                                        </p>
                                                    )}
                                                    <span className={styles.annotationTime}>{new Date(bookmark.createdAt).toLocaleDateString()}</span>
                                                </div>
                                                <button
                                                    className={styles.deleteBtn}
                                                    onClick={(event) => {
                                                        event.stopPropagation()
                                                        void deleteBookmark(bookmark.id)
                                                    }}
                                                    title="删除"
                                                >
                                                    ×
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </motion.div>
            )}
        </AnimatePresence>
    )
}

function renderTocItems(
    items: readonly TocItem[],
    currentSectionHref: string,
    handleTocClick: (href: string) => Promise<void>,
    level = 0,
): JSX.Element[] {
    return items.flatMap((item, index) => {
        const key = `${level}-${index}-${item.href}`
        const active = isTocHrefActive(item.href, currentSectionHref)
        const children = item.subitems ? renderTocItems(item.subitems, currentSectionHref, handleTocClick, level + 1) : []
        return [
            <button
                key={key}
                className={`${styles.tocItem} ${active ? styles.tocItemActive : ''}`}
                data-toc-active={active ? 'true' : 'false'}
                onClick={() => void handleTocClick(item.href)}
                style={{ paddingLeft: `${12 + level * 14}px` }}
            >
                <span className={styles.tocLabel} title={item.label}>{item.label}</span>
            </button>,
            ...children,
        ]
    })
}

function renderSearchExcerpt(excerpt: string, query: string) {
    const normalizedQuery = query.trim()
    if (!normalizedQuery) return excerpt
    const escaped = normalizedQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(`(${escaped})`, 'ig')
    return excerpt.split(regex).map((part, index) => {
        if (part.toLowerCase() === normalizedQuery.toLowerCase()) {
            return <mark key={`${part}-${index}`} className={styles.searchMark}>{part}</mark>
        }
        return <span key={`${part}-${index}`}>{part}</span>
    })
}
