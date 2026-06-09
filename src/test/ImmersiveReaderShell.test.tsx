import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TocItem } from '@/engine/core/contentProvider'

vi.mock('@/components/Reader/tocAutoScroll', () => ({
    scheduleCenterActiveToc: vi.fn(() => vi.fn()),
}))

import { ImmersiveReaderShell } from '@/components/Reader/ImmersiveReaderShell'

const toc: TocItem[] = [{ id: 'c1', href: 'chapter-1.xhtml', label: '第一章' }]

function renderShell() {
    return render(
        <ImmersiveReaderShell
            activeTab="toc"
            bookTitleText="测试书"
            chapterLabel="第一章"
            clockText="09:30"
            closePanels={vi.fn()}
            content={<div>正文内容</div>}
            currentSectionHref="chapter-1.xhtml"
            onBack={vi.fn()}
            onTabChange={vi.fn()}
            onToggleFullscreen={vi.fn()}
            panelContent={<div>目录内容</div>}
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
})
