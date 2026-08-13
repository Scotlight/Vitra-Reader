import { cleanup, fireEvent, render, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MobileReaderChrome } from '@/components/Reader/MobileReaderChrome'

function renderChrome(overrides: Partial<Parameters<typeof MobileReaderChrome>[0]> = {}) {
    const props: Parameters<typeof MobileReaderChrome>[0] = {
        activeTab: 'toc',
        bookTitleText: '测试书',
        chapterCount: 12,
        chapterLabel: '第一章',
        chromeVisible: true,
        clockText: '09:41',
        currentProgress: 0.03,
        isNightMode: false,
        onBack: vi.fn(),
        onBookmarkTap: vi.fn(),
        onNextChapter: vi.fn(),
        onPreviousChapter: vi.fn(),
        onProgressCommit: vi.fn(),
        onTabChange: vi.fn(),
        onToggleNightMode: vi.fn(),
        panelContent: <button data-reader-panel-navigation="true">第一章</button>,
        remainingLabel: null,
        settingsOpen: false,
        showFooterChapter: true,
        showFooterProgress: true,
        showFooterTime: true,
        toggleSettingsPanel: vi.fn(),
        ...overrides,
    }
    return { props, view: render(<MobileReaderChrome {...props} />) }
}

describe('MobileReaderChrome', () => {
    afterEach(() => {
        cleanup()
        vi.clearAllMocks()
    })

    it('目录按钮打开抽屉，导航后关闭', () => {
        const { props, view } = renderChrome()

        fireEvent.click(view.getByRole('button', { name: '目录' }))
        expect(props.onTabChange).toHaveBeenCalledWith('toc')
        expect(view.getByRole('complementary', { name: '阅读目录面板' })).toBeInTheDocument()

        fireEvent.click(view.getByRole('button', { name: '第一章' }))
        expect(view.queryByRole('complementary', { name: '阅读目录面板' })).not.toBeInTheDocument()
    })

    it('章节按钮与进度滑杆调用 Reader 回调', () => {
        const { props, view } = renderChrome()

        fireEvent.click(view.getByRole('button', { name: '上一章' }))
        fireEvent.click(view.getByRole('button', { name: '下一章' }))
        const slider = view.getByRole('slider', { name: '阅读进度' })
        fireEvent.change(slider, { target: { value: '47' } })
        fireEvent.pointerUp(slider)

        expect(props.onPreviousChapter).toHaveBeenCalledTimes(1)
        expect(props.onNextChapter).toHaveBeenCalledTimes(1)
        expect(props.onProgressCommit).toHaveBeenCalledWith(0.47)
    })

    it('设置和夜间按钮复用外部设置状态', () => {
        const { props, view } = renderChrome()

        fireEvent.click(view.getByRole('button', { name: '设置' }))
        fireEvent.click(view.getByRole('button', { name: '夜间' }))

        expect(props.toggleSettingsPanel).toHaveBeenCalledTimes(1)
        expect(props.onToggleNightMode).toHaveBeenCalledTimes(1)
    })

    it('顶栏返回钮回调 onBack，书名可见', () => {
        const { props, view } = renderChrome()

        expect(view.getByText('测试书')).toBeInTheDocument()
        fireEvent.click(view.getByRole('button', { name: '返回书库' }))
        expect(props.onBack).toHaveBeenCalledTimes(1)
    })

    it('顶栏汉堡与目录钮共用抽屉开关', () => {
        const { view } = renderChrome()

        fireEvent.click(view.getByRole('button', { name: '目录抽屉' }))
        expect(view.getByRole('complementary', { name: '阅读目录面板' })).toBeInTheDocument()
        fireEvent.click(view.getByRole('button', { name: '目录抽屉' }))
        expect(view.queryByRole('complementary', { name: '阅读目录面板' })).not.toBeInTheDocument()
    })

    it('chromeVisible 驱动 data-chrome-visible 属性（常驻 DOM 不卸载）', () => {
        const { view } = renderChrome({ chromeVisible: false })

        const root = view.container.querySelector('[data-mobile-reader-chrome="true"]')
        expect(root?.getAttribute('data-chrome-visible')).toBe('false')
        // 隐藏时顶栏与工具坞仍在 DOM（抽屉/进度 state 不能丢，退场动画要能播）
        expect(view.getByRole('button', { name: '返回书库' })).toBeInTheDocument()
    })

    it('remainingLabel 空时不渲染，有值时显示', () => {
        const { view } = renderChrome()
        expect(view.queryByText(/剩余/)).not.toBeInTheDocument()
        cleanup()

        const { view: view2 } = renderChrome({ remainingLabel: '剩余 42 分' })
        expect(view2.getByText('剩余 42 分')).toBeInTheDocument()
    })

    it('meta 行按用户设置隐藏对应字段', () => {
        const { view } = renderChrome({
            showFooterChapter: false,
            showFooterProgress: false,
            showFooterTime: true,
        })

        const meta = view.getByLabelText('阅读状态')
        expect(meta).not.toHaveTextContent('第一章')
        expect(meta).not.toHaveTextContent('%')
        expect(meta).toHaveTextContent('09:41')
    })

    it('三项 meta 全关时整行不渲染', () => {
        const { view } = renderChrome({
            showFooterChapter: false,
            showFooterProgress: false,
            showFooterTime: false,
        })
        expect(view.queryByLabelText('阅读状态')).not.toBeInTheDocument()
    })

    it('书签占位钮触发 onBookmarkTap', () => {
        const { props, view } = renderChrome()
        fireEvent.click(view.getByRole('button', { name: '书签（即将上线）' }))
        expect(props.onBookmarkTap).toHaveBeenCalledTimes(1)
    })
})

describe('MobileReaderChrome meta 组合', () => {
    afterEach(() => {
        cleanup()
    })

    it('meta 行以 · 连接章节/进度/时间', () => {
        const { view } = renderChrome()
        const meta = within(view.getByLabelText('阅读状态'))
        expect(meta.getByText('第一章 · 3% · 09:41')).toBeInTheDocument()
    })
})
