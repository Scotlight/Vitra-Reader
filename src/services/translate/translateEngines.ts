import type { TranslateConfig } from './translateTypes'

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

function parseJsonOrRaw(data?: string): unknown {
    if (!data) return null
    try { return JSON.parse(data) } catch { return data }
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
        const first = content.find((e) => e && typeof e === 'object' && (e as Record<string, unknown>).type === 'text')
        if (first) {
            const text = (first as Record<string, unknown>).text
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
        const r = part as Record<string, unknown>
        if (r.type === 'text' && typeof r.text === 'string' && r.text.trim()) return r.text.trim()
    }
    return ''
}

function extractDeepLXText(payload: unknown): string {
    if (!payload) return ''
    if (typeof payload === 'string') return payload.trim()
    if (typeof payload !== 'object') return ''
    const r = payload as Record<string, unknown>
    const d = (r.data && typeof r.data === 'object') ? r.data as Record<string, unknown> : null
    for (const v of [r.data, r.translation, r.translatedText, r.text, r.result, d?.translation, d?.translatedText, d?.text, d?.result]) {
        if (typeof v === 'string' && v.trim()) return v.trim()
    }
    return ''
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

export async function callOpenAICompatible(options: {
    text: string; sourceLang: string; targetLang: string
    endpoint: string; apiKey?: string; model: string
    providerName: string; requireApiKey?: boolean
}): Promise<{ text: string; error?: string }> {
    if ((options.requireApiKey ?? true) && !options.apiKey?.trim()) {
        return { text: '', error: `${options.providerName} API Key 未配置` }
    }
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (options.apiKey?.trim()) headers.Authorization = `Bearer ${options.apiKey.trim()}`
    const body = {
        model: options.model, temperature: 0,
        messages: [
            { role: 'system', content: `You are a translation engine. Translate the user text from ${options.sourceLang} to ${options.targetLang}. Return translation only.` },
            { role: 'user', content: options.text },
        ],
    }
    const response = await requestViaMain({ url: options.endpoint, method: 'POST', headers, body: JSON.stringify(body) })
    if (!response.success) return { text: '', error: response.error || `${options.providerName} 请求失败 (${response.status || 'unknown'})` }
    const translated = extractOpenAIText(parseJsonOrRaw(response.data))
    return translated ? { text: translated } : { text: '', error: `${options.providerName} 返回中没有可识别翻译结果` }
}

export async function callDeepL(text: string, config: TranslateConfig): Promise<{ text: string; error?: string }> {
    if (!config.deeplApiKey.trim()) return { text: '', error: 'DeepL API Key 未配置' }
    const params = new URLSearchParams({ auth_key: config.deeplApiKey.trim(), text, target_lang: config.targetLang })
    if (config.sourceLang && config.sourceLang.toLowerCase() !== 'auto') params.set('source_lang', config.sourceLang)
    const response = await requestViaMain({ url: config.deeplEndpoint, method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params.toString() })
    if (!response.success) return { text: '', error: response.error || `DeepL 请求失败 (${response.status || 'unknown'})` }
    const payload = parseJsonOrRaw(response.data)
    if (!payload || typeof payload !== 'object') return { text: '', error: 'DeepL 返回数据异常' }
    const translations = (payload as Record<string, unknown>).translations
    if (!Array.isArray(translations) || !translations[0]) return { text: '', error: 'DeepL 返回中没有翻译结果' }
    const t = (translations[0] as Record<string, unknown>).text
    return typeof t === 'string' && t.trim() ? { text: t.trim() } : { text: '', error: 'DeepL 翻译结果为空' }
}

export async function callClaude(text: string, config: TranslateConfig): Promise<{ text: string; error?: string }> {
    if (!config.claudeApiKey.trim()) return { text: '', error: 'Claude API Key 未配置' }
    const body = { model: config.claudeModel, max_tokens: 1024, system: `Translate user input from ${config.sourceLang} to ${config.targetLang}. Return translation only.`, messages: [{ role: 'user', content: text }] }
    const response = await requestViaMain({ url: config.claudeEndpoint, method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': config.claudeApiKey.trim(), 'anthropic-version': '2023-06-01' }, body: JSON.stringify(body) })
    if (!response.success) return { text: '', error: response.error || `Claude 请求失败 (${response.status || 'unknown'})` }
    const translated = extractClaudeText(parseJsonOrRaw(response.data))
    return translated ? { text: translated } : { text: '', error: 'Claude 返回中没有可识别翻译结果' }
}

export async function callDeepLX(text: string, config: TranslateConfig): Promise<{ text: string; error?: string }> {
    if (!config.deeplxEndpoint.trim()) return { text: '', error: 'DeepLX 接口地址未配置' }
    const rawSrc = (config.sourceLang || 'auto').trim() || 'auto'
    const rawTgt = (config.targetLang || 'zh-CN').trim() || 'zh-CN'
    const normSrc = normalizeDeepLXLang(rawSrc, true)
    const normTgt = normalizeDeepLXLang(rawTgt, false)

    type Attempt = { contentType: 'application/json' | 'application/x-www-form-urlencoded'; body: string; name: string }
    const seen = new Set<string>()
    const attempts: Attempt[] = []
    const add = (a: Attempt) => { const k = `${a.contentType}:${a.body}`; if (!seen.has(k)) { seen.add(k); attempts.push(a) } }

    for (const [s, t] of [[rawSrc, rawTgt], [normSrc, normTgt]]) {
        for (const [sk, tk] of [['source_lang', 'target_lang'], ['source', 'target'], ['from', 'to']]) {
            add({ contentType: 'application/json', body: JSON.stringify({ text, [sk]: s, [tk]: t }), name: 'json' })
            const p = new URLSearchParams({ text, [sk]: s, [tk]: t })
            add({ contentType: 'application/x-www-form-urlencoded', body: p.toString(), name: 'form' })
        }
    }

    let lastError = 'DeepLX 翻译失败'
    for (const attempt of attempts) {
        const response = await requestViaMain({ url: config.deeplxEndpoint, method: 'POST', headers: { 'Content-Type': attempt.contentType }, body: attempt.body })
        if (!response.success) { lastError = `DeepLX 请求失败 (${response.status || 'unknown'}, ${attempt.name})`; continue }
        const translated = extractDeepLXText(parseJsonOrRaw(response.data))
        if (translated) return { text: translated }
        lastError = `DeepLX 返回中没有可识别翻译结果 (${attempt.name})`
    }
    return { text: '', error: lastError }
}
