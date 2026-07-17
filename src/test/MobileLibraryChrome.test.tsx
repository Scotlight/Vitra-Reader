import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MobileLibraryChrome } from '@/components/Library/MobileLibraryChrome'

function renderChrome(overrides: Partial<Parameters<typeof MobileLibraryChrome>[0]> = {}) {
    const props: Parameters<typeof MobileLibraryChrome>[0] = {
        activeNav: 'all',
        isLoading: false,
        isSettingsOpen: false,
        keyword: '',
        mobileSettingsPage: null,
        onImport: vi.fn(),
        onKeywordChange: vi.fn(),
        onNavigate: vi.fn(),
        onMobileSettingsBack: vi.fn(),
        onOpenSettings: vi.fn(),
        statusText: '共 12 本',
        ...overrides,
    }
    return { props, view: render(<MobileLibraryChrome {...props} />) }
}

describe('MobileLibraryChrome', () => {
    afterEach(() => {
        cleanup()
        vi.clearAllMocks()
    })

    it('复用书库搜索、导入和二级筛选回调', () => {
        const { props, view } = renderChrome()

        fireEvent.change(view.getByRole('searchbox', { name: '搜索我的书库' }), {
            target: { value: '沙丘' },
        })
        fireEvent.click(view.getByRole('button', { name: '导入图书' }))
        fireEvent.click(view.getByRole('button', { name: '筛选收藏' }))
        fireEvent.click(view.getByRole('button', { name: '筛选回收站' }))

        expect(props.onKeywordChange).toHaveBeenCalledWith('沙丘')
        expect(props.onImport).toHaveBeenCalledTimes(1)
        expect(view.getByRole('button', { name: '导入图书' })).toHaveTextContent('导入')
        expect(props.onNavigate).toHaveBeenNthCalledWith(1, 'fav')
        expect(props.onNavigate).toHaveBeenNthCalledWith(2, 'trash')
    })

    it('底部导航只承载书架、标注、统计和设置四个一级入口', () => {
        const { props, view } = renderChrome()

        fireEvent.click(view.getByRole('button', { name: '书架' }))
        fireEvent.click(view.getByRole('button', { name: '标注' }))
        fireEvent.click(view.getByRole('button', { name: '统计' }))
        fireEvent.click(view.getByRole('button', { name: '设置' }))

        expect(props.onNavigate).toHaveBeenNthCalledWith(1, 'all')
        expect(props.onNavigate).toHaveBeenNthCalledWith(2, 'notes')
        expect(props.onNavigate).toHaveBeenNthCalledWith(3, 'stats')
        expect(props.onOpenSettings).toHaveBeenCalledTimes(1)
    })

    it('标注一级页只显示笔记和高亮二级筛选', () => {
        const { props, view } = renderChrome({ activeNav: 'notes' })

        expect(view.getByRole('heading', { name: '标注' })).toBeInTheDocument()
        expect(view.queryByRole('searchbox')).not.toBeInTheDocument()
        expect(view.queryByRole('button', { name: '筛选收藏' })).not.toBeInTheDocument()

        fireEvent.click(view.getByRole('button', { name: '筛选高亮' }))

        expect(props.onNavigate).toHaveBeenCalledWith('highlight')
    })

    it('设置页保留品牌与底栏，并收起书库搜索控件', () => {
        const { view } = renderChrome({ isSettingsOpen: true })

        expect(view.getByRole('heading', { name: '设置' })).toBeInTheDocument()
        expect(view.queryByRole('searchbox')).not.toBeInTheDocument()
        expect(view.queryByRole('button', { name: '导入图书' })).not.toBeInTheDocument()
        expect(view.getByRole('button', { name: '设置' })).toHaveAttribute('aria-current', 'page')
    })

    it('设置二级页显示分类标题并提供返回入口', () => {
        const { props, view } = renderChrome({
            isSettingsOpen: true,
            mobileSettingsPage: 'readingMode',
        })

        expect(view.getByRole('heading', { name: '阅读方式' })).toBeInTheDocument()
        expect(view.queryByText('Vitra')).not.toBeInTheDocument()
        fireEvent.click(view.getByRole('button', { name: '返回设置分类' }))

        expect(props.onMobileSettingsBack).toHaveBeenCalledTimes(1)
    })
})
