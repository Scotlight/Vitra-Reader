import {
    initKf8File,
    initMobiFile,
    type Kf8,
    type Kf8ProcessedChapter,
    type Kf8TocItem,
    type Mobi,
    type MobiProcessedChapter,
    type MobiTocItem,
} from '@lingo-reader/mobi-parser'
import type { SpineItemInfo, TocItem } from '@/engine/core/contentProvider'
import {
    filterRenderableMobiChapters,
    renderMobiChapters,
    type MobiRenderedChapter,
} from './mobiHtmlRenderer'

export type LingoMobiFormat = 'mobi' | 'azw' | 'azw3'

type LingoParserKind = 'kf8' | 'mobi'
type LingoParser = Kf8 | Mobi
type LingoProcessedChapter = Kf8ProcessedChapter | MobiProcessedChapter
type LingoTocItem = Kf8TocItem | MobiTocItem

export interface LingoMobiBook {
    readonly parser: LingoParser
    readonly kind: LingoParserKind
    readonly chapters: readonly MobiRenderedChapter[]
    readonly spineItems: readonly SpineItemInfo[]
    readonly tocItems: readonly TocItem[]
    readonly activeAssetUrls: ReadonlySet<string>
    readonly resolveHref: (href: string) => number
    readonly destroy: () => void
}

const BLOB_URL_RE = /blob:[^"'()\s<>]+/g
const NUMERIC_LABEL_RE = /^\d+$/
const EMPTY_CHAPTER_LABEL = '(空章节)'

function toInputBytes(data: ArrayBuffer): Uint8Array {
    return new Uint8Array(data)
}

function getInitOrder(format: LingoMobiFormat): readonly LingoParserKind[] {
    if (format === 'azw3') return ['kf8', 'mobi']
    return ['kf8', 'mobi']
}

async function initParserByKind(
    kind: LingoParserKind,
    data: ArrayBuffer,
): Promise<LingoParser> {
    const input = toInputBytes(data)
    return kind === 'kf8' ? initKf8File(input) : initMobiFile(input)
}

function hasUsableSpine(parser: LingoParser): boolean {
    try {
        return parser.getSpine().length > 0
    } catch {
        return false
    }
}

export async function initLingoMobiParser(
    data: ArrayBuffer,
    format: LingoMobiFormat,
): Promise<{ parser: LingoParser; kind: LingoParserKind }> {
    let lastError: unknown = null
    for (const kind of getInitOrder(format)) {
        let parser: LingoParser | null = null
        try {
            parser = await initParserByKind(kind, data)
            if (hasUsableSpine(parser)) return { parser, kind }
            parser.destroy()
            lastError = new Error(`[LingoMobiAdapter] ${kind} parser returned empty spine`)
        } catch (error) {
            parser?.destroy()
            lastError = error
        }
    }
    throw lastError instanceof Error ? lastError : new Error('[LingoMobiAdapter] parser init failed')
}

async function readCssParts(chapter: LingoProcessedChapter): Promise<string[]> {
    const urls = chapter.css.map((part) => part.href).filter(Boolean)
    const uniqueUrls = [...new Set(urls)]
    const styles = await Promise.all(uniqueUrls.map(async (url) => {
        try {
            const response = await fetch(url)
            return await response.text()
        } catch (error) {
            console.warn('[LingoMobiAdapter] CSS resource load failed:', url, error)
            return ''
        }
    }))
    return styles.map((style) => style.trim()).filter(Boolean)
}

function collectBlobUrls(text: string, target: Set<string>): void {
    for (const match of text.matchAll(BLOB_URL_RE)) {
        target.add(match[0])
    }
}

function buildRenderedParts(
    processed: LingoProcessedChapter,
    spineId: string,
    startIndex: number,
    styles: readonly string[],
    activeAssetUrls: Set<string>,
): MobiRenderedChapter[] {
    collectBlobUrls(processed.html, activeAssetUrls)
    processed.css.forEach((part) => {
        if (part.href.startsWith('blob:')) activeAssetUrls.add(part.href)
    })

    const parts = renderMobiChapters({ content: processed.html })
    return parts.map((part, offset) => ({
        ...part,
        href: offset === 0 ? spineId : `${spineId}#part-${offset}`,
        label: part.label || `第 ${startIndex + offset + 1} 章`,
        styles: [...styles, ...part.styles],
    }))
}

function createFallbackChapter(spineId: string, index: number): MobiRenderedChapter {
    const [chapter] = renderMobiChapters({ content: '' })
    return {
        ...chapter,
        href: spineId,
        label: chapter.label || `第 ${index + 1} 章`,
    }
}

async function buildChapters(
    parser: LingoParser,
): Promise<{ chapters: MobiRenderedChapter[]; activeAssetUrls: Set<string> }> {
    const activeAssetUrls = new Set<string>()
    const chapters: MobiRenderedChapter[] = []
    const spine = parser.getSpine()
    for (let index = 0; index < spine.length; index += 1) {
        const spineItem = spine[index]
        const processed = parser.loadChapter(spineItem.id)
        if (!processed) {
            chapters.push(createFallbackChapter(spineItem.id, chapters.length))
            continue
        }
        const styles = await readCssParts(processed)
        styles.forEach((style) => collectBlobUrls(style, activeAssetUrls))
        chapters.push(...buildRenderedParts(processed, spineItem.id, chapters.length, styles, activeAssetUrls))
    }
    return { chapters, activeAssetUrls }
}

function normalizeTocItems(
    items: readonly LingoTocItem[],
    resolveHref: (href: string) => string,
): TocItem[] {
    return items.map((item, index) => {
        const href = resolveHref(item.href)
        return {
            id: href || `toc-${index}`,
            href,
            label: item.label || `第 ${index + 1} 章`,
            subitems: item.children ? normalizeTocItems(item.children, resolveHref) : undefined,
        }
    })
}

function flattenTocItems(items: readonly TocItem[]): TocItem[] {
    return items.flatMap((item) => [
        item,
        ...(item.subitems ? flattenTocItems(item.subitems) : []),
    ])
}

function hasUsefulTocLabels(items: readonly TocItem[]): boolean {
    return flattenTocItems(items).some((item) => {
        const label = item.label.trim()
        return Boolean(label && label !== EMPTY_CHAPTER_LABEL && !NUMERIC_LABEL_RE.test(label))
    })
}

function buildFallbackTocItems(chapters: readonly MobiRenderedChapter[]): TocItem[] {
    return chapters.map((chapter, index) => {
        const label = chapter.label.trim()
        return {
            id: chapter.href || `mobi-${index}`,
            href: chapter.href,
            label: label && label !== EMPTY_CHAPTER_LABEL ? label : `第 ${index + 1} 章`,
        }
    })
}

function buildTocItems(
    parser: LingoParser,
    hrefToIndex: Map<string, number>,
    chapters: readonly MobiRenderedChapter[],
): TocItem[] {
    const parsedToc = normalizeTocItems(
        parser.getToc(),
        (href) => resolveTocHref(parser, hrefToIndex, href),
    )
    return hasUsefulTocLabels(parsedToc) ? parsedToc : buildFallbackTocItems(chapters)
}

function buildSpineItems(chapters: readonly MobiRenderedChapter[]): SpineItemInfo[] {
    return chapters.map((chapter, index) => ({
        index,
        href: chapter.href,
        id: chapter.href,
        linear: true,
    }))
}

function buildHrefIndex(
    chapters: readonly MobiRenderedChapter[],
): Map<string, number> {
    const hrefToIndex = new Map<string, number>()
    chapters.forEach((chapter, index) => {
        hrefToIndex.set(chapter.href, index)
        const baseHref = chapter.href.split('#', 1)[0]
        if (!hrefToIndex.has(baseHref)) hrefToIndex.set(baseHref, index)
    })
    return hrefToIndex
}

function resolveTocHref(parser: LingoParser, hrefToIndex: Map<string, number>, href: string): string {
    if (hrefToIndex.has(href)) return href
    const resolved = parser.resolveHref(href)
    if (resolved && hrefToIndex.has(resolved.id)) return resolved.id
    return href
}

function buildResolveHref(
    parser: LingoParser,
    hrefToIndex: Map<string, number>,
): (href: string) => number {
    return (href: string) => {
        const baseHref = href.split('#', 1)[0]
        const exact = hrefToIndex.get(href) ?? hrefToIndex.get(baseHref)
        if (exact !== undefined) return exact
        const resolved = parser.resolveHref(href)
        if (!resolved) return -1
        return hrefToIndex.get(resolved.id) ?? -1
    }
}

function createDestroy(parser: LingoParser): () => void {
    let destroyed = false
    return () => {
        if (destroyed) return
        destroyed = true
        parser.destroy()
    }
}

export async function loadLingoMobiBook(
    data: ArrayBuffer,
    format: LingoMobiFormat,
): Promise<LingoMobiBook> {
    const { parser, kind } = await initLingoMobiParser(data, format)
    try {
        const { chapters: rawChapters, activeAssetUrls } = await buildChapters(parser)
        const chapters = filterRenderableMobiChapters(rawChapters)
        const spineItems = buildSpineItems(chapters)
        const hrefToIndex = buildHrefIndex(chapters)
        const tocItems = buildTocItems(parser, hrefToIndex, chapters)
        return {
            parser,
            kind,
            chapters,
            spineItems,
            tocItems,
            activeAssetUrls,
            resolveHref: buildResolveHref(parser, hrefToIndex),
            destroy: createDestroy(parser),
        }
    } catch (error) {
        parser.destroy()
        throw error
    }
}

export async function blobUrlToDataUrl(url: string): Promise<string> {
    if (!url) return ''
    if (url.startsWith('data:')) return url
    const response = await fetch(url)
    const blob = await response.blob()
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onerror = () => reject(reader.error ?? new Error('[LingoMobiAdapter] cover read failed'))
        reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
        reader.readAsDataURL(blob)
    })
}

export async function parseLingoMobiMetadata(
    data: ArrayBuffer,
    format: LingoMobiFormat,
) {
    const { parser } = await initLingoMobiParser(data, format)
    try {
        const metadata = parser.getMetadata()
        const coverUrl = parser.getCoverImage?.() ?? ''
        const cover = coverUrl ? await blobUrlToDataUrl(coverUrl) : ''
        return {
            title: metadata.title || 'Untitled',
            author: metadata.author.join(', ') || '未知作者',
            description: metadata.description || '',
            publisher: metadata.publisher || '',
            language: metadata.language || '',
            cover,
        }
    } finally {
        parser.destroy()
    }
}
