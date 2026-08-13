import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { Bookmark, Highlight } from '@/services/storageService'
import type { AnnotationGroup } from '@/components/Library/AnnotationList'
import { MobileNotesView } from '@/components/Library/mobileNotes/MobileNotesView'

describe('MobileNotesView', () => {
    afterEach(() => {
        cleanup()
    })

    const groupedHighlights: AnnotationGroup<Highlight>[] = [
        {
            bookId: 'book-a',
            bookTitle: '书 A',
            items: [
                {
                    id: 'h1',
                    bookId: 'book-a',
                    cfiRange: 'epubcfi(/6/4!/4/2)',
                    color: '#ffd54f',
                    text: '高亮引文内容',
                    createdAt: new Date(2026, 7, 10).getTime(),
                },
            ],
        },
    ]

    const groupedBookmarks: AnnotationGroup<Bookmark>[] = [
        {
            bookId: 'book-b',
            bookTitle: '书 B',
            items: [
                {
                    id: 'b1',
                    bookId: 'book-b',
                    location: 'epubcfi(/6/8!/4/6)',
                    title: '笔记引文',
                    note: '我的想法',
                    createdAt: new Date(2026, 7, 12).getTime(),
                },
            ],
        },
    ]

    it('默认显示笔记 tab 的卡片', () => {
        render(
            <MobileNotesView
                groupedHighlights={groupedHighlights}
                groupedBookmarks={groupedBookmarks}
                onOpenBook={vi.fn()}
            />,
        )
        expect(screen.getByText('笔记引文')).toBeTruthy()
        expect(screen.getByText('我的想法')).toBeTruthy()
        expect(screen.queryByText('高亮引文内容')).toBeNull()
    })

    it('切到高亮 tab 显示高亮卡片', () => {
        render(
            <MobileNotesView
                groupedHighlights={groupedHighlights}
                groupedBookmarks={groupedBookmarks}
                onOpenBook={vi.fn()}
            />,
        )
        fireEvent.click(screen.getByRole('button', { name: '高亮' }))
        expect(screen.getByText('高亮引文内容')).toBeTruthy()
        expect(screen.queryByText('笔记引文')).toBeNull()
    })

    it('点击笔记卡片按既有协议回调（location + searchText=引文）', () => {
        const onOpenBook = vi.fn()
        render(
            <MobileNotesView
                groupedHighlights={groupedHighlights}
                groupedBookmarks={groupedBookmarks}
                onOpenBook={onOpenBook}
            />,
        )
        fireEvent.click(screen.getByText('笔记引文'))
        expect(onOpenBook).toHaveBeenCalledWith('book-b', {
            location: 'epubcfi(/6/8!/4/6)',
            searchText: '笔记引文',
        })
    })

    it('点击高亮卡片传 cfiRange 与选中文本', () => {
        const onOpenBook = vi.fn()
        render(
            <MobileNotesView
                groupedHighlights={groupedHighlights}
                groupedBookmarks={groupedBookmarks}
                onOpenBook={onOpenBook}
            />,
        )
        fireEvent.click(screen.getByRole('button', { name: '高亮' }))
        fireEvent.click(screen.getByText('高亮引文内容'))
        expect(onOpenBook).toHaveBeenCalledWith('book-a', {
            location: 'epubcfi(/6/4!/4/2)',
            searchText: '高亮引文内容',
        })
    })

    it('两 tab 各自的空态文案', () => {
        render(<MobileNotesView groupedHighlights={[]} groupedBookmarks={[]} onOpenBook={vi.fn()} />)
        expect(screen.getByText('还没有笔记——阅读时长按文字试试')).toBeTruthy()
        fireEvent.click(screen.getByRole('button', { name: '高亮' }))
        expect(screen.getByText('还没有高亮——阅读时长按文字试试')).toBeTruthy()
    })

    it('卡片流跨书按 createdAt 降序（同 tab 内多书扁平）', () => {
        const secondBookmarkGroup: AnnotationGroup<Bookmark>[] = [
            ...groupedBookmarks,
            {
                bookId: 'book-c',
                bookTitle: '书 C',
                items: [
                    {
                        id: 'b2',
                        bookId: 'book-c',
                        location: 'loc-c',
                        title: '更新的笔记',
                        note: '',
                        createdAt: new Date(2026, 7, 13).getTime(),
                    },
                ],
            },
        ]
        render(
            <MobileNotesView
                groupedHighlights={[]}
                groupedBookmarks={secondBookmarkGroup}
                onOpenBook={vi.fn()}
            />,
        )
        const quotes = screen.getAllByText(/笔记/, { selector: 'span' }).map((el) => el.textContent)
        expect(quotes.indexOf('更新的笔记')).toBeLessThan(quotes.indexOf('笔记引文'))
    })
})
