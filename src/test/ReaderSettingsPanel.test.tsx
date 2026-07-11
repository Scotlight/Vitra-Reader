import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
    resetToDefaults: vi.fn(),
    updateSetting: vi.fn(),
    addSavedColor: vi.fn(),
}))

vi.mock('@/stores/useSettingsStore', () => ({
    useSettingsStore: () => ({
        themeId: 'dark',
        customTextColor: null,
        customBgColor: null,
        savedTextColors: ['#ca4d4e'],
        savedBgColors: ['#c7edcc'],
        fontFamily: 'Segoe UI',
        fontSize: 22,
        lineHeight: 1.6,
        letterSpacing: 3,
        paragraphSpacing: 23,
        paragraphIndentEnabled: false,
        pageWidth: 3,
        brightness: 1,
        textAlign: 'left',
        showFooterProgress: true,
        showFooterChapter: true,
        showFooterTime: true,
        pageTurnMode: 'paginated-single',
        uiBlurStrength: 20,
        uiOpacity: 0.85,
        resetToDefaults: mocks.resetToDefaults,
        updateSetting: mocks.updateSetting,
        addSavedColor: mocks.addSavedColor,
    }),
}))

vi.mock('@/components/Reader/useReaderSystemFonts', () => ({
    useReaderSystemFonts: () => ({
        catalog: [],
        downloadFont: vi.fn(),
        fontError: null,
        fontOperationId: null,
        importFont: vi.fn(),
        loadingFonts: false,
        removeFont: vi.fn(),
        storedFonts: [],
        systemFonts: ['系统默认', 'Segoe UI'],
    }),
}))

import { ReaderSettingsPanel } from '@/components/Reader/ReaderSettingsPanel'

describe('ReaderSettingsPanel glass layout', () => {
    afterEach(() => {
        cleanup()
        vi.clearAllMocks()
    })

    it('渲染玻璃风格设置内容并保留关闭与重置操作', () => {
        const onClose = vi.fn()
        const onPageTurnModeChange = vi.fn()
        const view = render(
            <ReaderSettingsPanel
                bookFormat="epub"
                isOpen
                onClose={onClose}
                onPageTurnModeChange={onPageTurnModeChange}
                placement="bottom"
            />
        )

        expect(view.getByText('外观设置')).toBeTruthy()
        expect(view.getByText('亮色')).toBeTruthy()
        expect(view.getByText('深色')).toBeTruthy()
        expect(view.getByText('护眼')).toBeTruthy()
        expect(view.getByText('青绿')).toBeTruthy()

        fireEvent.click(view.getByRole('button', { name: '关闭设置' }))
        expect(onClose).toHaveBeenCalledTimes(1)

        fireEvent.click(view.getByRole('button', { name: /重置/ }))
        expect(mocks.resetToDefaults).toHaveBeenCalledTimes(1)
    })
})
