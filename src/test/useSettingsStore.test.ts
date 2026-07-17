import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const storageMocks = vi.hoisted(() => ({
    settingsGet: vi.fn(),
    settingsPut: vi.fn(),
}))

vi.mock('@/services/storageService', () => ({
    db: {
        settings: {
            get: storageMocks.settingsGet,
            put: storageMocks.settingsPut,
        },
    },
}))

import { useSettingsStore } from '@/stores/useSettingsStore'

const initialState = useSettingsStore.getInitialState()

function settlePersistence(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0))
}

describe('useSettingsStore', () => {
    beforeEach(async () => {
        storageMocks.settingsGet.mockResolvedValue(undefined)
        storageMocks.settingsPut.mockResolvedValue(undefined)
        useSettingsStore.setState(initialState, true)
        useSettingsStore.getState().updateSetting('fontSize', initialState.fontSize)
        useSettingsStore.getState().addSavedColor('text', '#000000')
        await settlePersistence()
        useSettingsStore.setState(initialState, true)
        storageMocks.settingsPut.mockClear()
    })

    afterEach(() => {
        vi.restoreAllMocks()
        storageMocks.settingsGet.mockReset()
        storageMocks.settingsPut.mockReset()
    })

    it('settings 持久化失败时记录警告并设置错误态', async () => {
        const error = new Error('quota exceeded')
        const warningSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
        storageMocks.settingsPut.mockRejectedValueOnce(error)

        useSettingsStore.getState().updateSetting('fontSize', 24)
        await settlePersistence()

        expect(warningSpy).toHaveBeenCalledWith('[settings] 持久化失败', error)
        expect(useSettingsStore.getState().persistenceError).toBe(true)
    })

    it('保存颜色持久化失败时记录警告并设置错误态', async () => {
        const error = new Error('write failed')
        const warningSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
        storageMocks.settingsPut.mockRejectedValueOnce(error)

        useSettingsStore.getState().addSavedColor('text', '#112233')
        await settlePersistence()

        expect(warningSpy).toHaveBeenCalledWith('[settings] 保存颜色持久化失败', error)
        expect(useSettingsStore.getState().persistenceError).toBe(true)
    })

    it('持久化成功时不记录警告并清除错误态', async () => {
        const warningSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
        useSettingsStore.setState({ persistenceError: true })
        storageMocks.settingsPut.mockResolvedValueOnce(undefined)

        useSettingsStore.getState().updateSetting('fontSize', 26)
        await settlePersistence()

        expect(warningSpy).not.toHaveBeenCalled()
        expect(useSettingsStore.getState().persistenceError).toBe(false)
    })

    it('界面外观四项写入后可被 loadPersistedSettings 还原', async () => {
        useSettingsStore.getState().updateSetting('uiRoundness', 24)
        useSettingsStore.getState().updateSetting('uiBlurStrength', 40)
        useSettingsStore.getState().updateSetting('uiOpacity', 0.4)
        useSettingsStore.getState().updateSetting('uiMaterial', 'acrylic')
        await settlePersistence()

        const lastPut = storageMocks.settingsPut.mock.calls.at(-1)?.[0] as {
            value: {
                uiRoundness: number
                uiBlurStrength: number
                uiOpacity: number
                uiMaterial: string
            }
        }
        expect(lastPut.value.uiRoundness).toBe(24)
        expect(lastPut.value.uiBlurStrength).toBe(40)
        expect(lastPut.value.uiOpacity).toBe(0.4)
        expect(lastPut.value.uiMaterial).toBe('acrylic')

        useSettingsStore.setState(initialState, true)
        storageMocks.settingsGet.mockImplementation(async (key: string) => {
            if (key === 'settings:readerSettings') {
                return {
                    key,
                    value: {
                        ...initialState,
                        uiRoundness: 24,
                        uiBlurStrength: 40,
                        uiOpacity: 0.4,
                        uiMaterial: 'acrylic',
                    },
                }
            }
            return undefined
        })

        await useSettingsStore.getState().loadPersistedSettings()

        const restored = useSettingsStore.getState()
        expect(restored.uiRoundness).toBe(24)
        expect(restored.uiBlurStrength).toBe(40)
        expect(restored.uiOpacity).toBe(0.4)
        expect(restored.uiMaterial).toBe('acrylic')
    })
})
