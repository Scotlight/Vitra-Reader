export type TranslateProvider =
    | 'openai'
    | 'ollama'
    | 'deepl'
    | 'deeplx'

export interface TranslateConfig {
    provider: TranslateProvider
    sourceLang: string
    targetLang: string
    cacheEnabled: boolean
    cacheTtlHours: number
    cacheMaxEntries: number

    deeplApiKey: string
    deeplEndpoint: string

    openaiApiKey: string
    openaiEndpoint: string
    openaiModel: string

    ollamaEndpoint: string
    ollamaModel: string

    deeplxEndpoint: string
}

export interface TranslateResult {
    ok: boolean
    translatedText: string
    provider: TranslateProvider
    fromCache: boolean
    error?: string
}

export const VALID_PROVIDERS: TranslateProvider[] = ['openai', 'ollama', 'deepl', 'deeplx']

export const DEFAULT_TRANSLATE_CONFIG: TranslateConfig = {
    provider: 'openai',
    sourceLang: 'auto',
    targetLang: 'zh-CN',
    cacheEnabled: true,
    cacheTtlHours: 24 * 7,
    cacheMaxEntries: 400,

    deeplApiKey: '',
    deeplEndpoint: 'https://api-free.deepl.com/v2/translate',

    openaiApiKey: '',
    openaiEndpoint: 'https://api.openai.com/v1/chat/completions',
    openaiModel: 'gpt-4o-mini',

    ollamaEndpoint: 'http://127.0.0.1:11434/v1/chat/completions',
    ollamaModel: 'qwen2.5:7b',

    deeplxEndpoint: 'http://127.0.0.1:1188/translate',
}

export function ensureProvider(provider: unknown): TranslateProvider {
    if (typeof provider === 'string' && VALID_PROVIDERS.includes(provider as TranslateProvider)) {
        return provider as TranslateProvider
    }
    return 'openai'
}

export function normalizeConfig(partial?: Partial<TranslateConfig>): TranslateConfig {
    return {
        ...DEFAULT_TRANSLATE_CONFIG,
        ...partial,
        provider: ensureProvider(partial?.provider),
        sourceLang: (partial?.sourceLang || DEFAULT_TRANSLATE_CONFIG.sourceLang).trim() || 'auto',
        targetLang: (partial?.targetLang || DEFAULT_TRANSLATE_CONFIG.targetLang).trim() || 'zh-CN',
        cacheEnabled: partial?.cacheEnabled ?? DEFAULT_TRANSLATE_CONFIG.cacheEnabled,
        cacheTtlHours: Math.max(1, Math.min(24 * 365, Number(partial?.cacheTtlHours ?? DEFAULT_TRANSLATE_CONFIG.cacheTtlHours))),
        cacheMaxEntries: Math.max(50, Math.min(5000, Number(partial?.cacheMaxEntries ?? DEFAULT_TRANSLATE_CONFIG.cacheMaxEntries))),

        deeplApiKey: partial?.deeplApiKey || '',
        deeplEndpoint: (partial?.deeplEndpoint || DEFAULT_TRANSLATE_CONFIG.deeplEndpoint).trim(),

        openaiApiKey: partial?.openaiApiKey || '',
        openaiEndpoint: (partial?.openaiEndpoint || DEFAULT_TRANSLATE_CONFIG.openaiEndpoint).trim(),
        openaiModel: (partial?.openaiModel || DEFAULT_TRANSLATE_CONFIG.openaiModel).trim() || DEFAULT_TRANSLATE_CONFIG.openaiModel,

        ollamaEndpoint: (partial?.ollamaEndpoint || DEFAULT_TRANSLATE_CONFIG.ollamaEndpoint).trim(),
        ollamaModel: (partial?.ollamaModel || DEFAULT_TRANSLATE_CONFIG.ollamaModel).trim() || DEFAULT_TRANSLATE_CONFIG.ollamaModel,

        deeplxEndpoint: (partial?.deeplxEndpoint || DEFAULT_TRANSLATE_CONFIG.deeplxEndpoint).trim(),
    }
}
