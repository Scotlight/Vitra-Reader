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
        expect(view.getByText('字体预览')).toBeTruthy()
        expect(view.getByText('清晨的光从窗边慢慢移进来，书页也跟着亮了一点。')).toBeTruthy()
        expect(view.getByText('读到这里时，句子的停顿和段落之间的距离会更加明显。')).toBeTruthy()
        expect(view.getByText('这段文字用来观察字体、字号、字距、行距与首行缩进。')).toBeTruthy()
    })

    it('Display 字号 stepper 写入 settings store', () => {
        const { view } = renderSettingsPanel()

        fireEvent.click(view.getByRole('button', { name: /显示/ }))
        fireEvent.click(view.getByRole('button', { name: '字号增加' }))

        expect(settingsMocks.updateSetting).toHaveBeenCalledWith('fontSize', 23)
    })

    it('翻译服务归类在外部连接设置中', () => {
        const { view } = renderSettingsPanel()

        fireEvent.click(view.getByRole('button', { name: /外部连接/ }))

        expect(view.getByRole('heading', { name: '外部连接' })).toBeTruthy()
        expect(view.getByText('翻译服务')).toBeTruthy()
        expect(view.getByText('翻译设置占位')).toBeTruthy()
    })

    it('重置默认调用 resetToDefaults', () => {
        const { view } = renderSettingsPanel()

        fireEvent.click(view.getByRole('button', { name: /重置默认/ }))

        expect(settingsMocks.resetToDefaults).toHaveBeenCalledTimes(1)
    })

    it('完成会关闭面板，且不显示误导性的取消按钮', () => {
        const onClose = vi.fn()
        const { view } = renderSettingsPanel(onClose)

        expect(view.queryByRole('button', { name: '取消' })).toBeNull()
        fireEvent.click(view.getByRole('button', { name: '完成' }))

        expect(onClose).toHaveBeenCalledTimes(1)
    })
})
