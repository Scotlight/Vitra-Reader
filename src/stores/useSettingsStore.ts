import { create } from 'zustand'
import { db } from '@/services/storageService'

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
    paragraphIndentEnabled: boolean
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
    loadPersistedSettings: () => Promise<void>
}

const SETTINGS_DB_KEY = 'settings:readerSettings'
const SAVED_COLORS_DB_KEY = 'settings:savedColors'

function persistSettings(settings: ReaderSettings): void {
    // fire-and-forget：持久化失败不影响当前会话，下次启动会重新使用默认值
    db.settings.put({ key: SETTINGS_DB_KEY, value: settings }).catch(() => {})
}

function persistSavedColors(textColors: string[], bgColors: string[]): void {
    // fire-and-forget：持久化失败不影响当前会话
    db.settings.put({ key: SAVED_COLORS_DB_KEY, value: { textColors, bgColors } }).catch(() => {})
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
    paragraphIndentEnabled: false,
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
        set((state) => {
            const next = { ...state, [key]: value }
            const settings = Object.fromEntries(
                (Object.keys(DEFAULT_SETTINGS) as (keyof ReaderSettings)[]).map(k => [k, next[k]])
            ) as unknown as ReaderSettings
            persistSettings(settings)
            return next
        }),

    addSavedColor: (type, color) =>
        set((state) => {
            const key = type === 'text' ? 'savedTextColors' : 'savedBgColors'
            const existing = state[key]
            const filtered = existing.filter(c => c.toLowerCase() !== color.toLowerCase())
            const updated = [color, ...filtered].slice(0, 6)
            const next = { ...state, [key]: updated }
            persistSavedColors(
                type === 'text' ? updated : next.savedTextColors,
                type === 'bg' ? updated : next.savedBgColors,
            )
            return next
        }),

    resetToDefaults: () => {
        persistSettings(DEFAULT_SETTINGS)
        set(DEFAULT_SETTINGS)
    },

    loadPersistedSettings: async () => {
        try {
            const [settingsRow, colorsRow] = await Promise.all([
                db.settings.get(SETTINGS_DB_KEY),
                db.settings.get(SAVED_COLORS_DB_KEY),
            ])
            const patch: Partial<SettingsStore> = {}
            if (settingsRow?.value && typeof settingsRow.value === 'object') {
                const saved = settingsRow.value as Partial<ReaderSettings>
                const validKeys = Object.keys(DEFAULT_SETTINGS) as (keyof ReaderSettings)[]
                const filtered = Object.fromEntries(
                    validKeys.filter((k) => k in saved).map((k) => [k, saved[k]])
                ) as Partial<ReaderSettings>
                Object.assign(patch, filtered)
            }
            if (colorsRow?.value && typeof colorsRow.value === 'object') {
                const saved = colorsRow.value as { textColors?: string[]; bgColors?: string[] }
                if (Array.isArray(saved.textColors)) patch.savedTextColors = saved.textColors
                if (Array.isArray(saved.bgColors)) patch.savedBgColors = saved.bgColors
            }
            if (Object.keys(patch).length > 0) set(patch)
        } catch {
            // 读取失败不影响正常流程，使用默认值
        }
    },
}))
