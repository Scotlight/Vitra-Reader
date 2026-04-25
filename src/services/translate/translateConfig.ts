import { db } from '../storageService'
import type { TranslateConfig } from './translateTypes'
import { DEFAULT_TRANSLATE_CONFIG, normalizeConfig } from './translateTypes'

const TRANSLATE_CONFIG_KEY = 'translate:config'
const TRANSLATE_CONFIG_LEGACY_KEY = 'translateConfig'
const API_KEY_FIELDS = ['deeplApiKey', 'openaiApiKey', 'geminiApiKey', 'claudeApiKey'] as const

async function encryptApiKeys(config: Record<string, unknown>): Promise<Record<string, unknown>> {
    const api = window.electronAPI
    if (!api?.safeStorageEncrypt) return config
    const copy = { ...config }
    for (const field of API_KEY_FIELDS) {
        const value = copy[field]
        if (typeof value === 'string' && value.length > 0) {
            copy[field] = await api.safeStorageEncrypt(value)
        }
    }
    return copy
}

async function decryptApiKeys(config: Record<string, unknown>): Promise<Record<string, unknown>> {
    const api = window.electronAPI
    if (!api?.safeStorageDecrypt) return config
    const copy = { ...config }
    for (const field of API_KEY_FIELDS) {
        const value = copy[field]
        if (typeof value === 'string' && value.length > 0) {
            copy[field] = await api.safeStorageDecrypt(value)
        }
    }
    return copy
}

export async function loadTranslateConfig(): Promise<TranslateConfig> {
    let entry = await db.settings.get(TRANSLATE_CONFIG_KEY)
    if (!entry) {
        const legacy = await db.settings.get(TRANSLATE_CONFIG_LEGACY_KEY)
        if (legacy) {
            await db.settings.put({ key: TRANSLATE_CONFIG_KEY, value: legacy.value })
            await db.settings.delete(TRANSLATE_CONFIG_LEGACY_KEY)
            entry = { key: TRANSLATE_CONFIG_KEY, value: legacy.value }
        }
    }
    const value = entry?.value
    if (!value || typeof value !== 'object') return DEFAULT_TRANSLATE_CONFIG
    const decrypted = await decryptApiKeys(value as Record<string, unknown>)
    return normalizeConfig(decrypted as Partial<TranslateConfig>)
}

export async function saveTranslateConfig(config: Partial<TranslateConfig>): Promise<TranslateConfig> {
    const current = await loadTranslateConfig()
    const next = normalizeConfig({ ...current, ...config })
    const encrypted = await encryptApiKeys(next as unknown as Record<string, unknown>)
    await db.settings.put({ key: TRANSLATE_CONFIG_KEY, value: encrypted })
    return next
}
