/**
 * Vitra 解析缓存服务
 *
 * 对应文档 5.1：将 Parser 输出的 sections HTML 压缩后
 * 存入 IndexedDB，再次打开时直接解压跳过格式解析。
 *
 * 压缩：fflate gzip   解压：fflate gunzip
 * Key：`vcache-{hex(md5(buffer))}`
 *
 * 排除格式：PDF / DJVU / CBZ / CBT / CBR / CB7
 * （PDF/DJVU 按页渲染自带缓存，漫画图片已压缩收益低）
 */

import { gzipSync, gunzipSync, strToU8, strFromU8 } from 'fflate'
import { db } from '../../services/storageService'
import type { VitraBookFormat } from '../types/vitraBook'

// ─── 常量 ────────────────────────────────────────────

const CACHE_KEY_PREFIX = 'vcache-'

/** 不缓存的格式集合 */
const SKIP_CACHE_FORMATS = new Set<VitraBookFormat>([
    'PDF', 'DJVU', 'CBZ', 'CBT', 'CBR', 'CB7',
])

// ─── 公共接口 ────────────────────────────────────────

export interface VitraCachedBook {
    /** 章节 HTML 数组（与 sections 索引一一对应） */
    readonly sectionsHtml: readonly string[]
    /** 缓存写入时间戳 */
    readonly cachedAt: number
}

export interface VitraCacheStats {
    readonly hits: number
    readonly misses: number
}

// ─── 内部工具 ────────────────────────────────────────

async function computeBufferHash(buffer: ArrayBuffer): Promise<string> {
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
    const bytes = new Uint8Array(hashBuffer)
    let hex = ''
    for (let i = 0; i < bytes.length; i++) {
        hex += bytes[i].toString(16).padStart(2, '0')
    }
    return hex.slice(0, 32)
}

function buildCacheKey(hash: string): string {
    return `${CACHE_KEY_PREFIX}${hash}`
}

function encodeSections(sectionsHtml: readonly string[]): Uint8Array {
    const json = JSON.stringify(sectionsHtml)
    return gzipSync(strToU8(json))
}

function decodeSections(compressed: Uint8Array): string[] {
    try {
        const json = strFromU8(gunzipSync(compressed))
        const parsed = JSON.parse(json)
        if (!Array.isArray(parsed)) return []
        return parsed as string[]
    } catch {
        return []
    }
}

// ─── 核心类 ──────────────────────────────────────────

export class VitraBookCache {
    private stats: { hits: number; misses: number } = { hits: 0, misses: 0 }

    /**
     * 判断给定格式是否应该被缓存
     */
    shouldCache(format: VitraBookFormat): boolean {
        return !SKIP_CACHE_FORMATS.has(format)
    }

    /**
     * 从 IndexedDB 读取缓存。
     *
     * @returns 缓存数据，未命中返回 null
     */
    async get(buffer: ArrayBuffer): Promise<VitraCachedBook | null> {
        const hash = await computeBufferHash(buffer)
        const key = buildCacheKey(hash)

        const row = await db.settings.get(key)
        if (!row || !row.value) {
            this.stats.misses++
            return null
        }

        try {
            const entry = row.value as { compressed: number[]; cachedAt: number }
            const compressed = new Uint8Array(entry.compressed)
            const sectionsHtml = decodeSections(compressed)
            this.stats.hits++
            return { sectionsHtml, cachedAt: entry.cachedAt }
        } catch {
            // 缓存损坏，静默删除
            await db.settings.delete(key)
            this.stats.misses++
            return null
        }
    }

    /**
     * 将 sections HTML 压缩后写入 IndexedDB。
     */
    async put(buffer: ArrayBuffer, sectionsHtml: readonly string[]): Promise<void> {
        const hash = await computeBufferHash(buffer)
        const key = buildCacheKey(hash)
        const compressed = encodeSections(sectionsHtml)

        await db.settings.put({
            key,
            value: {
                compressed: Array.from(compressed),
                cachedAt: Date.now(),
            },
        })
    }

    /**
     * 删除指定文件的缓存
     */
    async evict(buffer: ArrayBuffer): Promise<void> {
        const hash = await computeBufferHash(buffer)
        await db.settings.delete(buildCacheKey(hash))
    }

    /**
     * 清除所有 Vitra 解析缓存
     */
    async clear(): Promise<void> {
        const allKeys = await db.settings.toCollection().primaryKeys()
        const cacheKeys = allKeys.filter(
            (k) => typeof k === 'string' && k.startsWith(CACHE_KEY_PREFIX),
        )
        if (cacheKeys.length > 0) {
            await db.settings.bulkDelete(cacheKeys)
        }
    }

    /**
     * 返回缓存命中统计
     */
    getStats(): VitraCacheStats {
        return { ...this.stats }
    }
}
