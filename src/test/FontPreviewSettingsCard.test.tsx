import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FontPreviewSettingsCard } from '@/components/Library/settingsPanel/FontPreviewSettingsCard'
import type { SettingsFormStore } from '@/components/Library/settingsPanel/settingsTypes'

function createSettings(overrides: Partial<SettingsFormStore> = {}): SettingsFormStore {
    return {
        themeId: 'light',
        customBgColor: null,
        customTextColor: null,
        fontFamily: '"Noto Serif SC", serif',
        fontSize: 24,
        fontWeight: 'normal',
        lineHeight: 1.8,
        paragraphSpacing: 18,
        paragraphIndentEnabled: true,
        letterSpacing: 2,
        pageWidth: 1,
        brightness: 1,
        textAlign: 'justify',
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
        updateSetting: vi.fn(),
        addSavedColor: vi.fn(),
        resetToDefaults: vi.fn(),
        loadPersistedSettings: vi.fn(),
        ...overrides,
    } as SettingsFormStore
}

describe('FontPreviewSettingsCard', () => {
    afterEach(() => {
        cleanup()
    })

    it('把当前阅读文字设置同步到预览节点', () => {
        const settings = createSettings({
            customBgColor: '#112233',
            customTextColor: '#fafafa',
        })
        const { getByTestId, getAllByText } = render(<FontPreviewSettingsCard settings={settings} />)

        const viewport = getByTestId('font-preview-viewport')
        expect(viewport.style.fontFamily).toBe('"Noto Serif SC", serif')
        expect(viewport.style.fontSize).toBe('24px')
        expect(viewport.style.lineHeight).toBe('1.8')
        expect(viewport.style.letterSpacing).toBe('2px')
        expect(viewport.style.textAlign).toBe('justify')
        expect(viewport.style.backgroundColor).toBe('rgb(17, 34, 51)')
        expect(viewport.style.color).toBe('rgb(250, 250, 250)')
        expect(viewport.style.getPropertyValue('--font-preview-indent')).toBe('2em')
        expect(viewport.style.getPropertyValue('--font-preview-paragraph-spacing')).toBe('18px')

        expect(getAllByText(/清晨的光|读到这里时|这段文字用来观察/).length).toBe(3)
    })

    it('关闭首行缩进且无自定义色时回退主题变量', () => {
        const settings = createSettings({
            paragraphIndentEnabled: false,
            customBgColor: null,
            customTextColor: null,
            textAlign: 'left',
        })
        const { getByTestId } = render(<FontPreviewSettingsCard settings={settings} />)
        const viewport = getByTestId('font-preview-viewport')

        expect(viewport.style.getPropertyValue('--font-preview-indent')).toBe('0')
        // 空自定义色时写 CSS 变量名，依赖 data-theme 下的 --reader-bg / --reader-text
        // jsdom 不会把 var() 解析成 computed color，style.backgroundColor 会保留原字符串
        expect(viewport.style.backgroundColor).toBe('var(--reader-bg)')
        expect(viewport.style.color).toBe('var(--reader-text)')
    })
})
