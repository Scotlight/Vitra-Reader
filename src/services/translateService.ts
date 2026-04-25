export type { TranslateProvider, TranslateConfig, TranslateResult } from './translate/translateTypes'
export { DEFAULT_TRANSLATE_CONFIG, ensureProvider, normalizeConfig } from './translate/translateTypes'
export { loadTranslateConfig, saveTranslateConfig } from './translate/translateConfig'
export { clearTranslationCache } from './translate/translateCache'
import { loadTranslateConfig } from './translate/translateConfig'
import { buildCacheKey, getCached, setCached } from './translate/translateCache'
import { callOpenAICompatible, callDeepL, callClaude, callDeepLX } from './translate/translateEngines'
import { normalizeConfig, ensureProvider } from './translate/translateTypes'
import type { TranslateConfig, TranslateResult, TranslateProvider } from './translate/translateTypes'

export function getProviderLabel(provider: TranslateProvider): string {
    if (provider === 'openai') return 'OpenAI兼容'
    if (provider === 'gemini') return 'Gemini兼容'
    if (provider === 'claude') return 'Claude兼容'
    if (provider === 'ollama') return 'Ollama兼容'
    if (provider === 'deepl') return 'DeepL'
    return 'DeepLX兼容'
}

export async function translateText(text: string, customConfig?: Partial<TranslateConfig>): Promise<TranslateResult> {
    const input = text.trim()
    const requestedProvider = ensureProvider(customConfig?.provider)

    if (!input) return { ok: false, translatedText: '', provider: requestedProvider, fromCache: false, error: '待翻译文本为空' }

    const loaded = await loadTranslateConfig()
    const config = normalizeConfig({ ...loaded, ...customConfig })
    const cacheKey = buildCacheKey(input, config)

    if (config.cacheEnabled) {
        const cached = await getCached(cacheKey)
        if (cached) return { ok: true, translatedText: cached.translatedText, provider: config.provider, fromCache: true }
    }

    let translated = ''
    let error = ''

    if (config.provider === 'openai') {
        const r = await callOpenAICompatible({ text: input, sourceLang: config.sourceLang, targetLang: config.targetLang, endpoint: config.openaiEndpoint, apiKey: config.openaiApiKey, model: config.openaiModel, providerName: 'OpenAI兼容', requireApiKey: true })
        translated = r.text; error = r.error || ''
    } else if (config.provider === 'gemini') {
        const r = await callOpenAICompatible({ text: input, sourceLang: config.sourceLang, targetLang: config.targetLang, endpoint: config.geminiEndpoint, apiKey: config.geminiApiKey, model: config.geminiModel, providerName: 'Gemini兼容', requireApiKey: true })
        translated = r.text; error = r.error || ''
    } else if (config.provider === 'claude') {
        const r = await callClaude(input, config)
        translated = r.text; error = r.error || ''
    } else if (config.provider === 'ollama') {
        const r = await callOpenAICompatible({ text: input, sourceLang: config.sourceLang, targetLang: config.targetLang, endpoint: config.ollamaEndpoint, model: config.ollamaModel, providerName: 'Ollama兼容', requireApiKey: false })
        translated = r.text; error = r.error || ''
    } else if (config.provider === 'deepl') {
        const r = await callDeepL(input, config)
        translated = r.text; error = r.error || ''
    } else {
        const r = await callDeepLX(input, config)
        translated = r.text; error = r.error || ''
    }

    if (!translated) return { ok: false, translatedText: '', provider: config.provider, fromCache: false, error: error || '翻译失败' }

    if (config.cacheEnabled) await setCached(cacheKey, config, input, translated)

    return { ok: true, translatedText: translated, provider: config.provider, fromCache: false }
}
