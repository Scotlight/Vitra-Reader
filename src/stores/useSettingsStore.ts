import { create } from 'zustand'

export type PageTurnMode = 'paginated-single' | 'paginated-double' | 'scrolled-continuous'
export type UIMaterial = 'default' | 'mica' | 'acrylic'

export interface ReaderSettings {
    // Theme
    themeId: string
    customBgColor: string | null
    customTextColor: string | null

    // Typography
    fontFamily: string
    fontSize: number
    fontWeight: 'normal' | 'bold'

    // Spacing
    lineHeight: number
    paragraphSpacing: number
    letterSpacing: number
    pageWidth: number
    brightness: number
    textAlign: 'left' | 'justify' | 'center'
    headerHeight: number
    footerHeight: number
    showFooterProgress: boolean
    showFooterChapter: boolean
    showFooterTime: boolean

    // Page Turn
    pageTurnMode: PageTurnMode
    pageTurnAnimation: 'slide' | 'fade' | 'none'

    // UI Appearance
    uiMaterial: UIMaterial
    uiBlurStrength: number
    uiOpacity: number
    uiRoundness: number
    uiAnimation: boolean
}

interface SettingsStore extends ReaderSettings {
    updateSetting: <K extends keyof ReaderSettings>(key: K, value: ReaderSettings[K]) => void
    resetToDefaults: () => void
}

const DEFAULT_SETTINGS: ReaderSettings = {
    themeId: 'light',
    customBgColor: null,
    customTextColor: null,
    fontFamily: 'Segoe UI',
    fontSize: 22,
    fontWeight: 'normal',
    lineHeight: 1.6,
    paragraphSpacing: 23,
    letterSpacing: 3,
    pageWidth: 3,
    brightness: 1,
    textAlign: 'left',
    headerHeight: 48,
    footerHeight: 32,
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
}

export const useSettingsStore = create<SettingsStore>((set) => ({
    ...DEFAULT_SETTINGS,

    updateSetting: (key, value) =>
        set((state) => ({ ...state, [key]: value })),

    resetToDefaults: () =>
        set(DEFAULT_SETTINGS),
}))
