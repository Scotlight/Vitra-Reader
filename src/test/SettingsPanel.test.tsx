import { cleanup, fireEvent, render, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const settingsMocks = vi.hoisted(() => ({
    resetToDefaults: vi.fn(),
    updateSetting: vi.fn(),
    state: {
        themeId: 'light',
        customBgColor: null as string | null,
        customTextColor: null as string | null,
        fontFamily: 'Segoe UI',
        fontSize: 22,
        fontWeight: 'normal' as const,
        lineHeight: 1.6,
        paragraphSpacing: 23,
        paragraphIndentEnabled: false,
        letterSpacing: 3,
        pageWidth: 3,
        brightness: 1,
        textAlign: 'left' as const,
        showFooterProgress: true,
        showFooterChapter: true,
        showFooterTime: true,
        pageTurnMode: 'paginated-single' as const,
        pageTurnAnimation: 'slide' as const,
        uiMaterial: 'mica' as 'default' | 'mica' | 'acrylic',
        uiBlurStrength: 20,
        uiOpacity: 0.85,
        uiRoundness: 8,
        uiAnimation: true,
        savedTextColors: [] as string[],
        savedBgColors: [] as string[],
        persistenceError: false,
    },
}))

vi.mock('@/stores/useSettingsStore', () => ({
    useSettingsStore: () => ({
        ...settingsMocks.state,
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
    TranslateSettingsTab: ({ scope = 'all' }: { scope?: string }) => (
        <div>
            <span>翻译设置占位</span>
            <span>{scope}</span>
        </div>
    ),
}))

import { SettingsPanel } from '@/components/Library/SettingsPanel'
import type { MobileSettingsPage } from '@/components/Library/settingsPanel/mobileSettings'

function renderSettingsPanel(
    onClose = vi.fn(),
    mobilePage: MobileSettingsPage | null = null,
    onMobilePageChange = vi.fn(),
) {
    return {
        onClose,
        onMobilePageChange,
        view: render(
            <SettingsPanel
                systemFonts={['Segoe UI', 'Noto Sans CJK SC']}
                loadingFonts={false}
                mobilePage={mobilePage}
                onClose={onClose}
                onMobilePageChange={onMobilePageChange}
            />,
        ),
    }
}

describe('SettingsPanel', () => {
    afterEach(() => {
        cleanup()
        vi.clearAllMocks()
        settingsMocks.state.uiMaterial = 'mica'
        settingsMocks.state.uiBlurStrength = 20
        settingsMocks.state.uiOpacity = 0.85
        settingsMocks.state.uiRoundness = 8
    })

    it('默认显示通用设置，并可切换到 Display 内容', () => {
        const { view } = renderSettingsPanel()

        expect(view.getByRole('heading', { name: '通用设置' })).toBeTruthy()
        expect(view.getByRole('heading', { name: '界面外观' })).toBeTruthy()

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
        const desktopCategories = within(view.getByRole('navigation', { name: '桌面设置分类' }))

        fireEvent.click(desktopCategories.getByRole('button', { name: /外部连接/ }))

        expect(view.getByRole('heading', { name: '外部连接' })).toBeTruthy()
        expect(view.getByRole('heading', { name: '翻译服务' })).toBeTruthy()
        expect(view.getByText('翻译设置占位')).toBeTruthy()
    })

    it('重置默认调用 resetToDefaults', () => {
        const { view } = renderSettingsPanel()

        fireEvent.click(view.getByRole('button', { name: /重置默认/ }))

        expect(settingsMocks.resetToDefaults).toHaveBeenCalledTimes(1)
    })

    it('界面外观预览存在，控件写入对应 updateSetting', () => {
        const { view } = renderSettingsPanel()

        expect(view.getByTestId('ui-appearance-preview')).toBeInTheDocument()
        // 预览只继承 CSS 变量，不维护独立设置状态
        expect(view.getByText('效果预览')).toBeInTheDocument()
        expect(view.queryByTestId('ui-default-blur-hint')).not.toBeInTheDocument()

        fireEvent.click(view.getByRole('button', { name: '圆角增加' }))
        expect(settingsMocks.updateSetting).toHaveBeenCalledWith('uiRoundness', 9)

        fireEvent.click(view.getByRole('button', { name: '毛玻璃强度增加' }))
        expect(settingsMocks.updateSetting).toHaveBeenCalledWith('uiBlurStrength', 21)

        fireEvent.click(view.getByRole('button', { name: '透明度减少' }))
        expect(settingsMocks.updateSetting).toHaveBeenCalledWith('uiOpacity', 0.8)

        fireEvent.change(view.getByLabelText('界面材质'), { target: { value: 'acrylic' } })
        expect(settingsMocks.updateSetting).toHaveBeenCalledWith('uiMaterial', 'acrylic')
    })

    it('材质为 default 时显示模糊不生效提示', () => {
        settingsMocks.state.uiMaterial = 'default'
        const { view } = renderSettingsPanel()

        expect(view.getByTestId('ui-default-blur-hint')).toHaveTextContent('默认材质不使用背景模糊')
    })

    it('完成会关闭面板，且不显示误导性的取消按钮', () => {
        const onClose = vi.fn()
        const { view } = renderSettingsPanel(onClose)

        expect(view.queryByRole('button', { name: '取消' })).toBeNull()
        fireEvent.click(view.getByRole('button', { name: '完成' }))

        expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('手机版按五组显示十个分类入口，再按选择渲染二级内容', () => {
        const onMobilePageChange = vi.fn()
        const { view } = renderSettingsPanel(vi.fn(), null, onMobilePageChange)
        const mobileCategories = within(view.getByRole('navigation', { name: '设置分类' }))

        for (const group of ['阅读', '应用', '服务', '数据', '其他']) {
            expect(mobileCategories.getByRole('heading', { name: group })).toBeInTheDocument()
        }
        for (const page of [
            '阅读方式',
            '字体',
            '排版',
            '主题与配色',
            '界面外观',
            '阅读统计',
            '翻译服务',
            '翻译缓存',
            '同步与备份',
            '关于 Vitra',
        ]) {
            expect(mobileCategories.getByRole('button', { name: page })).toBeInTheDocument()
        }

        fireEvent.click(mobileCategories.getByRole('button', { name: '阅读方式' }))
        expect(onMobilePageChange).toHaveBeenCalledWith('readingMode')

        view.rerender(
            <SettingsPanel
                systemFonts={['Segoe UI', 'Noto Sans CJK SC']}
                loadingFonts={false}
                mobilePage="readingMode"
                onClose={vi.fn()}
                onMobilePageChange={onMobilePageChange}
            />,
        )
        expect(view.getByText('阅读方式')).toBeInTheDocument()
        expect(view.getByText('翻页模式')).toBeInTheDocument()
        expect(view.queryByLabelText('字体')).not.toBeInTheDocument()
        expect(view.queryByRole('navigation', { name: '设置分类' })).not.toBeInTheDocument()
    })

    it('手机版字体、排版、主题和翻译页面只显示各自设置', () => {
        const { view } = renderSettingsPanel(vi.fn(), 'font')

        expect(view.getByLabelText('字体')).toBeInTheDocument()
        expect(view.getByText('字体预览')).toBeInTheDocument()
        expect(view.queryByText('翻页模式')).not.toBeInTheDocument()

        view.rerender(
            <SettingsPanel
                systemFonts={['Segoe UI', 'Noto Sans CJK SC']}
                loadingFonts={false}
                mobilePage="typography"
                onClose={vi.fn()}
                onMobilePageChange={vi.fn()}
            />,
        )
        expect(view.getByRole('button', { name: '字号增加' })).toBeInTheDocument()
        expect(view.queryByRole('button', { name: '浅色' })).not.toBeInTheDocument()

        view.rerender(
            <SettingsPanel
                systemFonts={['Segoe UI', 'Noto Sans CJK SC']}
                loadingFonts={false}
                mobilePage="theme"
                onClose={vi.fn()}
                onMobilePageChange={vi.fn()}
            />,
        )
        expect(view.getByRole('button', { name: '浅色' })).toBeInTheDocument()
        expect(view.queryByRole('button', { name: '字号增加' })).not.toBeInTheDocument()

        view.rerender(
            <SettingsPanel
                systemFonts={['Segoe UI', 'Noto Sans CJK SC']}
                loadingFonts={false}
                mobilePage="translateCache"
                onClose={vi.fn()}
                onMobilePageChange={vi.fn()}
            />,
        )
        expect(view.getByText('cache')).toBeInTheDocument()
        expect(view.queryByText('连接说明')).not.toBeInTheDocument()
    })
})
