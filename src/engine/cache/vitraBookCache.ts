/**
 * Vitra 解析缓存服务
 *
 * 对应文档 5.1：将 Parser 输出的 sections HTML 压缩后
 * 存入 IndexedDB，再次打开时直接解压跳过格式解析。
 *
 * 压缩：fflate gzip   解压：fflate gunzip
 * Key：`vcache-{hex(md5(buffer))}`
 *
 * 排除格式：PDF / DJVU / MOBI / AZW / AZW3 / CBZ / CBT / CBR / CB7
 * （PDF/DJVU 按页渲染自带缓存；MOBI/AZW 章节可能包含会话级 Blob URL；
 * 漫画图片已压缩收益低）
 */

import { gzipSync, gunzipSync, strToU8, strFromU8 } from 'fflate'
import { db } from '@/services/storageService'
import type { VitraBookFormat } from '../types/vitraBook'

// ─── 常量 ────────────────────────────────────────────

const CACHE_KEY_PREFIX = 'vcache-'

/** 不缓存的格式集合 */
const SKIP_CACHE_FORMATS = new Set<VitraBookFormat>([
    'PDF', 'DJVU', 'MOBI', 'AZW', 'AZW3', 'CBZ', 'CBT', 'CBR', 'CB7',
])

/** 是否支持浏览器原生 CompressionStream（非阻塞） */
const HAS_COMPRESSION_STREAM = typeof CompressionStream === 'function' && typeof DecompressionStream === 'function'

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

/** 异步 gzip 压缩（优先用 CompressionStream，回退 fflate 同步） */
async function encodeSectionsAsync(sectionsHtml: readonly string[]): Promise<Uint8Array> {
    const json = JSON.stringify(sectionsHtml)
    if (!HAS_COMPRESSION_STREAM) return gzipSync(strToU8(json))
    try {
        const blob = new Blob([json])
        const stream = blob.stream().pipeThrough(new CompressionStream('gzip'))
        const buf = await new Response(stream).arrayBuffer()
        return new Uint8Array(buf)
    } catch {
        return gzipSync(strToU8(json))
    }
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

/** 异步 gunzip 解压（优先用 DecompressionStream，回退 fflate 同步） */
async function decodeSectionsAsync(compressed: Uint8Array): Promise<string[]> {
    if (!HAS_COMPRESSION_STREAM) return decodeSections(compressed)
    try {
        const blob = new Blob([compressed])
        const stream = blob.stream().pipeThrough(new DecompressionStream('gzip'))
        const text = await new Response(stream).text()
        const parsed = JSON.parse(text)
        if (!Array.isArray(parsed)) return []
        return parsed as string[]
    } catch {
        return decodeSections(compressed)
    }
}

// ─── 核心类 ──────────────────────────────────────────

export class VitraBookCache {
    private stats: { hits: number; misses: number } = { hits: 0, misses: 0 }
    /** 缓存 buffer → hash 映射，避免同一文件重复计算 SHA-256 */
    private hashCache = new WeakMap<ArrayBuffer, string>()

    private async getHash(buffer: ArrayBuffer): Promise<string> {
        const cached = this.hashCache.get(buffer)
        if (cached) return cached
        const hash = await computeBufferHash(buffer)
        this.hashCache.set(buffer, hash)
        return hash
    }

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
        const hash = await this.getHash(buffer)
        const key = buildCacheKey(hash)

        const row = await db.settings.get(key)
        if (!row || !row.value) {
            this.stats.misses++
            return null
        }

        try {
            const entry = row.value as { compressed: ArrayBuffer | number[]; cachedAt: number }
            // 兼容旧格式（number[]）和新格式（ArrayBuffer）
            const compressed = entry.compressed instanceof ArrayBuffer
                ? new Uint8Array(entry.compressed)
                : new Uint8Array(entry.compressed)
            const sectionsHtml = await decodeSectionsAsync(compressed)
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
        const hash = await this.getHash(buffer)
        const key = buildCacheKey(hash)
        const compressed = await encodeSectionsAsync(sectionsHtml)

        await db.settings.put({
            key,
            value: {
                // 直接存 ArrayBuffer，避免 Array.from() 导致的 3-4 倍存储膨胀
                compressed: compressed.buffer,
                cachedAt: Date.now(),
            },
        })
    }

    /**
     * 删除指定文件的缓存
     */
    async evict(buffer: ArrayBuffer): Promise<void> {
        const hash = await this.getHash(buffer)
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
