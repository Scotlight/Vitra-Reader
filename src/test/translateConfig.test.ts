import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_TRANSLATE_CONFIG } from '@/services/translate/translateTypes'

const storageMocks = vi.hoisted(() => ({
    settingsGet: vi.fn(),
    settingsPut: vi.fn(),
    settingsDelete: vi.fn(),
}))

vi.mock('@/services/storageService', () => ({
    db: {
        settings: {
            get: storageMocks.settingsGet,
            put: storageMocks.settingsPut,
            delete: storageMocks.settingsDelete,
        },
    },
}))

import { loadTranslateConfig, saveTranslateConfig } from '@/services/translate/translateConfig'

function installElectronApi(api: Partial<Window['electronAPI']>): void {
    Object.defineProperty(window, 'electronAPI', {
        configurable: true,
        value: api,
    })
}

describe('translateConfig', () => {
    beforeEach(() => {
        storageMocks.settingsGet.mockResolvedValue(undefined)
        storageMocks.settingsPut.mockResolvedValue(undefined)
        storageMocks.settingsDelete.mockResolvedValue(undefined)
        installElectronApi({})
    })

    afterEach(() => {
        vi.restoreAllMocks()
        storageMocks.settingsGet.mockReset()
        storageMocks.settingsPut.mockReset()
        storageMocks.settingsDelete.mockReset()
        Object.defineProperty(window, 'electronAPI', {
            configurable: true,
            value: undefined,
        })
    })

    it('safeStorage 不可用时默认不把 API key 写入本地', async () => {
        const result = await saveTranslateConfig({ deeplApiKey: 'plain-key' })

        expect(result.deeplApiKey).toBe('plain-key')
        expect(storageMocks.settingsPut).toHaveBeenCalledWith({
            key: 'translate:config',
            value: expect.not.objectContaining({ deeplApiKey: 'plain-key' }),
        })
    })

    it('safeStorage 可用时转换两个 API key 字段且不改非目标字段', async () => {
        const safeStorageEncrypt = vi.fn(async (value: string) => `encrypted:${value}`)
        const safeStorageIsAvailable = vi.fn(async () => true)
        installElectronApi({ safeStorageEncrypt, safeStorageIsAvailable })

        await saveTranslateConfig({
            deeplApiKey: 'deepl-key',
            openaiApiKey: 'openai-key',
            openaiEndpoint: 'https://example.test/v1/chat/completions',
        })

        expect(safeStorageEncrypt).toHaveBeenCalledTimes(2)
        expect(safeStorageIsAvailable).toHaveBeenCalledTimes(1)
        expect(safeStorageEncrypt).toHaveBeenNthCalledWith(1, 'deepl-key')
        expect(safeStorageEncrypt).toHaveBeenNthCalledWith(2, 'openai-key')
        expect(storageMocks.settingsPut).toHaveBeenCalledWith({
            key: 'translate:config',
            value: expect.objectContaining({
                deeplApiKey: 'encrypted:deepl-key',
                openaiApiKey: 'encrypted:openai-key',
                openaiEndpoint: 'https://example.test/v1/chat/completions',
            }),
        })
    })

    it('safeStorage 不可用但显式允许时才保存混淆后的 API key', async () => {
        const safeStorageEncrypt = vi.fn(async (value: string) => `ob1:${value}`)
        const safeStorageIsAvailable = vi.fn(async () => false)
        installElectronApi({ safeStorageEncrypt, safeStorageIsAvailable })

        await saveTranslateConfig({ deeplApiKey: 'plain-key' }, { allowInsecureKeyStorage: true })

        expect(safeStorageIsAvailable).toHaveBeenCalledTimes(1)
        expect(safeStorageEncrypt).toHaveBeenCalledWith('plain-key')
        expect(storageMocks.settingsPut).toHaveBeenCalledWith({
            key: 'translate:config',
            value: expect.objectContaining({ deeplApiKey: 'ob1:plain-key' }),
        })
    })

    it('保存时跳过空字符串和非字符串 API key 字段', async () => {
        const safeStorageEncrypt = vi.fn(async (value: string) => `encrypted:${value}`)
        const safeStorageIsAvailable = vi.fn(async () => true)
        installElectronApi({ safeStorageEncrypt, safeStorageIsAvailable })

        await saveTranslateConfig({
            deeplApiKey: '',
            openaiApiKey: 42 as unknown as string,
        })

        expect(safeStorageEncrypt).not.toHaveBeenCalled()
        expect(storageMocks.settingsPut).toHaveBeenCalledWith({
            key: 'translate:config',
            value: expect.objectContaining({
                deeplApiKey: '',
                openaiApiKey: 42,
            }),
        })
    })

    it('legacy 配置迁移失败时继续返回已读取配置', async () => {
        const warningSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
        storageMocks.settingsGet.mockImplementation(async (key: string) => {
            if (key === 'translate:config') return undefined
            if (key === 'translateConfig') {
                return {
                    key,
                    value: { ...DEFAULT_TRANSLATE_CONFIG, targetLang: 'ja' },
                }
            }
            return undefined
        })
        storageMocks.settingsPut.mockRejectedValueOnce(new Error('quota exceeded'))

        const result = await loadTranslateConfig()

        expect(result.targetLang).toBe('ja')
        expect(storageMocks.settingsDelete).not.toHaveBeenCalled()
        expect(warningSpy).toHaveBeenCalled()
    })

    it('主保存路径失败时继续向调用方抛错', async () => {
        storageMocks.settingsPut.mockRejectedValueOnce(new Error('write failed'))

        await expect(saveTranslateConfig({ targetLang: 'ja' })).rejects.toThrow('write failed')
    })
})
