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
    pinnedSidebarWidth: number
    brightness: number
    textAlign: 'left' | 'justify' | 'center'
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
    savedTextColors: string[]
    savedBgColors: string[]
    persistenceError: boolean
    updateSetting: <K extends keyof ReaderSettings>(key: K, value: ReaderSettings[K]) => void
    addSavedColor: (type: 'text' | 'bg', color: string) => void
    resetToDefaults: () => void
    loadPersistedSettings: () => Promise<void>
}

const SETTINGS_DB_KEY = 'settings:readerSettings'
const SAVED_COLORS_DB_KEY = 'settings:savedColors'
type PersistenceTarget = 'settings' | 'savedColors'

const warnedPersistenceTargets = new Set<PersistenceTarget>()
const failedPersistenceTargets = new Set<PersistenceTarget>()

function warnPersistenceFailureOnce(target: PersistenceTarget, message: string, error: unknown): void {
    if (warnedPersistenceTargets.has(target)) return
    warnedPersistenceTargets.add(target)
    console.warn(message, error)
}

function markPersistenceRecovered(target: PersistenceTarget, setPersistenceError: (failed: boolean) => void): void {
    warnedPersistenceTargets.delete(target)
    failedPersistenceTargets.delete(target)
    setPersistenceError(failedPersistenceTargets.size > 0)
}

function markPersistenceFailed(target: PersistenceTarget, setPersistenceError: (failed: boolean) => void): void {
    failedPersistenceTargets.add(target)
    setPersistenceError(true)
}

function persistSettings(settings: ReaderSettings, setPersistenceError: (failed: boolean) => void): void {
    // fire-and-forget：持久化失败不影响当前会话，下次启动会重新使用默认值
    db.settings.put({ key: SETTINGS_DB_KEY, value: settings })
        .then(() => {
            markPersistenceRecovered('settings', setPersistenceError)
        })
        .catch((error: unknown) => {
            warnPersistenceFailureOnce('settings', '[settings] 持久化失败', error)
            markPersistenceFailed('settings', setPersistenceError)
        })
}

function persistSavedColors(
    textColors: string[],
    bgColors: string[],
    setPersistenceError: (failed: boolean) => void,
): void {
    // fire-and-forget：持久化失败不影响当前会话
    db.settings.put({ key: SAVED_COLORS_DB_KEY, value: { textColors, bgColors } })
        .then(() => {
            markPersistenceRecovered('savedColors', setPersistenceError)
        })
        .catch((error: unknown) => {
            warnPersistenceFailureOnce('savedColors', '[settings] 保存颜色持久化失败', error)
            markPersistenceFailed('savedColors', setPersistenceError)
        })
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
    pinnedSidebarWidth: 360,
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
}

export const useSettingsStore = create<SettingsStore>((set) => {
    const setPersistenceError = (failed: boolean) => set({ persistenceError: failed })

    return {
        ...DEFAULT_SETTINGS,
        savedTextColors: [],
        savedBgColors: [],
        persistenceError: false,

        updateSetting: (key, value) =>
            set((state) => {
                const next = { ...state, [key]: value }
                const settings = Object.fromEntries(
                    (Object.keys(DEFAULT_SETTINGS) as (keyof ReaderSettings)[]).map(k => [k, next[k]])
                ) as unknown as ReaderSettings
                persistSettings(settings, setPersistenceError)
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
                    setPersistenceError,
                )
                return next
            }),

        resetToDefaults: () => {
            persistSettings(DEFAULT_SETTINGS, setPersistenceError)
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
        }
    }
})
