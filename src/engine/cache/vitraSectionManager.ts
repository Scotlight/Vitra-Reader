/**
 * Vitra Section LRU 内存管理器
 *
 * 对应文档 5.2：Section Blob URL 的引用计数 + LRU 淘汰。
 * 最多同时保持 maxLoaded 个 section 的 Blob URL，
 * 超出时淘汰最久未访问的条目并 revoke Blob URL。
 */

import type { VitraBookSection } from '../types/vitraBook'

// ─── 常量 ────────────────────────────────────────────

const DEFAULT_MAX_LOADED = 5

// ─── 公共接口 ────────────────────────────────────────

export interface VitraSectionManagerOptions {
    /** 最多同时保持多少个 section 已加载（默认 5） */
    maxLoaded?: number
}

export interface VitraSectionManagerStats {
    readonly loaded: number
    readonly maxLoaded: number
    readonly evictions: number
}

// ─── LRU 条目 ───────────────────────────────────────

interface LoadedEntry {
    url: string
    section: VitraBookSection
    lastAccess: number
}

// ─── 核心类 ──────────────────────────────────────────

export class VitraSectionManager {
    private loaded = new Map<string | number, LoadedEntry>()
    private maxLoaded: number
    private evictions = 0

    constructor(options: VitraSectionManagerOptions = {}) {
        this.maxLoaded = Math.max(1, Math.floor(options.maxLoaded ?? DEFAULT_MAX_LOADED))
    }

    /**
     * 加载 section 并返回其内容（HTML 或 Blob URL）。
     *
     * 如果已加载则直接返回（更新 LRU 时间戳），
     * 否则调用 section.load() 并在超过容量时淘汰最旧条目。
     */
    async load(section: VitraBookSection): Promise<string> {
        const id = section.id

        // 缓存命中 → 更新访问时间
        const existing = this.loaded.get(id)
        if (existing) {
            existing.lastAccess = performance.now()
            return existing.url
        }

        // 容量满 → LRU 淘汰
        while (this.loaded.size >= this.maxLoaded) {
            this.evictOldest()
        }

        // 加载新 section
        const url = await section.load()
        this.loaded.set(id, {
            url,
            section,
            lastAccess: performance.now(),
        })
        return url
    }

    /**
     * 检查指定 section 是否已加载
     */
    has(sectionId: string | number): boolean {
        return this.loaded.has(sectionId)
    }

    /**
     * 手动卸载指定 section
     */
    unload(sectionId: string | number): void {
        const entry = this.loaded.get(sectionId)
        if (!entry) return
        this.releaseEntry(entry)
        this.loaded.delete(sectionId)
    }

    /**
     * 释放所有已加载的 section
     */
    destroy(): void {
        this.loaded.forEach((entry) => this.releaseEntry(entry))
        this.loaded.clear()
    }

    /**
     * 返回管理器统计
     */
    getStats(): VitraSectionManagerStats {
        return {
            loaded: this.loaded.size,
            maxLoaded: this.maxLoaded,
            evictions: this.evictions,
        }
    }

    // ─── 内部 ────────────────────────────────────────

    private evictOldest(): void {
        let oldestKey: string | number | null = null
        let oldestTime = Infinity

        this.loaded.forEach((entry, key) => {
            if (entry.lastAccess < oldestTime) {
                oldestTime = entry.lastAccess
                oldestKey = key
            }
        })

        if (oldestKey !== null) {
            const entry = this.loaded.get(oldestKey)
            if (entry) {
                this.releaseEntry(entry)
                this.loaded.delete(oldestKey)
                this.evictions++
            }
        }
    }

    private releaseEntry(entry: LoadedEntry): void {
        // revoke Blob URL（如果是 blob: 协议）
        if (entry.url.startsWith('blob:')) {
            try { URL.revokeObjectURL(entry.url) } catch { /* ignore */ }
        }
        entry.section.unload()
    }
}
