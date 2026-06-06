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
})
