import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, cleanup } from '@testing-library/react'
import type { Bookmark, Highlight } from '@/services/storageService'
import type { SearchResult, TocItem } from '@/engine/core/contentProvider'
import { ReaderPanelContent, type ReaderPanelContentProps } from '@/components/Reader/ReaderPanelContent'

const toc: TocItem[] = [
    { id: 'c1', href: 'ch1.xhtml', label: '第一章' },
    { id: 'c2', href: 'ch2.xhtml', label: '第二章' },
]
const searchResults: SearchResult[] = [{ cfi: 'cfi-1', excerpt: '命中片段' }]
const highlights: Highlight[] = [
    { id: 'h1', bookId: 'b', cfiRange: 'r1', color: '#ff0', text: '高亮文本', createdAt: 1 },
]
const bookmarks: Bookmark[] = [
    { id: 'm1', bookId: 'b', location: 'loc1', title: '笔记引用', note: '我的笔记', createdAt: 1 },
]

function makeProps(overrides: Partial<ReaderPanelContentProps> = {}): ReaderPanelContentProps {
    return {
        activeTab: 'toc',
        bookmarks,
        currentSectionHref: 'ch2.xhtml',
        deleteBookmark: vi.fn(async () => {}),
        deleteHighlight: vi.fn(async () => {}),
        expandedNoteId: null,
        handleSearch: vi.fn(async () => {}),
        handleTocClick: vi.fn(async () => {}),
        highlights,
        isSearching: false,
        jumpToAnnotation: vi.fn(async () => {}),
        onExpandedNoteChange: vi.fn(),
        onSearchQueryChange: vi.fn(),
        onTabChange: vi.fn(),
        searchQuery: '',
        searchResults,
        toc,
        tocListRef: { current: null },
        ...overrides,
    }
}

describe('ReaderPanelContent', () => {
    afterEach(() => cleanup())

    it('三个 tab 按钮都渲染，点击触发 onTabChange', () => {
        const onTabChange = vi.fn()
        const { getByText } = render(<ReaderPanelContent {...makeProps({ onTabChange })} />)
        fireEvent.click(getByText('搜索'))
        fireEvent.click(getByText('标注'))
        expect(onTabChange).toHaveBeenNthCalledWith(1, 'search')
        expect(onTabChange).toHaveBeenNthCalledWith(2, 'annotations')
    })

    it('目录 tab：渲染各章、当前章标 data-toc-active、点击跳转', () => {
        const handleTocClick = vi.fn(async () => {})
        const { getByText, container } = render(
            <ReaderPanelContent {...makeProps({ activeTab: 'toc', handleTocClick })} />,
        )
        expect(getByText('第一章')).toBeTruthy()
        const active = container.querySelector('[data-toc-active="true"]')
        expect(active?.textContent).toContain('第二章') // currentSectionHref=ch2
        fireEvent.click(getByText('第一章'))
        expect(handleTocClick).toHaveBeenCalledWith('ch1.xhtml')
    })

    it('目录 tab：空目录显示空态', () => {
        const { getByText } = render(<ReaderPanelContent {...makeProps({ activeTab: 'toc', toc: [] })} />)
        expect(getByText('无目录信息')).toBeTruthy()
    })

    it('搜索 tab：输入触发 onSearchQueryChange、Enter 触发 handleSearch、点结果跳转', () => {
        const onSearchQueryChange = vi.fn()
        const handleSearch = vi.fn(async () => {})
        const jumpToAnnotation = vi.fn(async () => {})
        const { getByPlaceholderText, getByText } = render(
            <ReaderPanelContent {...makeProps({ activeTab: 'search', searchQuery: '关键', onSearchQueryChange, handleSearch, jumpToAnnotation })} />,
        )
        const input = getByPlaceholderText('输入关键词...')
        fireEvent.change(input, { target: { value: '新词' } })
        expect(onSearchQueryChange).toHaveBeenCalledWith('新词')
        fireEvent.keyDown(input, { key: 'Enter' })
        expect(handleSearch).toHaveBeenCalled()
        fireEvent.click(getByText('命中片段'))
        expect(jumpToAnnotation).toHaveBeenCalledWith('cfi-1', '关键')
    })

    it('标注 tab：渲染高亮与笔记，删除按钮触发对应回调', () => {
        const deleteHighlight = vi.fn(async () => {})
        const deleteBookmark = vi.fn(async () => {})
        const { getByText, getAllByTitle } = render(
            <ReaderPanelContent {...makeProps({ activeTab: 'annotations', deleteHighlight, deleteBookmark })} />,
        )
        expect(getByText('高亮文本')).toBeTruthy()
        expect(getByText(/笔记引用/)).toBeTruthy()
        const deletes = getAllByTitle('删除')
        fireEvent.click(deletes[0]) // 高亮删除
        expect(deleteHighlight).toHaveBeenCalledWith('h1')
        fireEvent.click(deletes[1]) // 笔记删除
        expect(deleteBookmark).toHaveBeenCalledWith('m1')
    })

    it('标注 tab：空高亮与空笔记显示空态', () => {
        const { getByText } = render(
            <ReaderPanelContent {...makeProps({ activeTab: 'annotations', highlights: [], bookmarks: [] })} />,
        )
        expect(getByText('暂无高亮')).toBeTruthy()
        expect(getByText('暂无笔记')).toBeTruthy()
    })
})
