import { useMemo, useState } from 'react'
import type { Bookmark, Highlight } from '@/services/storageService'
import type { AnnotationGroup } from '../AnnotationList'
import styles from './MobileNotesView.module.css'

/**
 * 移动端笔记页（设计原型 1a Phase 4）
 *
 * 笔记/高亮两 tab 的选中态是本组件内部 useState，不上提到 LibraryView
 * ——避免给 4 态导航网加维度（chrome 只知道"现在是 notes tab"）。
 * 跳转协议照抄桌面 AnnotationList 的既有约定：高亮 {location: cfiRange, searchText: text}，
 * 笔记 {location, searchText: title}，不发明新协议。
 */

type NotesTab = 'notes' | 'highlight'

interface MobileNotesViewProps {
    readonly groupedHighlights: ReadonlyArray<AnnotationGroup<Highlight>>
    readonly groupedBookmarks: ReadonlyArray<AnnotationGroup<Bookmark>>
    readonly onOpenBook: (id: string, jump?: { location: string; searchText?: string }) => void
}

interface NoteCardItem {
    readonly key: string
    readonly bookId: string
    readonly bookTitle: string
    /** 引文主体：高亮是选中文本，笔记是选中时的引文（Bookmark.title） */
    readonly quote: string
    /** 仅笔记有：用户写的笔记正文 */
    readonly note: string | null
    /** 左色边：高亮保留用户标注时选的原色（覆盖成 accent 是信息丢失），笔记走 accent */
    readonly edgeColor: string | null
    readonly createdAt: number
    readonly jump: { location: string; searchText?: string }
}

/** 卡片流是跨书的时间线，扁平后统一按创建时间降序（分组视图是桌面 AnnotationList 的语义） */
function flattenCards(
    tab: NotesTab,
    groupedHighlights: ReadonlyArray<AnnotationGroup<Highlight>>,
    groupedBookmarks: ReadonlyArray<AnnotationGroup<Bookmark>>,
): NoteCardItem[] {
    const cards: NoteCardItem[] = []
    if (tab === 'highlight') {
        groupedHighlights.forEach((group) => {
            group.items.forEach((h) => {
                cards.push({
                    key: h.id,
                    bookId: group.bookId,
                    bookTitle: group.bookTitle,
                    quote: h.text,
                    note: null,
                    edgeColor: h.color || null,
                    createdAt: h.createdAt,
                    jump: { location: h.cfiRange, searchText: h.text },
                })
            })
        })
    } else {
        groupedBookmarks.forEach((group) => {
            group.items.forEach((b) => {
                cards.push({
                    key: b.id,
                    bookId: group.bookId,
                    bookTitle: group.bookTitle,
                    quote: b.title,
                    note: b.note || null,
                    edgeColor: null,
                    createdAt: b.createdAt,
                    jump: { location: b.location, searchText: b.title },
                })
            })
        })
    }
    return cards.sort((left, right) => right.createdAt - left.createdAt)
}

export function MobileNotesView({
    groupedHighlights,
    groupedBookmarks,
    onOpenBook,
}: MobileNotesViewProps) {
    const [tab, setTab] = useState<NotesTab>('notes')

    const cards = useMemo(
        () => flattenCards(tab, groupedHighlights, groupedBookmarks),
        [tab, groupedHighlights, groupedBookmarks],
    )

    return (
        <div className={styles.notes} data-mobile-notes="true">
            <nav className={styles.tabs} aria-label="笔记类型">
                <button
                    type="button"
                    className={tab === 'notes' ? styles.tabActive : styles.tab}
                    onClick={() => setTab('notes')}
                    aria-current={tab === 'notes' ? 'true' : undefined}
                >
                    笔记
                </button>
                <button
                    type="button"
                    className={tab === 'highlight' ? styles.tabActive : styles.tab}
                    onClick={() => setTab('highlight')}
                    aria-current={tab === 'highlight' ? 'true' : undefined}
                >
                    高亮
                </button>
            </nav>

            {cards.length === 0 ? (
                <p className={styles.empty}>
                    {tab === 'notes' ? '还没有笔记——阅读时长按文字试试' : '还没有高亮——阅读时长按文字试试'}
                </p>
            ) : (
                <div className={styles.cardList}>
                    {cards.map((card, index) => {
                        const created = new Date(card.createdAt)
                        return (
                            <button
                                key={card.key}
                                type="button"
                                className={styles.card}
                                style={
                                    {
                                        '--card-index': Math.min(index, 12),
                                        '--edge-color': card.edgeColor ?? undefined,
                                    } as React.CSSProperties
                                }
                                onClick={() => onOpenBook(card.bookId, card.jump)}
                            >
                                <span className={styles.cardBody}>
                                    <span className={styles.quote}>{card.quote}</span>
                                    {card.note && <span className={styles.noteBody}>{card.note}</span>}
                                    <span className={styles.source}>{card.bookTitle}</span>
                                </span>
                                <span className={styles.dateCol}>
                                    <span className={styles.dateMonth}>{created.getMonth() + 1}月</span>
                                    <span className={styles.dateDay}>{created.getDate()}</span>
                                </span>
                            </button>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
