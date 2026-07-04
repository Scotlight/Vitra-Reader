import { afterEach, describe, expect, it, vi } from 'vitest'
import { callDeepL, callDeepLX, callOpenAICompatible } from '@/services/translate/translateEngines'
import { DEFAULT_TRANSLATE_CONFIG } from '@/services/translate/translateTypes'
import type { TranslateConfig } from '@/services/translate/translateTypes'

function installElectronApi(api: Partial<Window['electronAPI']> | undefined): void {
    Object.defineProperty(window, 'electronAPI', {
        configurable: true,
        value: api,
    })
}

function makeConfig(overrides: Partial<TranslateConfig>): TranslateConfig {
    return { ...DEFAULT_TRANSLATE_CONFIG, ...overrides }
}

function openAiBody(text: string): string {
    return JSON.stringify({ choices: [{ message: { content: text } }] })
}

describe('translateEngines', () => {
    afterEach(() => {
        installElectronApi(undefined)
        vi.unstubAllGlobals()
        vi.clearAllMocks()
    })

    describe('callOpenAICompatible', () => {
        it('API Key 未配置时直接报错不发请求', async () => {
            const translateRequest = vi.fn()
            installElectronApi({ translateRequest })

            const result = await callOpenAICompatible({
                text: 'hello', sourceLang: 'en', targetLang: 'zh',
                endpoint: 'https://api.test/v1/chat/completions', apiKey: '', model: 'gpt-x',
                providerName: 'OpenAI',
            })

            expect(result).toEqual({ text: '', error: 'OpenAI API Key 未配置' })
            expect(translateRequest).not.toHaveBeenCalled()
        })

        it('桌面端经 IPC 请求并提取翻译文本', async () => {
            const translateRequest = vi.fn(async (_payload: unknown) => ({ success: true, status: 200, data: openAiBody(' 你好 ') }))
            installElectronApi({ translateRequest })

            const result = await callOpenAICompatible({
                text: 'hello', sourceLang: 'en', targetLang: 'zh',
                endpoint: 'https://api.test/v1/chat/completions', apiKey: 'sk-1', model: 'gpt-x',
                providerName: 'OpenAI',
            })

            expect(result).toEqual({ text: '你好' })
            expect(translateRequest).toHaveBeenCalledTimes(1)
            const payload = translateRequest.mock.calls[0]?.[0] as {
                url: string; method: string; headers: Record<string, string>; body: string
            }
            expect(payload.url).toBe('https://api.test/v1/chat/completions')
            expect(payload.method).toBe('POST')
            expect(payload.headers.Authorization).toBe('Bearer sk-1')
            const body = JSON.parse(payload.body) as { model: string; messages: { role: string }[] }
            expect(body.model).toBe('gpt-x')
            expect(body.messages).toHaveLength(2)
        })

        it('requireApiKey=false 时无 Key 可调用且不带 Authorization', async () => {
            const translateRequest = vi.fn(async (_payload: unknown) => ({ success: true, status: 200, data: openAiBody('hola') }))
            installElectronApi({ translateRequest })

            const result = await callOpenAICompatible({
                text: 'hello', sourceLang: 'en', targetLang: 'es',
                endpoint: 'https://api.test/v1', apiKey: '', model: 'm',
                providerName: 'Local', requireApiKey: false,
            })

            expect(result).toEqual({ text: 'hola' })
            const payload = translateRequest.mock.calls[0]?.[0] as { headers: Record<string, string> }
            expect(payload.headers.Authorization).toBeUndefined()
        })

        it('无 electronAPI 时走 fetch 直连', async () => {
            const fetchMock = vi.fn(async () => new Response(openAiBody('web result'), { status: 200 }))
            vi.stubGlobal('fetch', fetchMock)

            const result = await callOpenAICompatible({
                text: 'hello', sourceLang: 'en', targetLang: 'zh',
                endpoint: 'https://api.test/v1', apiKey: 'sk-2', model: 'm',
                providerName: 'OpenAI',
            })

            expect(result).toEqual({ text: 'web result' })
            expect(fetchMock).toHaveBeenCalledWith('https://api.test/v1', expect.objectContaining({ method: 'POST' }))
        })

        it('请求失败时返回带引擎前缀的错误', async () => {
            installElectronApi({ translateRequest: vi.fn(async () => ({ success: false, status: 503 })) })

            const result = await callOpenAICompatible({
                text: 'x', sourceLang: 'en', targetLang: 'zh',
                endpoint: 'https://api.test', apiKey: 'k', model: 'm',
                providerName: 'OpenAI',
            })

            expect(result).toEqual({ text: '', error: 'OpenAI 请求失败 (503)' })
        })

        it('响应无可识别结果时报错', async () => {
            installElectronApi({ translateRequest: vi.fn(async () => ({ success: true, status: 200, data: '{}' })) })

            const result = await callOpenAICompatible({
                text: 'x', sourceLang: 'en', targetLang: 'zh',
                endpoint: 'https://api.test', apiKey: 'k', model: 'm',
                providerName: 'OpenAI',
            })

            expect(result).toEqual({ text: '', error: 'OpenAI 返回中没有可识别翻译结果' })
        })
    })

    describe('callDeepL', () => {
        it('API Key 未配置时直接报错', async () => {
            const result = await callDeepL('hello', makeConfig({ deeplApiKey: '' }))
            expect(result).toEqual({ text: '', error: 'DeepL API Key 未配置' })
        })

        it('以表单编码请求并提取翻译', async () => {
            const translateRequest = vi.fn(async (_payload: unknown) => ({
                success: true, status: 200,
                data: JSON.stringify({ translations: [{ text: ' 你好 ' }] }),
            }))
            installElectronApi({ translateRequest })

            const config = makeConfig({
                deeplApiKey: 'dk', deeplEndpoint: 'https://deepl.test/v2/translate',
                sourceLang: 'EN', targetLang: 'ZH',
            })
            const result = await callDeepL('hello', config)

            expect(result).toEqual({ text: '你好' })
            const payload = translateRequest.mock.calls[0]?.[0] as { url: string; headers: Record<string, string>; body: string }
            expect(payload.url).toBe('https://deepl.test/v2/translate')
            expect(payload.headers['Content-Type']).toBe('application/x-www-form-urlencoded')
            const params = new URLSearchParams(payload.body)
            expect(params.get('auth_key')).toBe('dk')
            expect(params.get('text')).toBe('hello')
            expect(params.get('target_lang')).toBe('ZH')
            expect(params.get('source_lang')).toBe('EN')
        })

        it('sourceLang 为 auto 时不携带 source_lang', async () => {
            const translateRequest = vi.fn(async (_payload: unknown) => ({
                success: true, status: 200,
                data: JSON.stringify({ translations: [{ text: 'hi' }] }),
            }))
            installElectronApi({ translateRequest })

            await callDeepL('hello', makeConfig({
                deeplApiKey: 'dk', deeplEndpoint: 'https://deepl.test', sourceLang: 'auto', targetLang: 'ZH',
            }))

            const payload = translateRequest.mock.calls[0]?.[0] as { body: string }
            expect(new URLSearchParams(payload.body).get('source_lang')).toBeNull()
        })
    })

    describe('callDeepLX', () => {
        it('接口地址未配置时直接报错', async () => {
            const result = await callDeepLX('hello', makeConfig({ deeplxEndpoint: '' }))
            expect(result).toEqual({ text: '', error: 'DeepLX 接口地址未配置' })
        })

        it('首个尝试成功即返回翻译', async () => {
            const translateRequest = vi.fn(async () => ({
                success: true, status: 200, data: JSON.stringify({ data: '译文' }),
            }))
            installElectronApi({ translateRequest })

            const result = await callDeepLX('hello', makeConfig({
                deeplxEndpoint: 'https://deeplx.test/translate', sourceLang: 'auto', targetLang: 'zh-CN',
            }))

            expect(result).toEqual({ text: '译文' })
            expect(translateRequest).toHaveBeenCalledTimes(1)
        })

        it('前序尝试失败时穷举参数组合直到成功', async () => {
            const translateRequest = vi.fn()
                .mockResolvedValueOnce({ success: false, status: 404 })
                .mockResolvedValueOnce({ success: false, status: 404 })
                .mockResolvedValueOnce({ success: false, status: 404 })
                .mockResolvedValueOnce({ success: true, status: 200, data: JSON.stringify({ translation: '第四次成功' }) })
            installElectronApi({ translateRequest })

            const result = await callDeepLX('hello', makeConfig({
                deeplxEndpoint: 'https://deeplx.test/translate', sourceLang: 'en', targetLang: 'zh-CN',
            }))

            expect(result).toEqual({ text: '第四次成功' })
            expect(translateRequest).toHaveBeenCalledTimes(4)
        })

        it('全部尝试失败时返回最后一次错误', async () => {
            const translateRequest = vi.fn(async () => ({ success: false, status: 500 }))
            installElectronApi({ translateRequest })

            const result = await callDeepLX('hello', makeConfig({
                deeplxEndpoint: 'https://deeplx.test/translate', sourceLang: 'en', targetLang: 'zh-CN',
            }))

            expect(result.text).toBe('')
            expect(result.error).toContain('DeepLX 请求失败')
            expect(translateRequest.mock.calls.length).toBeGreaterThan(1)
        })
    })
})
