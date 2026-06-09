import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TranslateSettingsTab } from '@/components/Library/settingsPanel/TranslateSettingsTab'
import type { TranslateConfig } from '@/services/translateService'

const translateMocks = vi.hoisted(() => {
    const loadedConfig: TranslateConfig = {
        provider: 'openai',
        sourceLang: 'auto',
        targetLang: 'zh-CN',
        cacheEnabled: true,
        cacheTtlHours: 168,
        cacheMaxEntries: 400,
        deeplApiKey: '',
        deeplEndpoint: 'https://api-free.deepl.com/v2/translate',
        openaiApiKey: 'stored-openai-key',
        openaiEndpoint: 'https://api.openai.com/v1/chat/completions',
        openaiModel: 'gpt-4o-mini',
        ollamaEndpoint: 'http://127.0.0.1:11434/v1/chat/completions',
        ollamaModel: 'qwen2.5:7b',
        deeplxEndpoint: 'http://127.0.0.1:1188/translate',
    }
    return {
        clearTranslationCache: vi.fn(),
        loadTranslateConfig: vi.fn(),
        loadedConfig,
        saveTranslateConfig: vi.fn(),
        translateText: vi.fn(),
    }
})

vi.mock('@/services/translateService', () => ({
    DEFAULT_TRANSLATE_CONFIG: translateMocks.loadedConfig,
    clearTranslationCache: translateMocks.clearTranslationCache,
    getProviderLabel: (provider: string) => provider,
    loadTranslateConfig: translateMocks.loadTranslateConfig,
    saveTranslateConfig: translateMocks.saveTranslateConfig,
    translateText: translateMocks.translateText,
}))

function installElectronApi(api: Partial<Window['electronAPI']>): void {
    Object.defineProperty(window, 'electronAPI', {
        configurable: true,
        value: api,
    })
}

describe('TranslateSettingsTab', () => {
    beforeEach(() => {
        translateMocks.loadTranslateConfig.mockResolvedValue(translateMocks.loadedConfig)
        translateMocks.saveTranslateConfig.mockResolvedValue(translateMocks.loadedConfig)
        translateMocks.translateText.mockResolvedValue({
            ok: true,
            translatedText: '你好',
            provider: 'openai',
            fromCache: false,
        })
        installElectronApi({ safeStorageIsAvailable: vi.fn(async () => false) })
    })

    afterEach(() => {
        cleanup()
        vi.restoreAllMocks()
        translateMocks.clearTranslationCache.mockReset()
        translateMocks.loadTranslateConfig.mockReset()
        translateMocks.saveTranslateConfig.mockReset()
        translateMocks.translateText.mockReset()
        Object.defineProperty(window, 'electronAPI', {
            configurable: true,
            value: undefined,
        })
    })

    it('safeStorage 不可用且存在 API key 时显示风险开关，勾选后允许不安全保存', async () => {
        const { findByText, getByRole } = render(<TranslateSettingsTab />)

        await findByText('当前系统无法安全保存 API Key，默认不写入本地。')

        fireEvent.click(getByRole('checkbox', { name: '我了解风险，仍在本地保存' }))
        fireEvent.click(getByRole('button', { name: '保存翻译配置' }))

        await waitFor(() => {
            expect(translateMocks.saveTranslateConfig).toHaveBeenCalledWith(
                expect.objectContaining({ openaiApiKey: 'stored-openai-key' }),
                { allowInsecureKeyStorage: true },
            )
        })
    })

    it('切换 provider 后显示对应 Provider 字段', async () => {
        const { findByDisplayValue, getByLabelText, getByText, queryByText } = render(<TranslateSettingsTab />)

        await findByDisplayValue('stored-openai-key')
        fireEvent.change(getByLabelText('翻译 Provider'), { target: { value: 'ollama' } })

        expect(getByText('Ollama Endpoint')).toBeTruthy()
        expect(getByText('Ollama Model')).toBeTruthy()
        expect(queryByText('OpenAI兼容 API Key')).toBeNull()
    })

    it('缓存开关和缓存 stepper 会写入保存配置', async () => {
        const { findByDisplayValue, getByRole } = render(<TranslateSettingsTab />)

        await findByDisplayValue('stored-openai-key')
        fireEvent.click(getByRole('switch', { name: '启用本地翻译缓存' }))
        fireEvent.click(getByRole('button', { name: '缓存时长增加' }))
        fireEvent.click(getByRole('button', { name: '缓存上限增加' }))
        fireEvent.click(getByRole('button', { name: '保存翻译配置' }))

        await waitFor(() => {
            expect(translateMocks.saveTranslateConfig).toHaveBeenCalledWith(
                expect.objectContaining({
                    cacheEnabled: false,
                    cacheTtlHours: 169,
                    cacheMaxEntries: 450,
                }),
                { allowInsecureKeyStorage: false },
            )
        })
    })
})
