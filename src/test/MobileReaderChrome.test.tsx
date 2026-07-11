import { cleanup, fireEvent, render, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MobileReaderChrome } from '@/components/Reader/MobileReaderChrome'

function renderChrome(overrides: Partial<Parameters<typeof MobileReaderChrome>[0]> = {}) {
    const props: Parameters<typeof MobileReaderChrome>[0] = {
        activeTab: 'toc',
        chapterCount: 12,
        chapterLabel: '第一章',
        clockText: '09:41',
        currentProgress: 0.03,
        isNightMode: false,
        onNextChapter: vi.fn(),
        onPreviousChapter: vi.fn(),
        onProgressCommit: vi.fn(),
        onTabChange: vi.fn(),
        onToggleNightMode: vi.fn(),
        panelContent: <button data-reader-panel-navigation="true">第一章</button>,
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

    it('按用户设置隐藏状态胶囊字段', () => {
        const { view } = renderChrome({
            showFooterChapter: false,
            showFooterProgress: false,
            showFooterTime: true,
        })

        const status = within(view.getByLabelText('阅读状态'))
        expect(status.queryByText('第一章')).not.toBeInTheDocument()
        expect(status.queryByText('进度')).not.toBeInTheDocument()
        expect(status.getByText('09:41')).toBeInTheDocument()
    })
})
