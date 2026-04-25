import { db } from '../storageService'
import type { TranslateConfig } from './translateTypes'

const CACHE_KEY_PREFIX = 'tcache:'

function hashString(input: string): number {
    let hash = 5381
    for (let i = 0; i < input.length; i++) {
        hash = ((hash << 5) + hash) + input.charCodeAt(i)
        hash |= 0
    }
    return hash >>> 0
}

export function buildCacheKey(text: string, config: TranslateConfig): string {
    const fingerprint = [
        config.provider, config.sourceLang, config.targetLang,
        config.openaiModel, config.geminiModel, config.claudeModel, config.ollamaModel,
        config.openaiEndpoint, config.geminiEndpoint, config.claudeEndpoint,
        config.ollamaEndpoint, config.deeplEndpoint, config.deeplxEndpoint,
        text.trim(),
    ].join('|')
    return `${CACHE_KEY_PREFIX}${hashString(fingerprint).toString(16)}`
}

export async function getCached(cacheKey: string) {
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
    const toDelete = await db.translationCache
        .orderBy('lastAccessAt')
        .limit(count - maxEntries)
        .primaryKeys()
    if (toDelete.length) await db.translationCache.bulkDelete(toDelete as string[])
}

export async function setCached(cacheKey: string, config: TranslateConfig, sourceText: string, translatedText: string): Promise<void> {
    const now = Date.now()
    await db.translationCache.put({
        key: cacheKey,
        provider: config.provider,
        sourceLang: config.sourceLang,
        targetLang: config.targetLang,
        sourceText,
        translatedText,
        createdAt: now,
        lastAccessAt: now,
        expiresAt: now + config.cacheTtlHours * 3_600_000,
    })
    await cleanupCache(config.cacheMaxEntries)
}

export async function clearTranslationCache(): Promise<void> {
    await db.translationCache.clear()
}
