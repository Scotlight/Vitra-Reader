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

    // Continuous Scroll (SmoothScroll-like)
    smoothScrollEnabled: boolean
    smoothStepSizePx: number
    smoothAnimationTimeMs: number
    smoothAccelerationDeltaMs: number
    smoothAccelerationMax: number
    smoothTailToHeadRatio: number
    smoothAnimationEasing: boolean
    smoothReverseWheelDirection: boolean

    // UI Appearance
    uiMaterial: UIMaterial
    uiBlurStrength: number
    uiOpacity: number
    uiRoundness: number
    uiAnimation: boolean
}

interface SettingsStore extends ReaderSettings {
    savedTextColors: string[]
    savedBgColors: string[]
    updateSetting: <K extends keyof ReaderSettings>(key: K, value: ReaderSettings[K]) => void
    addSavedColor: (type: 'text' | 'bg', color: string) => void
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
    smoothScrollEnabled: true,
    smoothStepSizePx: 120,
    smoothAnimationTimeMs: 360,
    smoothAccelerationDeltaMs: 70,
    smoothAccelerationMax: 7,
    smoothTailToHeadRatio: 3,
    smoothAnimationEasing: true,
    smoothReverseWheelDirection: false,
    uiMaterial: 'mica',
    uiBlurStrength: 20,
    uiOpacity: 0.85,
    uiRoundness: 8,
    uiAnimation: true,
}

export const useSettingsStore = create<SettingsStore>((set) => ({
    ...DEFAULT_SETTINGS,
    savedTextColors: [],
    savedBgColors: [],

    updateSetting: (key, value) =>
        set((state) => ({ ...state, [key]: value })),

    addSavedColor: (type, color) =>
        set((state) => {
            const key = type === 'text' ? 'savedTextColors' : 'savedBgColors'
            const existing = state[key]
            const filtered = existing.filter(c => c.toLowerCase() !== color.toLowerCase())
            return { ...state, [key]: [color, ...filtered].slice(0, 6) }
        }),

    resetToDefaults: () =>
        set(DEFAULT_SETTINGS),
}))
