import type { TranslateConfig } from './translateTypes'

// ── HTTP 层 ──────────────────────────────────────────────────────────────────

type HttpResult = { success: boolean; status?: number; data?: string; error?: string }

export async function requestViaMain(payload: {
    url: string
    method?: 'GET' | 'POST'
    headers?: Record<string, string>
    body?: string
}): Promise<HttpResult> {
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

// ── API 响应类型定义 ──────────────────────────────────────────────────────────

interface OpenAIContentBlock { type: string; text?: string }
interface OpenAIMessage { content?: string | OpenAIContentBlock[] }
interface OpenAIChoice { message?: OpenAIMessage }
interface OpenAIResponse { choices?: OpenAIChoice[] }

interface ClaudeContentBlock { type: string; text?: string }
interface ClaudeResponse { content?: ClaudeContentBlock[] }

interface DeepLTranslation { text?: string }
interface DeepLResponse { translations?: DeepLTranslation[] }

// ── 类型守卫 ─────────────────────────────────────────────────────────────────

function isOpenAIResponse(v: unknown): v is OpenAIResponse {
    return !!v && typeof v === 'object' && 'choices' in v
}

function isClaudeResponse(v: unknown): v is ClaudeResponse {
    return !!v && typeof v === 'object' && 'content' in v
}

function isDeepLResponse(v: unknown): v is DeepLResponse {
    return !!v && typeof v === 'object' && 'translations' in v
}

// ── 响应文本提取 ──────────────────────────────────────────────────────────────

function parseJsonOrRaw(data?: string): unknown {
    if (!data) return null
    try { return JSON.parse(data) } catch { return data }
}

function extractOpenAIText(payload: unknown): string {
    if (!isOpenAIResponse(payload)) return ''
    const choice = payload.choices?.[0]
    const content = choice?.message?.content
    if (typeof content === 'string') return content.trim()
    if (Array.isArray(content)) {
        const block = content.find((b) => b.type === 'text' && typeof b.text === 'string')
        if (block?.text) return block.text.trim()
    }
    return ''
}

function extractClaudeText(payload: unknown): string {
    if (!isClaudeResponse(payload)) return ''
    for (const block of payload.content ?? []) {
        if (block.type === 'text' && typeof block.text === 'string' && block.text.trim()) {
            return block.text.trim()
        }
    }
    return ''
}

function extractDeepLText(payload: unknown): string {
    if (!isDeepLResponse(payload)) return ''
    const text = payload.translations?.[0]?.text
    return typeof text === 'string' ? text.trim() : ''
}

function extractDeepLXText(payload: unknown): string {
    if (!payload) return ''
    if (typeof payload === 'string') return payload.trim()
    if (typeof payload !== 'object') return ''
    // DeepLX 兼容多种响应结构，穷举常见字段名
    const r = payload as Record<string, unknown>
    const nested = (r.data && typeof r.data === 'object') ? r.data as Record<string, unknown> : null
    const candidates = [r.data, r.translation, r.translatedText, r.text, r.result,
        nested?.translation, nested?.translatedText, nested?.text, nested?.result]
    for (const v of candidates) {
        if (typeof v === 'string' && v.trim()) return v.trim()
    }
    return ''
}

// ── 公共引擎调用基础层 ────────────────────────────────────────────────────────

type EngineResult = { text: string; error?: string }

async function callEngine(opts: {
    url: string
    headers: Record<string, string>
    body: object
    extract: (payload: unknown) => string
    errorPrefix: string
}): Promise<EngineResult> {
    const response = await requestViaMain({
        url: opts.url,
        method: 'POST',
        headers: opts.headers,
        body: JSON.stringify(opts.body),
    })
    if (!response.success) {
        return { text: '', error: response.error || `${opts.errorPrefix} 请求失败 (${response.status ?? 'unknown'})` }
    }
    const translated = opts.extract(parseJsonOrRaw(response.data))
    return translated
        ? { text: translated }
        : { text: '', error: `${opts.errorPrefix} 返回中没有可识别翻译结果` }
}

// ── 各引擎导出函数 ────────────────────────────────────────────────────────────

export async function callOpenAICompatible(options: {
    text: string; sourceLang: string; targetLang: string
    endpoint: string; apiKey?: string; model: string
    providerName: string; requireApiKey?: boolean
}): Promise<EngineResult> {
    if ((options.requireApiKey ?? true) && !options.apiKey?.trim()) {
        return { text: '', error: `${options.providerName} API Key 未配置` }
    }
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (options.apiKey?.trim()) headers.Authorization = `Bearer ${options.apiKey.trim()}`
    return callEngine({
        url: options.endpoint,
        headers,
        body: {
            model: options.model,
            temperature: 0,
            messages: [
                { role: 'system', content: `You are a translation engine. Translate the user text from ${options.sourceLang} to ${options.targetLang}. Return translation only.` },
                { role: 'user', content: options.text },
            ],
        },
        extract: extractOpenAIText,
        errorPrefix: options.providerName,
    })
}

export async function callDeepL(text: string, config: TranslateConfig): Promise<EngineResult> {
    if (!config.deeplApiKey.trim()) return { text: '', error: 'DeepL API Key 未配置' }
    const params = new URLSearchParams({ auth_key: config.deeplApiKey.trim(), text, target_lang: config.targetLang })
    if (config.sourceLang && config.sourceLang.toLowerCase() !== 'auto') params.set('source_lang', config.sourceLang)
    const response = await requestViaMain({
        url: config.deeplEndpoint,
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
    })
    if (!response.success) return { text: '', error: response.error || `DeepL 请求失败 (${response.status ?? 'unknown'})` }
    const translated = extractDeepLText(parseJsonOrRaw(response.data))
    return translated ? { text: translated } : { text: '', error: 'DeepL 返回中没有可识别翻译结果' }
}

export async function callClaude(text: string, config: TranslateConfig): Promise<EngineResult> {
    if (!config.claudeApiKey.trim()) return { text: '', error: 'Claude API Key 未配置' }
    return callEngine({
        url: config.claudeEndpoint,
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': config.claudeApiKey.trim(),
            'anthropic-version': '2023-06-01',
        },
        body: {
            model: config.claudeModel,
            max_tokens: 1024,
            system: `Translate user input from ${config.sourceLang} to ${config.targetLang}. Return translation only.`,
            messages: [{ role: 'user', content: text }],
        },
        extract: extractClaudeText,
        errorPrefix: 'Claude',
    })
}

function normalizeDeepLXLang(lang: string, sourceSide: boolean): string {
    const lower = (lang || '').trim().toLowerCase()
    if (!lower) return sourceSide ? 'auto' : 'ZH'
    if (sourceSide && lower === 'auto') return 'auto'
    const map: Record<string, string> = {
        'zh': 'ZH', 'zh-cn': 'ZH', 'zh-hans': 'ZH', 'zh-sg': 'ZH',
        'zh-tw': 'ZH', 'zh-hk': 'ZH', 'zh-hant': 'ZH',
        'en': 'EN', 'en-us': 'EN', 'en-gb': 'EN',
        'ja': 'JA', 'ko': 'KO', 'fr': 'FR', 'de': 'DE',
        'ru': 'RU', 'es': 'ES', 'pt': 'PT', 'it': 'IT',
    }
    return map[lower] ?? map[lower.split('-')[0]] ?? lower.split('-')[0].toUpperCase()
}

export async function callDeepLX(text: string, config: TranslateConfig): Promise<EngineResult> {
    if (!config.deeplxEndpoint.trim()) return { text: '', error: 'DeepLX 接口地址未配置' }
    const rawSrc = (config.sourceLang || 'auto').trim() || 'auto'
    const rawTgt = (config.targetLang || 'zh-CN').trim() || 'zh-CN'
    const normSrc = normalizeDeepLXLang(rawSrc, true)
    const normTgt = normalizeDeepLXLang(rawTgt, false)

    type Attempt = { contentType: 'application/json' | 'application/x-www-form-urlencoded'; body: string; name: string }
    const seen = new Set<string>()
    const attempts: Attempt[] = []
    const add = (a: Attempt) => { const k = `${a.contentType}:${a.body}`; if (!seen.has(k)) { seen.add(k); attempts.push(a) } }

    // 穷举参数名和编码格式组合，兼容各种 DeepLX 实现
    for (const [s, t] of [[rawSrc, rawTgt], [normSrc, normTgt]]) {
        for (const [sk, tk] of [['source_lang', 'target_lang'], ['source', 'target'], ['from', 'to']]) {
            add({ contentType: 'application/json', body: JSON.stringify({ text, [sk]: s, [tk]: t }), name: 'json' })
            const p = new URLSearchParams({ text, [sk]: s, [tk]: t })
            add({ contentType: 'application/x-www-form-urlencoded', body: p.toString(), name: 'form' })
        }
    }

    let lastError = 'DeepLX 翻译失败'
    for (const attempt of attempts) {
        const response = await requestViaMain({
            url: config.deeplxEndpoint,
            method: 'POST',
            headers: { 'Content-Type': attempt.contentType },
            body: attempt.body,
        })
        if (!response.success) { lastError = `DeepLX 请求失败 (${response.status ?? 'unknown'}, ${attempt.name})`; continue }
        const translated = extractDeepLXText(parseJsonOrRaw(response.data))
        if (translated) return { text: translated }
        lastError = `DeepLX 返回中没有可识别翻译结果 (${attempt.name})`
    }
    return { text: '', error: lastError }
}
