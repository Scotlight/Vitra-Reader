import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { ReaderSettings } from '@/stores/useSettingsStore'
import { useReaderAppearance } from '@/components/Reader/useReaderAppearance'

const baseSettings: ReaderSettings = {
    brightness: 1,
    customBgColor: null,
    customTextColor: null,
    fontFamily: 'Segoe UI',
    fontSize: 22,
    fontWeight: 'normal',
    letterSpacing: 3,
    lineHeight: 1.6,
    pageTurnAnimation: 'slide',
    pageTurnMode: 'paginated-single',
    pageWidth: 3,
    pinnedSidebarWidth: 360,
    paragraphIndentEnabled: false,
    paragraphSpacing: 23,
    showFooterChapter: true,
    showFooterProgress: true,
    showFooterTime: true,
    textAlign: 'left',
    themeId: 'light',
    uiAnimation: true,
    uiBlurStrength: 20,
    uiMaterial: 'mica',
    uiOpacity: 0.85,
    uiRoundness: 8,
}

describe('useReaderAppearance', () => {
    afterEach(() => {
        cleanup()
    })

    it('从阅读设置派生字体、颜色和 ShadowRenderer 样式', () => {
        const { result } = renderHook(() => useReaderAppearance({
            ...baseSettings,
            customBgColor: '#101010',
            customTextColor: '#f5f5f5',
            paragraphIndentEnabled: true,
            textAlign: 'justify',
        }, 'epub'))

        expect(result.current.readerColors).toEqual({
            bgColor: '#101010',
            textColor: '#f5f5f5',
        })
        expect(result.current.resolvedReaderFontFamily).toContain('Segoe UI')
        expect(result.current.readerStyleConfig).toMatchObject({
            bgColor: '#101010',
            fontSize: 22,
            lineHeight: 1.6,
            pageWidth: 3,
            textAlign: 'justify',
            textColor: '#f5f5f5',
            textIndentEm: 2,
        })
    })

    it('PDF 深色主题会打开 PDF dark mode 标记', () => {
        const { result } = renderHook(() => useReaderAppearance({
            ...baseSettings,
            themeId: 'dark',
        }, 'pdf'))

        expect(result.current.readerStyleConfig.isPdfDarkMode).toBe(true)
    })
})
