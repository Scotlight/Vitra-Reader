import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MobileReaderSettingsSubpage } from '@/components/Library/settingsPanel/MobileReaderSettingsSubpage'
import type { SettingsFormStore } from '@/components/Library/settingsPanel/settingsTypes'

vi.mock('@/hooks/useIsCoarsePointer', () => ({
    useIsCoarsePointer: () => true,
}))

const createSettingsMock = (overrides: Partial<SettingsFormStore> = {}): SettingsFormStore => ({
    fontFamily: 'inherit',
    fontSize: 16,
    lineHeight: 1.6,
    letterSpacing: 0,
    paragraphSpacing: 8,
    paragraphIndentEnabled: true,
    textAlign: 'left',
    pageWidth: 1,
    brightness: 1,
    pageTurnMode: 'paginated-single',
    pageTurnAnimation: 'slide',
    themeId: 'light',
    customBgColor: null,
    customTextColor: null,
    updateSetting: vi.fn(),
    ...overrides,
} as unknown as SettingsFormStore)

describe('MobileReaderSettingsSubpage', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('字体页：预览钉顶部 + 字体/字号组', () => {
        const settings = createSettingsMock()
        render(
            <MobileReaderSettingsSubpage
                page="font"
                settings={settings}
                systemFonts={['Serif A', 'Sans B']}
                loadingFonts={false}
                tempTextColor={null}
                onTempTextColorChange={() => {}}
            />,
        )
        expect(screen.getByTestId('mobile-font-preview')).toBeTruthy()
        // 有且只有一处"字体"组标题（修复了原来标题×3 的问题）
        expect(screen.getByRole('heading', { name: '字体' })).toBeTruthy()
        expect(screen.getByRole('heading', { name: '字号与间距' })).toBeTruthy()
    })

    it('字体页：stepper 调用 updateSetting', () => {
        const settings = createSettingsMock()
        render(
            <MobileReaderSettingsSubpage
                page="font"
                settings={settings}
                systemFonts={[]}
                loadingFonts={false}
                tempTextColor={null}
                onTempTextColorChange={() => {}}
            />,
        )
        const increase = screen.getByRole('button', { name: '字号增加' })
        fireEvent.click(increase)
        expect(settings.updateSetting).toHaveBeenCalledWith('fontSize', 17)
    })

    it('排版页：含首行缩进 toggle / 对齐 select / 段距 stepper', () => {
        const settings = createSettingsMock()
        render(
            <MobileReaderSettingsSubpage
                page="typography"
                settings={settings}
                systemFonts={[]}
                loadingFonts={false}
                tempTextColor={null}
                onTempTextColorChange={() => {}}
            />,
        )
        const toggle = screen.getByRole('switch', { name: '正文首行缩进' })
        expect(toggle.getAttribute('aria-checked')).toBe('true')
        fireEvent.click(toggle)
        expect(settings.updateSetting).toHaveBeenCalledWith('paragraphIndentEnabled', false)
    })

    it('主题页：色板 + 自定义颜色行', () => {
        const settings = createSettingsMock({ themeId: 'dark' })
        render(
            <MobileReaderSettingsSubpage
                page="theme"
                settings={settings}
                systemFonts={[]}
                loadingFonts={false}
                tempTextColor={null}
                onTempTextColorChange={() => {}}
            />,
        )
        const darkSwatch = screen.getByRole('radio', { name: '深色' })
        expect(darkSwatch.getAttribute('aria-checked')).toBe('true')
        const lightSwatch = screen.getByRole('radio', { name: '浅色' })
        fireEvent.click(lightSwatch)
        expect(settings.updateSetting).toHaveBeenCalledWith('themeId', 'light')
    })

    it('阅读方式页：翻页模式 3 个可视化 radio + 翻页动画分段控件', () => {
        const settings = createSettingsMock()
        render(
            <MobileReaderSettingsSubpage
                page="readingMode"
                settings={settings}
                systemFonts={[]}
                loadingFonts={false}
                tempTextColor={null}
                onTempTextColorChange={() => {}}
            />,
        )
        // 3 个 radio：单页 / 双页 / 滚动
        const singleRadio = screen.getByRole('radio', { name: '单页' })
        const doubleRadio = screen.getByRole('radio', { name: '双页' })
        const scrollRadio = screen.getByRole('radio', { name: '滚动' })
        expect(singleRadio.getAttribute('aria-checked')).toBe('true')
        expect(doubleRadio.getAttribute('aria-checked')).toBe('false')
        expect(scrollRadio.getAttribute('aria-checked')).toBe('false')

        // 点击"滚动" → 写入 pageTurnMode
        fireEvent.click(scrollRadio)
        expect(settings.updateSetting).toHaveBeenCalledWith('pageTurnMode', 'scrolled-continuous')

        // 翻页动画是分段控件：点"渐变"直接写入，不再有原生 select
        const fadeButton = screen.getByRole('radio', { name: '渐变' })
        fireEvent.click(fadeButton)
        expect(settings.updateSetting).toHaveBeenCalledWith('pageTurnAnimation', 'fade')
    })

    it('阅读方式页：双页模式下"仿真"动画置灰不可选', () => {
        const settings = createSettingsMock({ pageTurnMode: 'paginated-double' })
        render(
            <MobileReaderSettingsSubpage
                page="readingMode"
                settings={settings}
                systemFonts={[]}
                loadingFonts={false}
                tempTextColor={null}
                onTempTextColorChange={() => {}}
            />,
        )
        const realisticButton = screen.getByRole('radio', { name: '仿真' }) as HTMLButtonElement
        expect(realisticButton.disabled).toBe(true)
    })
})
