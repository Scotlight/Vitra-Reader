import { db } from '@/services/storageService'
import {
    getPlatformCapabilities,
    safeStorageDecrypt,
    safeStorageEncrypt,
    safeStorageIsAvailable,
} from '@/services/platform/platformBridge'
import type { TranslateConfig } from './translateTypes'
import { DEFAULT_TRANSLATE_CONFIG, normalizeConfig } from './translateTypes'

const TRANSLATE_CONFIG_KEY = 'translate:config'
const TRANSLATE_CONFIG_LEGACY_KEY = 'translateConfig'
const API_KEY_FIELDS = ['deeplApiKey', 'openaiApiKey'] as const

interface SaveTranslateConfigOptions {
    allowInsecureKeyStorage?: boolean
}

async function transformApiKeys(
    config: Record<string, unknown>,
    transform: (value: string) => Promise<string>,
): Promise<Record<string, unknown>> {
    const copy = { ...config }
    for (const field of API_KEY_FIELDS) {
        const value = copy[field]
        if (typeof value === 'string' && value.length > 0) {
            copy[field] = await transform(value)
        }
    }
    return copy
}

async function encryptApiKeys(config: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (!getPlatformCapabilities().canSafeStorage) return config
    return transformApiKeys(config, safeStorageEncrypt)
}

function removePersistedApiKeys(config: Record<string, unknown>): Record<string, unknown> {
    const copy = { ...config }
    for (const field of API_KEY_FIELDS) {
        if (typeof copy[field] === 'string' && copy[field].length > 0) {
            delete copy[field]
        }
    }
    return copy
}

async function prepareApiKeysForStorage(
    config: Record<string, unknown>,
    options: SaveTranslateConfigOptions,
): Promise<Record<string, unknown>> {
    const safeStorageAvailable = await safeStorageIsAvailable()
    const canTransformApiKeys = getPlatformCapabilities().canSafeStorage
    if (safeStorageAvailable || (options.allowInsecureKeyStorage && canTransformApiKeys)) {
        return encryptApiKeys(config)
    }
    return removePersistedApiKeys(config)
}

async function decryptApiKeys(config: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (!getPlatformCapabilities().canSafeStorage) return config
    return transformApiKeys(config, safeStorageDecrypt)
}

export async function loadTranslateConfig(): Promise<TranslateConfig> {
    let entry = await db.settings.get(TRANSLATE_CONFIG_KEY)
    if (!entry) {
        const legacy = await db.settings.get(TRANSLATE_CONFIG_LEGACY_KEY)
        if (legacy) {
            try {
                await db.settings.put({ key: TRANSLATE_CONFIG_KEY, value: legacy.value })
                await db.settings.delete(TRANSLATE_CONFIG_LEGACY_KEY)
            } catch (error) {
                console.warn('Failed to migrate legacy translate config', error)
            }
            entry = { key: TRANSLATE_CONFIG_KEY, value: legacy.value }
        }
    }
    const value = entry?.value
    if (!value || typeof value !== 'object') return DEFAULT_TRANSLATE_CONFIG
    const decrypted = await decryptApiKeys(value as Record<string, unknown>)
    return normalizeConfig(decrypted as Partial<TranslateConfig>)
}

export async function saveTranslateConfig(
    config: Partial<TranslateConfig>,
    options: SaveTranslateConfigOptions = {},
): Promise<TranslateConfig> {
    const current = await loadTranslateConfig()
    const next = normalizeConfig({ ...current, ...config })
    const stored = await prepareApiKeysForStorage(next as unknown as Record<string, unknown>, options)
    await db.settings.put({ key: TRANSLATE_CONFIG_KEY, value: stored })
    return next
}
