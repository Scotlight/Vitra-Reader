import { VitraSectionSplitter } from '@/engine/core/vitraSectionSplitter'
import {
    DEFAULT_DOCUMENT_LABEL,
    EMPTY_SECTION_HTML,
    isChapterTitle,
} from '@/engine/render/chapterTitleDetector'
import type { MobiResource } from './mobiParser'

const ESCAPED_MOBI_TAG_RE = /&lt;(\/?mbp:[^&<>]*?)&gt;/gi
const MOBI_PAGEBREAK_RE = /<\/?mbp:pagebreak\b[^>]*\/?>/gi
const MOBI_PRIVATE_TAG_RE = /<\/?mbp:[^>]*>/gi
const SPLIT_MARKER_TAG = 'vitra-mobi-section-marker'
const BREAK_TAG = 'vitra-mobi-pagebreak'
const HEADING_SELECTOR = 'h1,h2,h3,h4,h5,h6'
const TITLE_CANDIDATE_SELECTOR = 'h1,h2,h3,h4,h5,h6,p,div,span,strong,b'
const TEXT_BLOCK_SELECTOR = 'h1,h2,h3,h4,h5,h6,p,li,dt,dd,blockquote'
const MEDIA_CONTENT_RE = /<(img|svg|video|audio|canvas|iframe|object|embed)\b/i
const EMPTY_CHAPTER_TEXT = '(空章节)'
const TRIMMABLE_EMPTY_TAGS = new Set([
    'br',
    'p',
    'div',
    'span',
    'section',
    'article',
    'blockquote',
])
const CONTENTFUL_TAGS = new Set([
    'img',
    'svg',
    'video',
    'audio',
    'canvas',
    'iframe',
    'object',
    'embed',
    'table',
    'hr',
])

export interface MobiRenderedChapter {
    readonly label: string
    readonly href: string
    readonly html: string
    readonly plainText: string
    readonly styles: readonly string[]
}

export interface MobiRenderInput {
    readonly content: string
    readonly resources?: readonly MobiResource[]
}

function parseHtmlDocument(html: string): Document {
    return new DOMParser().parseFromString(html || EMPTY_SECTION_HTML, 'text/html')
}

function normalizeContent(content: string): string {
    const restoredMobiTags = content.replace(ESCAPED_MOBI_TAG_RE, '<$1>')
    const normalized = restoredMobiTags
        .replace(MOBI_PAGEBREAK_RE, `<${BREAK_TAG}></${BREAK_TAG}>`)
        .replace(MOBI_PRIVATE_TAG_RE, '')
    return normalized.trim() || EMPTY_SECTION_HTML
}

function extractStyles(doc: Document): string[] {
    const styles = Array.from(doc.querySelectorAll('style'))
    const values = styles.map((style) => style.textContent?.trim() || '').filter(Boolean)
    styles.forEach((style) => style.remove())
    return values
}

function parseIntegerToken(value: string | null): number | null {
    if (!value) return null
    const match = value.match(/\d+/)
    if (!match) return null
    const parsed = Number.parseInt(match[0], 10)
    return Number.isFinite(parsed) ? parsed : null
}

function resolveResourceUrl(raw: string | null, resources: readonly MobiResource[]): string | null {
    const token = parseIntegerToken(raw)
    if (token === null) return null
    return resources.find((resource) => (
        resource.relativeIndex === token || resource.recordIndex === token
    ))?.url ?? null
}

function resolveImageResources(doc: Document, resources: readonly MobiResource[]): void {
    if (resources.length === 0) return
    Array.from(doc.images).forEach((image) => {
        const recindex = image.getAttribute('recindex') || image.getAttribute('data-recindex')
        const url = resolveResourceUrl(recindex, resources)
            ?? resolveResourceUrl(image.getAttribute('src'), resources)
        if (!url) return
        image.setAttribute('src', url)
        image.removeAttribute('recindex')
        image.removeAttribute('data-recindex')
    })
}

function isBreakElement(element: Element): boolean {
    return element.tagName.toLowerCase() === BREAK_TAG
}

function injectSplitMarkers(doc: Document): number {
    const candidates = Array.from(doc.body.querySelectorAll(`${HEADING_SELECTOR},${BREAK_TAG}`))
    candidates.forEach((element) => {
        const marker = doc.createElement(SPLIT_MARKER_TAG)
        element.parentNode?.insertBefore(marker, element)
        if (isBreakElement(element)) element.remove()
    })
    return candidates.length
}

function splitMarkedBody(bodyHtml: string): string[] {
    return bodyHtml
        .split(`<${SPLIT_MARKER_TAG}></${SPLIT_MARKER_TAG}>`)
        .map((part) => part.trim())
        .filter((part) => part.length > 0)
}

function normalizePlainText(text: string): string {
    return text.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim()
}

function hasContentfulChild(element: Element): boolean {
    return Array.from(element.children).some((child) => CONTENTFUL_TAGS.has(child.tagName.toLowerCase()))
}

function isEmptyEdgeNode(node: ChildNode): boolean {
    if (node.nodeType === Node.TEXT_NODE) return normalizePlainText(node.textContent || '') === ''
    if (!(node instanceof Element)) return false

    const tagName = node.tagName.toLowerCase()
    if (!TRIMMABLE_EMPTY_TAGS.has(tagName)) return false
    if (hasContentfulChild(node)) return false
    return normalizePlainText(node.textContent || '') === ''
}

function trimEmptyEdgeNodes(parent: ParentNode): void {
    let first = parent.firstChild
    while (first && isEmptyEdgeNode(first)) {
        const next = first.nextSibling
        first.remove()
        first = next
    }

    let last = parent.lastChild
    while (last && isEmptyEdgeNode(last)) {
        const previous = last.previousSibling
        last.remove()
        last = previous
    }
}

function trimEmptyEdgesDeep(root: ParentNode): void {
    Array.from(root.childNodes).forEach((node) => {
        if (node instanceof Element) trimEmptyEdgesDeep(node)
    })
    trimEmptyEdgeNodes(root)
}

function trimChapterEdgeWhitespace(html: string): string {
    const doc = parseHtmlDocument(html)
    trimEmptyEdgesDeep(doc.body)
    return doc.body.innerHTML.trim()
}

function extractLabel(html: string, index: number): string {
    const doc = parseHtmlDocument(html)
    const candidates = Array.from(doc.body.querySelectorAll(TITLE_CANDIDATE_SELECTOR))
    for (const candidate of candidates) {
        const text = normalizePlainText(candidate.textContent || '')
        if (!text) continue
        if (candidate.matches(HEADING_SELECTOR) || isChapterTitle(text, { excludeBodyPunctuation: true })) {
            return text
        }
    }
    return index === 0 ? DEFAULT_DOCUMENT_LABEL : `第 ${index + 1} 章`
}

function extractPlainText(html: string): string {
    const doc = parseHtmlDocument(html)
    const blocks = Array.from(doc.body.querySelectorAll(TEXT_BLOCK_SELECTOR))
        .map((element) => normalizePlainText(element.textContent || ''))
        .filter(Boolean)
    return blocks.length > 0 ? blocks.join(' ') : normalizePlainText(doc.body.textContent || '')
}

function toRenderedChapter(html: string, index: number, styles: readonly string[]): MobiRenderedChapter {
    const trimmedHtml = trimChapterEdgeWhitespace(html)
    const safeHtml = trimmedHtml || EMPTY_SECTION_HTML
    return {
        label: extractLabel(safeHtml, index),
        href: `ch-${index}`,
        html: safeHtml,
        plainText: extractPlainText(safeHtml),
        styles,
    }
}

function splitWithoutExplicitMarkers(bodyHtml: string): string[] {
    const chunks = VitraSectionSplitter.split(bodyHtml)
    return chunks.length > 0 ? chunks.map((chunk) => chunk.html || EMPTY_SECTION_HTML) : [EMPTY_SECTION_HTML]
}

export function renderMobiChapters(input: MobiRenderInput): MobiRenderedChapter[] {
    const doc = parseHtmlDocument(normalizeContent(input.content))
    resolveImageResources(doc, input.resources ?? [])
    const styles = extractStyles(doc)
    const markerCount = injectSplitMarkers(doc)
    const bodyHtml = doc.body.innerHTML || EMPTY_SECTION_HTML
    const parts = markerCount > 0 ? splitMarkedBody(bodyHtml) : splitWithoutExplicitMarkers(bodyHtml)
    return filterRenderableMobiChapters(parts.map((part, index) => toRenderedChapter(part, index, styles)))
}

export function isRenderableMobiChapter(chapter: MobiRenderedChapter): boolean {
    if (MEDIA_CONTENT_RE.test(chapter.html)) return true
    const text = normalizePlainText(chapter.plainText)
    return Boolean(text && text !== EMPTY_CHAPTER_TEXT)
}

export function filterRenderableMobiChapters(
    chapters: readonly MobiRenderedChapter[],
): MobiRenderedChapter[] {
    const filtered = chapters.filter(isRenderableMobiChapter)
    if (filtered.length > 0) return filtered
    return chapters.length > 0 ? [chapters[0]] : []
}
