import { db, type TranslationCacheEntry } from './storageService'

export type TranslateProvider =
    | 'openai'
    | 'gemini'
    | 'claude'
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

    geminiApiKey: string
    geminiEndpoint: string
    geminiModel: string

    claudeApiKey: string
    claudeEndpoint: string
    claudeModel: string

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

const TRANSLATE_CONFIG_KEY = 'translateConfig'
const CACHE_KEY_PREFIX = 'tcache:'

const VALID_PROVIDERS: TranslateProvider[] = ['openai', 'gemini', 'claude', 'ollama', 'deepl', 'deeplx']

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

    geminiApiKey: '',
    geminiEndpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    geminiModel: 'gemini-2.0-flash',

    claudeApiKey: '',
    claudeEndpoint: 'https://api.anthropic.com/v1/messages',
    claudeModel: 'claude-3-5-sonnet-latest',

    ollamaEndpoint: 'http://127.0.0.1:11434/v1/chat/completions',
    ollamaModel: 'qwen2.5:7b',

    deeplxEndpoint: 'http://127.0.0.1:1188/translate',
}

function hashString(input: string): string {
    let hash = 5381
    for (let index = 0; index < input.length; index += 1) {
        hash = ((hash << 5) + hash) + input.charCodeAt(index)
        hash |= 0
    }
    return (hash >>> 0).toString(16)
}

function ensureProvider(provider: unknown): TranslateProvider {
    if (typeof provider === 'string' && VALID_PROVIDERS.includes(provider as TranslateProvider)) {
        return provider as TranslateProvider
    }
    return 'openai'
}

function normalizeConfig(partial?: Partial<TranslateConfig>): TranslateConfig {
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

        geminiApiKey: partial?.geminiApiKey || '',
        geminiEndpoint: (partial?.geminiEndpoint || DEFAULT_TRANSLATE_CONFIG.geminiEndpoint).trim(),
        geminiModel: (partial?.geminiModel || DEFAULT_TRANSLATE_CONFIG.geminiModel).trim() || DEFAULT_TRANSLATE_CONFIG.geminiModel,

        claudeApiKey: partial?.claudeApiKey || '',
        claudeEndpoint: (partial?.claudeEndpoint || DEFAULT_TRANSLATE_CONFIG.claudeEndpoint).trim(),
        claudeModel: (partial?.claudeModel || DEFAULT_TRANSLATE_CONFIG.claudeModel).trim() || DEFAULT_TRANSLATE_CONFIG.claudeModel,

        ollamaEndpoint: (partial?.ollamaEndpoint || DEFAULT_TRANSLATE_CONFIG.ollamaEndpoint).trim(),
        ollamaModel: (partial?.ollamaModel || DEFAULT_TRANSLATE_CONFIG.ollamaModel).trim() || DEFAULT_TRANSLATE_CONFIG.ollamaModel,

        deeplxEndpoint: (partial?.deeplxEndpoint || DEFAULT_TRANSLATE_CONFIG.deeplxEndpoint).trim(),
    }
}

export async function loadTranslateConfig(): Promise<TranslateConfig> {
    const entry = await db.settings.get(TRANSLATE_CONFIG_KEY)
    const value = entry?.value
    if (!value || typeof value !== 'object') return DEFAULT_TRANSLATE_CONFIG
    return normalizeConfig(value as Partial<TranslateConfig>)
}

export async function saveTranslateConfig(config: Partial<TranslateConfig>): Promise<TranslateConfig> {
    const current = await loadTranslateConfig()
    const next = normalizeConfig({ ...current, ...config })
    await db.settings.put({ key: TRANSLATE_CONFIG_KEY, value: next })
    return next
}

function buildCacheKey(text: string, config: TranslateConfig): string {
    const fingerprint = [
        config.provider,
        config.sourceLang,
        config.targetLang,
        config.openaiModel,
        config.geminiModel,
        config.claudeModel,
        config.ollamaModel,
        config.openaiEndpoint,
        config.geminiEndpoint,
        config.claudeEndpoint,
        config.ollamaEndpoint,
        config.deeplEndpoint,
        config.deeplxEndpoint,
        text.trim(),
    ].join('|')
    return `${CACHE_KEY_PREFIX}${hashString(fingerprint)}`
}

async function getCached(cacheKey: string): Promise<TranslationCacheEntry | null> {
    const item = await db.translationCache.get(cacheKey)
    if (!item) return null
    if (item.expiresAt <= Date.now()) {
        await db.translationCache.delete(cacheKey)
        return null
    }
    await db.translationCache.update(cacheKey, { lastAccessAt: Date.now() })
    return item
}

async function cleanupCache(maxEntries: number): Promise<void> {
    const count = await db.translationCache.count()
    if (count <= maxEntries) return
    const removeCount = Math.max(0, count - maxEntries)
    if (removeCount <= 0) return
    const toDelete = await db.translationCache
        .orderBy('lastAccessAt')
        .limit(removeCount)
        .primaryKeys()
    if (!toDelete.length) return
    await db.translationCache.bulkDelete(toDelete as string[])
}

async function setCached(cacheKey: string, config: TranslateConfig, sourceText: string, translatedText: string): Promise<void> {
    const now = Date.now()
    const expiresAt = now + config.cacheTtlHours * 60 * 60 * 1000
    await db.translationCache.put({
        key: cacheKey,
        provider: config.provider,
        sourceLang: config.sourceLang,
        targetLang: config.targetLang,
        sourceText,
        translatedText,
        createdAt: now,
        lastAccessAt: now,
        expiresAt,
    })
    await cleanupCache(config.cacheMaxEntries)
}

export async function clearTranslationCache(): Promise<void> {
    await db.translationCache.clear()
}

function parseJsonOrRaw(data?: string): unknown {
    if (!data) return null
    try {
        return JSON.parse(data)
    } catch {
        return data
    }
}

function extractOpenAIText(payload: unknown): string {
    if (!payload || typeof payload !== 'object') return ''
    const choices = (payload as Record<string, unknown>).choices
    if (!Array.isArray(choices) || !choices[0] || typeof choices[0] !== 'object') return ''
    const message = (choices[0] as Record<string, unknown>).message
    if (!message || typeof message !== 'object') return ''
    const content = (message as Record<string, unknown>).content
    if (typeof content === 'string') return content.trim()
    if (Array.isArray(content)) {
        const firstText = content.find((entry) => entry && typeof entry === 'object' && (entry as Record<string, unknown>).type === 'text')
        if (firstText && typeof firstText === 'object') {
            const text = (firstText as Record<string, unknown>).text
            if (typeof text === 'string') return text.trim()
        }
    }
    return ''
}

function extractClaudeText(payload: unknown): string {
    if (!payload || typeof payload !== 'object') return ''
    const content = (payload as Record<string, unknown>).content
    if (!Array.isArray(content)) return ''
    for (const part of content) {
        if (!part || typeof part !== 'object') continue
        const record = part as Record<string, unknown>
        if (record.type === 'text' && typeof record.text === 'string' && record.text.trim()) {
            return record.text.trim()
        }
    }
    return ''
}

function extractDeepLXText(payload: unknown): string {
    if (!payload) return ''
    if (typeof payload === 'string') return payload.trim()
    if (typeof payload !== 'object') return ''
    const record = payload as Record<string, unknown>
    const dataRecord = (record.data && typeof record.data === 'object') ? record.data as Record<string, unknown> : null
    const candidates = [
        record.data,
        record.translation,
        record.translatedText,
        record.text,
        record.result,
        dataRecord?.translation,
        dataRecord?.translatedText,
        dataRecord?.text,
        dataRecord?.result,
    ]
    for (const candidate of candidates) {
        if (typeof candidate === 'string' && candidate.trim()) return candidate.trim()
    }
    return ''
}

function normalizeDeepLXLang(lang: string, sourceSide: boolean): string {
    const value = (lang || '').trim()
    if (!value) return sourceSide ? 'auto' : 'ZH'

    const lower = value.toLowerCase()
    if (sourceSide && lower === 'auto') return 'auto'

    const map: Record<string, string> = {
        'zh': 'ZH',
        'zh-cn': 'ZH',
        'zh-hans': 'ZH',
        'zh-sg': 'ZH',
        'zh-tw': 'ZH',
        'zh-hk': 'ZH',
        'zh-hant': 'ZH',
        'en': 'EN',
        'en-us': 'EN',
        'en-gb': 'EN',
        'ja': 'JA',
        'ko': 'KO',
        'fr': 'FR',
        'de': 'DE',
        'ru': 'RU',
        'es': 'ES',
        'pt': 'PT',
        'it': 'IT',
    }

    if (map[lower]) return map[lower]

    const base = lower.split('-')[0]
    if (map[base]) return map[base]
    return base.toUpperCase()
}

async function requestViaMain(payload: {
    url: string
    method?: 'GET' | 'POST'
    headers?: Record<string, string>
    body?: string
}): Promise<{ success: boolean; status?: number; data?: string; error?: string }> {
    if (window.electronAPI?.translateRequest) return window.electronAPI.translateRequest(payload)

    const response = await fetch(payload.url, {
        method: payload.method || 'POST',
        headers: payload.headers,
        body: payload.body,
    })
    const data = await response.text()
    if (!response.ok) return { success: false, status: response.status, data, error: `HTTP ${response.status}` }
    return { success: true, status: response.status, data }
}

async function callOpenAICompatible(options: {
    text: string
    sourceLang: string
    targetLang: string
    endpoint: string
    apiKey?: string
    model: string
    providerName: string
    requireApiKey?: boolean
}): Promise<{ text: string; error?: string }> {
    const requireApiKey = options.requireApiKey ?? true
    if (requireApiKey && !options.apiKey?.trim()) {
        return { text: '', error: `${options.providerName} API Key 未配置` }
    }

    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
    }
    if (options.apiKey?.trim()) {
        headers.Authorization = `Bearer ${options.apiKey.trim()}`
    }

    const body = {
        model: options.model,
        temperature: 0,
        messages: [
            {
                role: 'system',
                content: `You are a translation engine. Translate the user text from ${options.sourceLang} to ${options.targetLang}. Return translation only.`,
            },
            { role: 'user', content: options.text },
        ],
    }

    const response = await requestViaMain({
        url: options.endpoint,
        method: 'POST',
        headers,
        body: JSON.stringify(body),
    })

    if (!response.success) {
        return { text: '', error: response.error || `${options.providerName} 请求失败 (${response.status || 'unknown'})` }
    }

    const payload = parseJsonOrRaw(response.data)
    const translated = extractOpenAIText(payload)
    if (!translated) {
        return { text: '', error: `${options.providerName} 返回中没有可识别翻译结果` }
    }
    return { text: translated }
}

async function callDeepL(text: string, config: TranslateConfig): Promise<{ text: string; error?: string }> {
    if (!config.deeplApiKey.trim()) return { text: '', error: 'DeepL API Key 未配置' }

    const params = new URLSearchParams()
    params.set('auth_key', config.deeplApiKey.trim())
    params.set('text', text)
    params.set('target_lang', config.targetLang)
    if (config.sourceLang && config.sourceLang.toLowerCase() !== 'auto') {
        params.set('source_lang', config.sourceLang)
    }

    const response = await requestViaMain({
        url: config.deeplEndpoint,
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
    })

    if (!response.success) return { text: '', error: response.error || `DeepL 请求失败 (${response.status || 'unknown'})` }

    const payload = parseJsonOrRaw(response.data)
    if (!payload || typeof payload !== 'object') return { text: '', error: 'DeepL 返回数据异常' }
    const translations = (payload as Record<string, unknown>).translations
    if (!Array.isArray(translations) || !translations[0] || typeof translations[0] !== 'object') {
        return { text: '', error: 'DeepL 返回中没有翻译结果' }
    }
    const translatedText = (translations[0] as Record<string, unknown>).text
    if (typeof translatedText !== 'string' || !translatedText.trim()) {
        return { text: '', error: 'DeepL 翻译结果为空' }
    }
    return { text: translatedText.trim() }
}

async function callClaude(text: string, config: TranslateConfig): Promise<{ text: string; error?: string }> {
    if (!config.claudeApiKey.trim()) return { text: '', error: 'Claude API Key 未配置' }

    const body = {
        model: config.claudeModel,
        max_tokens: 1024,
        system: `Translate user input from ${config.sourceLang} to ${config.targetLang}. Return translation only.`,
        messages: [{ role: 'user', content: text }],
    }

    const response = await requestViaMain({
        url: config.claudeEndpoint,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': config.claudeApiKey.trim(),
            'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
    })

    if (!response.success) return { text: '', error: response.error || `Claude 请求失败 (${response.status || 'unknown'})` }

    const payload = parseJsonOrRaw(response.data)
    const translated = extractClaudeText(payload)
    if (!translated) return { text: '', error: 'Claude 返回中没有可识别翻译结果' }
    return { text: translated }
}

async function callDeepLX(text: string, config: TranslateConfig): Promise<{ text: string; error?: string }> {
    if (!config.deeplxEndpoint.trim()) return { text: '', error: 'DeepLX 接口地址未配置' }

    const rawSource = (config.sourceLang || 'auto').trim() || 'auto'
    const rawTarget = (config.targetLang || 'zh-CN').trim() || 'zh-CN'
    const normalizedSource = normalizeDeepLXLang(rawSource, true)
    const normalizedTarget = normalizeDeepLXLang(rawTarget, false)

    type DeepLXAttempt = {
        contentType: 'application/json' | 'application/x-www-form-urlencoded'
        body: string
        name: string
    }

    const attempts: DeepLXAttempt[] = []
    const seen = new Set<string>()
    const appendAttempt = (attempt: DeepLXAttempt) => {
        const key = `${attempt.contentType}:${attempt.body}`
        if (seen.has(key)) return
        seen.add(key)
        attempts.push(attempt)
    }

    const jsonPayloads = [
        { text, source_lang: rawSource, target_lang: rawTarget },
        { text, source_lang: normalizedSource, target_lang: normalizedTarget },
        { text, source: rawSource, target: rawTarget },
        { text, source: normalizedSource, target: normalizedTarget },
        { text, from: rawSource, to: rawTarget },
        { text, from: normalizedSource, to: normalizedTarget },
    ]
    for (const payload of jsonPayloads) {
        appendAttempt({
            contentType: 'application/json',
            body: JSON.stringify(payload),
            name: 'json',
        })
    }

    const formPayloads: Array<Array<[string, string]>> = [
        [['text', text], ['source_lang', rawSource], ['target_lang', rawTarget]],
        [['text', text], ['source_lang', normalizedSource], ['target_lang', normalizedTarget]],
        [['text', text], ['source', rawSource], ['target', rawTarget]],
        [['text', text], ['source', normalizedSource], ['target', normalizedTarget]],
        [['text', text], ['from', rawSource], ['to', rawTarget]],
        [['text', text], ['from', normalizedSource], ['to', normalizedTarget]],
    ]

    for (const entries of formPayloads) {
        const params = new URLSearchParams()
        for (const [key, value] of entries) params.set(key, value)
        appendAttempt({
            contentType: 'application/x-www-form-urlencoded',
            body: params.toString(),
            name: 'form',
        })
    }

    let lastError = 'DeepLX 翻译失败'

    for (const attempt of attempts) {
        const response = await requestViaMain({
            url: config.deeplxEndpoint,
            method: 'POST',
            headers: { 'Content-Type': attempt.contentType },
            body: attempt.body,
        })

        if (!response.success) {
            const detail = (response.data || '').trim()
            const detailPreview = detail ? `: ${detail.slice(0, 160)}` : ''
            lastError = `DeepLX 请求失败 (${response.status || 'unknown'}, ${attempt.name})${detailPreview}`
            continue
        }

        const payload = parseJsonOrRaw(response.data)
        const translated = extractDeepLXText(payload)
        if (translated) return { text: translated }

        const rawResponse = (response.data || '').trim()
        const responsePreview = rawResponse ? `: ${rawResponse.slice(0, 160)}` : ''
        lastError = `DeepLX 返回中没有可识别翻译结果 (${attempt.name})${responsePreview}`
    }

    return { text: '', error: lastError }
}

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

    if (!input) {
        return {
            ok: false,
            translatedText: '',
            provider: requestedProvider,
            fromCache: false,
            error: '待翻译文本为空',
        }
    }

    const loaded = await loadTranslateConfig()
    const config = normalizeConfig({ ...loaded, ...customConfig })

    const cacheKey = buildCacheKey(input, config)
    if (config.cacheEnabled) {
        const cached = await getCached(cacheKey)
        if (cached) {
            return {
                ok: true,
                translatedText: cached.translatedText,
                provider: config.provider,
                fromCache: true,
            }
        }
    }

    let translated = ''
    let error = ''

    if (config.provider === 'openai') {
        const result = await callOpenAICompatible({
            text: input,
            sourceLang: config.sourceLang,
            targetLang: config.targetLang,
            endpoint: config.openaiEndpoint,
            apiKey: config.openaiApiKey,
            model: config.openaiModel,
            providerName: 'OpenAI兼容',
            requireApiKey: true,
        })
        translated = result.text
        error = result.error || ''
    } else if (config.provider === 'gemini') {
        const result = await callOpenAICompatible({
            text: input,
            sourceLang: config.sourceLang,
            targetLang: config.targetLang,
            endpoint: config.geminiEndpoint,
            apiKey: config.geminiApiKey,
            model: config.geminiModel,
            providerName: 'Gemini兼容',
            requireApiKey: true,
        })
        translated = result.text
        error = result.error || ''
    } else if (config.provider === 'claude') {
        const result = await callClaude(input, config)
        translated = result.text
        error = result.error || ''
    } else if (config.provider === 'ollama') {
        const result = await callOpenAICompatible({
            text: input,
            sourceLang: config.sourceLang,
            targetLang: config.targetLang,
            endpoint: config.ollamaEndpoint,
            model: config.ollamaModel,
            providerName: 'Ollama兼容',
            requireApiKey: false,
        })
        translated = result.text
        error = result.error || ''
    } else if (config.provider === 'deepl') {
        const result = await callDeepL(input, config)
        translated = result.text
        error = result.error || ''
    } else {
        const result = await callDeepLX(input, config)
        translated = result.text
        error = result.error || ''
    }

    if (!translated) {
        return {
            ok: false,
            translatedText: '',
            provider: config.provider,
            fromCache: false,
            error: error || '翻译失败',
        }
    }

    if (config.cacheEnabled) {
        await setCached(cacheKey, config, input, translated)
    }

    return {
        ok: true,
        translatedText: translated,
        provider: config.provider,
        fromCache: false,
    }
}
