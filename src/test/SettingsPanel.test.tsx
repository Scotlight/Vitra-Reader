import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const settingsMocks = vi.hoisted(() => ({
    resetToDefaults: vi.fn(),
    updateSetting: vi.fn(),
}))

vi.mock('@/stores/useSettingsStore', () => ({
    useSettingsStore: () => ({
        themeId: 'light',
        customBgColor: null,
        customTextColor: null,
        fontFamily: 'Segoe UI',
        fontSize: 22,
        fontWeight: 'normal',
        lineHeight: 1.6,
        paragraphSpacing: 23,
        paragraphIndentEnabled: false,
        letterSpacing: 3,
        pageWidth: 3,
        brightness: 1,
        textAlign: 'left',
        showFooterProgress: true,
        showFooterChapter: true,
        showFooterTime: true,
        pageTurnMode: 'paginated-single',
        pageTurnAnimation: 'slide',
        uiMaterial: 'mica',
        uiBlurStrength: 20,
        uiOpacity: 0.85,
        uiRoundness: 8,
        uiAnimation: true,
        savedTextColors: [],
        savedBgColors: [],
        persistenceError: false,
        updateSetting: settingsMocks.updateSetting,
        addSavedColor: vi.fn(),
        resetToDefaults: settingsMocks.resetToDefaults,
        loadPersistedSettings: vi.fn(),
    }),
}))

vi.mock('@/components/Library/settingsPanel/SyncSettingsTab', () => ({
    SyncSettingsTab: () => <div>同步设置占位</div>,
}))

vi.mock('@/components/Library/settingsPanel/TranslateSettingsTab', () => ({
    TranslateSettingsTab: () => <div>翻译设置占位</div>,
}))

import { SettingsPanel } from '@/components/Library/SettingsPanel'

function renderSettingsPanel(onClose = vi.fn()) {
    return {
        onClose,
        view: render(
            <SettingsPanel
                systemFonts={['Segoe UI', 'Noto Sans CJK SC']}
                loadingFonts={false}
                onClose={onClose}
            />,
        ),
    }
}

describe('SettingsPanel', () => {
    afterEach(() => {
        cleanup()
        vi.clearAllMocks()
    })

    it('默认显示通用设置，并可切换到 Display 内容', () => {
        const { view } = renderSettingsPanel()

        expect(view.getByRole('heading', { name: '通用设置' })).toBeTruthy()
        expect(view.getByText('界面外观')).toBeTruthy()

        fireEvent.click(view.getByRole('button', { name: /显示/ }))

        expect(view.getByRole('heading', { name: '显示设置' })).toBeTruthy()
        expect(view.getByText('主题与排版')).toBeTruthy()
        expect(view.getByText('阅读体验')).toBeTruthy()
    })

    it('Display 字号 stepper 写入 settings store', () => {
        const { view } = renderSettingsPanel()

        fireEvent.click(view.getByRole('button', { name: /显示/ }))
        fireEvent.click(view.getByRole('button', { name: '字号增加' }))

        expect(settingsMocks.updateSetting).toHaveBeenCalledWith('fontSize', 23)
    })

    it('重置默认调用 resetToDefaults', () => {
        const { view } = renderSettingsPanel()

        fireEvent.click(view.getByRole('button', { name: /重置默认/ }))

        expect(settingsMocks.resetToDefaults).toHaveBeenCalledTimes(1)
    })

    it('取消和应用都会关闭面板', () => {
        const onClose = vi.fn()
        const { view } = renderSettingsPanel(onClose)

        fireEvent.click(view.getByRole('button', { name: '取消' }))
        fireEvent.click(view.getByRole('button', { name: '应用' }))

        expect(onClose).toHaveBeenCalledTimes(2)
    })
})
