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
        mobileTab: 'shelf',
        onHomeSearch: vi.fn(),
        onImport: vi.fn(),
        onKeywordChange: vi.fn(),
        onNavigate: vi.fn(),
        onMobileSettingsBack: vi.fn(),
        onTabChange: vi.fn(),
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

    it('底部导航承载首页、书架、阅读时间、笔记、设置五个一级 tab', () => {
        const { props, view } = renderChrome()

        fireEvent.click(view.getByRole('button', { name: '首页' }))
        fireEvent.click(view.getByRole('button', { name: '书架' }))
        fireEvent.click(view.getByRole('button', { name: '阅读时间' }))
        fireEvent.click(view.getByRole('button', { name: '笔记' }))
        fireEvent.click(view.getByRole('button', { name: '设置' }))

        expect(props.onTabChange).toHaveBeenNthCalledWith(1, 'home')
        expect(props.onTabChange).toHaveBeenNthCalledWith(2, 'shelf')
        expect(props.onTabChange).toHaveBeenNthCalledWith(3, 'time')
        expect(props.onTabChange).toHaveBeenNthCalledWith(4, 'notes')
        expect(props.onTabChange).toHaveBeenNthCalledWith(5, 'settings')
    })

    it('首页 tab 渲染专属头部：大标题 + 搜索圆钮 + 导入胶囊，无品牌行与筛选', () => {
        const { props, view } = renderChrome({ mobileTab: 'home' })

        expect(view.getByRole('heading', { name: '首页' })).toBeInTheDocument()
        expect(view.queryByText('Vitra')).not.toBeInTheDocument()
        expect(view.queryByRole('searchbox')).not.toBeInTheDocument()
        expect(view.queryByRole('button', { name: '筛选收藏' })).not.toBeInTheDocument()

        fireEvent.click(view.getByRole('button', { name: '搜索书库' }))
        fireEvent.click(view.getByRole('button', { name: '导入图书' }))

        expect(props.onHomeSearch).toHaveBeenCalledTimes(1)
        expect(props.onImport).toHaveBeenCalledTimes(1)
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
