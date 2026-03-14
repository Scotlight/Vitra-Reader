/**
 * VitraContentAdapter — 将 VitraBook 适配为 ContentProvider 接口
 *
 * 集成组件：
 *   - VitraPipeline → VitraBook（数据源）
 *   - VitraBookCache（跨会话 gzip 压缩缓存，加速再次打开）
 *   - VitraSectionManager（LRU 淘汰 provider 内部资源）
 *   - searchIndexCache（全文搜索索引）
 */

import type {
  ContentProvider,
  TocItem,
  SpineItemInfo,
  SearchResult,
} from '../core/contentProvider'
import type {
  VitraBook,
  VitraTocItem,
} from '../types/vitraBook'
import { VitraBookCache } from '../cache/vitraBookCache'
import { VitraSectionManager } from '../cache/vitraSectionManager'
import {
  upsertChapterIndex,
  hasChapterIndex,
  searchBookIndex,
} from '../cache/searchIndexCache'

// ─── 常量 ────────────────────────────────────────────

/** LRU 最大同时保持已加载的 section 数（比 ScrollReaderView 的卸载窗口大） */
const SECTION_MANAGER_MAX_LOADED = 10

/** 搜索预索引的并发批次大小 */
const SEARCH_INDEX_BATCH = 4

// ─── 适配器 ──────────────────────────────────────────

export class VitraContentAdapter implements ContentProvider {
  private readonly book: VitraBook
  private readonly bookId: string
  private readonly buffer: ArrayBuffer
  private readonly htmlCache = new Map<number, string>()
  private readonly sectionManager: VitraSectionManager
  private readonly bookCache: VitraBookCache
  private cacheDirty = false

  constructor(book: VitraBook, bookId: string, buffer: ArrayBuffer) {
    this.book = book
    this.bookId = bookId
    this.buffer = buffer
    this.sectionManager = new VitraSectionManager({
      maxLoaded: SECTION_MANAGER_MAX_LOADED,
    })
    this.bookCache = new VitraBookCache()
  }

  // ── ContentProvider 接口实现 ──────────────────────

  async init(): Promise<void> {
    // 尝试从磁盘缓存预热 htmlCache
    if (!this.bookCache.shouldCache(this.book.format)) return

    try {
      const cached = await this.bookCache.get(this.buffer)
      if (cached && cached.sectionsHtml.length > 0) {
        for (let i = 0; i < cached.sectionsHtml.length; i++) {
          const html = cached.sectionsHtml[i]
          if (html) {
            this.htmlCache.set(i, html)
            upsertChapterIndex(this.bookId, i, html)
          }
        }
        console.log(
          `[VitraContentAdapter] 缓存命中: ${cached.sectionsHtml.length} sections (${this.book.format})`,
        )
      }
    } catch {
      // 缓存读取失败不影响正常流程
    }
  }

  destroy(): void {
    // 先捕获缓存数据再清理（避免竞态）
    const payload = this.buildCachePayload()
    this.sectionManager.destroy()
    this.htmlCache.clear()
    this.book.releaseAssetSession?.()
    this.book.destroy()

    // 异步写入磁盘缓存（fire-and-forget）
    if (payload) {
      this.bookCache.put(this.buffer, payload).catch(() => {})
    }
  }

  getToc(): TocItem[] {
    return mapVitraToc(this.book.toc)
  }

  getSpineItems(): SpineItemInfo[] {
    return this.book.sections.map((section, index) => ({
      index,
      href: section.href,
      id: String(section.id),
      linear: section.linear ?? true,
    }))
  }

  isAssetUrlAvailable(url: string): boolean {
    return this.book.isAssetUrlAvailable?.(url) ?? true
  }

  getSpineIndexByHref(href: string): number {
    const resolved = this.book.resolveHref(href)
    if (resolved) return resolved.index

    // 回退：去 anchor 后逐一匹配
    const [rawHref] = href.split('#', 2)
    const sections = this.book.sections
    for (let i = 0; i < sections.length; i++) {
      if (sections[i].href === rawHref) return i
      if (sections[i].href.endsWith(rawHref) || rawHref.endsWith(sections[i].href)) return i
    }
    return -1
  }

  async extractChapterHtml(spineIndex: number): Promise<string> {
    const section = this.book.sections[spineIndex]
    if (!section) throw new Error(`[VitraContentAdapter] 无效 spineIndex: ${spineIndex}`)

    // 1. 内存缓存命中
    const cached = this.htmlCache.get(spineIndex)
    if (cached) return cached

    // 2. 通过 SectionManager 加载（带 LRU 淘汰）
    const result = await this.sectionManager.load(section)

    // 3. 兼容 Blob URL 和原始 HTML 两种返回
    let html: string
    if (result.startsWith('blob:')) {
      const resp = await fetch(result)
      html = await resp.text()
    } else {
      html = result
    }

    this.htmlCache.set(spineIndex, html)
    this.cacheDirty = true
    upsertChapterIndex(this.bookId, spineIndex, html)
    return html
  }

  async extractChapterStyles(spineIndex: number): Promise<string[]> {
    const section = this.book.sections[spineIndex]
    return [...(section?.styles ?? [])]
  }

  unloadChapter(spineIndex: number): void {
    this.htmlCache.delete(spineIndex)
    const section = this.book.sections[spineIndex]
    if (section) {
      this.sectionManager.unload(section.id)
    }
  }

  async search(keyword: string): Promise<SearchResult[]> {
    if (!keyword.trim()) return []
    await this.ensureFullIndex()
    return searchBookIndex(this.bookId, keyword)
  }

  // ── 内部方法 ─────────────────────────────────────

  /**
   * 确保所有章节已建立搜索索引。
   * 未索引的章节分批并发加载，保证全书搜索不退化。
   */
  private async ensureFullIndex(): Promise<void> {
    const unindexed: number[] = []
    for (let i = 0; i < this.book.sections.length; i++) {
      if (!hasChapterIndex(this.bookId, i)) {
        unindexed.push(i)
      }
    }
    if (unindexed.length === 0) return

    for (let start = 0; start < unindexed.length; start += SEARCH_INDEX_BATCH) {
      const batch = unindexed.slice(start, start + SEARCH_INDEX_BATCH)
      await Promise.all(batch.map((i) => this.extractChapterHtml(i)))
    }
  }

  /**
   * 构建缓存写入 payload。
   * 仅在格式可缓存、有新数据、且已加载所有 section 时才返回。
   */
  private buildCachePayload(): readonly string[] | null {
    if (!this.bookCache.shouldCache(this.book.format)) return null
    if (!this.cacheDirty) return null

    const total = this.book.sections.length
    if (this.htmlCache.size < total) return null

    const payload: string[] = []
    for (let i = 0; i < total; i++) {
      payload.push(this.htmlCache.get(i) || '')
    }
    return payload
  }
}

// ─── TOC 映射 ────────────────────────────────────────

function mapVitraToc(items: readonly VitraTocItem[]): TocItem[] {
  return items.map((item, i) => ({
    id: `vtoc-${i}`,
    href: item.href,
    label: item.label,
    subitems: item.children?.length ? mapVitraToc(item.children) : undefined,
  }))
}
