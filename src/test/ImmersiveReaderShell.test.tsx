import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TocItem } from '@/engine/core/contentProvider'

vi.mock('@/components/Reader/tocAutoScroll', () => ({
    scheduleCenterActiveToc: vi.fn(() => vi.fn()),
}))

import { ImmersiveReaderShell } from '@/components/Reader/ImmersiveReaderShell'

const toc: TocItem[] = [{ id: 'c1', href: 'chapter-1.xhtml', label: '第一章' }]

function renderShell(onPinnedSidebarWidthChange?: (width: number) => void) {
    return render(
        <ImmersiveReaderShell
            activeTab="toc"
            bookAuthorText="测试作者"
            bookCover=""
            bookTotalActiveMs={0}
            bookTitleText="测试书"
            chapterLabel="第一章"
            clockText="09:30"
            closePanels={vi.fn()}
            content={<div>正文内容</div>}
            currentSectionHref="chapter-1.xhtml"
            currentProgress={0.12}
            isNightMode={false}
            onNextChapter={vi.fn()}
            onBack={vi.fn()}
            onPreviousChapter={vi.fn()}
            onProgressCommit={vi.fn()}
            onTabChange={vi.fn()}
            onToggleNightMode={vi.fn()}
            onToggleFullscreen={vi.fn()}
            onPinnedSidebarWidthChange={onPinnedSidebarWidthChange}
            panelContent={<div>目录内容</div>}
            pinnedSidebarWidth={360}
            progressLabel="12%"
            settingsOpen={false}
            settingsPanel={<div>设置面板</div>}
            showFooterChapter
            showFooterProgress
            showFooterTime
            toc={toc}
            toggleSettingsPanel={vi.fn()}
        />,
    )
}

describe('ImmersiveReaderShell', () => {
    afterEach(() => {
        cleanup()
        vi.clearAllMocks()
        vi.unstubAllGlobals()
    })

    it('左侧目录胶囊可在常驻和悬浮模式之间切换', () => {
        const view = renderShell()

        const pinButton = view.getByRole('button', { name: '切换为常驻目录' })
        expect(pinButton.textContent).toBe('常驻')

        fireEvent.click(pinButton)
        expect(view.getByRole('button', { name: '切换为悬浮目录' }).textContent).toBe('悬浮')

        fireEvent.click(view.getByRole('button', { name: '切换为悬浮目录' }))
        expect(view.getByRole('button', { name: '切换为常驻目录' }).textContent).toBe('常驻')
    })

    it('手机横屏默认固定旧左侧目录栏', () => {
        vi.stubGlobal('matchMedia', vi.fn(() => ({
            matches: true,
            media: '(orientation: landscape) and (max-height: 600px)',
            onchange: null,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            addListener: vi.fn(),
            removeListener: vi.fn(),
            dispatchEvent: vi.fn(),
        })))

        const view = renderShell()

        expect(view.getByRole('button', { name: '切换为悬浮目录' }).textContent).toBe('悬浮')
        expect(view.container.firstElementChild).toHaveAttribute('data-toc-pinned', 'true')
    })

    it('悬浮模式不渲染宽度拖拽热区', () => {
        const view = renderShell()
        expect(view.queryByRole('separator')).toBeNull()
    })

    it('常驻模式下拖拽缝隙实时调宽并在松手时提交', () => {
        const onWidthChange = vi.fn()
        const view = renderShell(onWidthChange)

        fireEvent.click(view.getByRole('button', { name: '切换为常驻目录' }))
        const handle = view.getByRole('separator', { name: '调整目录栏宽度' })
        const shellRoot = view.container.firstElementChild as HTMLElement
        expect(shellRoot.style.getPropertyValue('--pinned-sidebar-width')).toBe('min(360px, 50vw)')

        fireEvent(handle, new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 360 }))
        expect(shellRoot).toHaveAttribute('data-sidebar-resizing', 'true')

        fireEvent(window, new MouseEvent('pointermove', { clientX: 480 }))
        expect(shellRoot.style.getPropertyValue('--pinned-sidebar-width')).toBe('min(480px, 50vw)')

        fireEvent(window, new MouseEvent('pointerup'))
        expect(onWidthChange).toHaveBeenCalledWith(480)
        expect(shellRoot).toHaveAttribute('data-sidebar-resizing', 'false')
        expect(shellRoot.style.getPropertyValue('--pinned-sidebar-width')).toBe('min(360px, 50vw)')
    })
})
