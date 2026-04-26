import type { VitraBookFormat } from '@/engine/types/vitraBook'

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

const CONTENTFUL_SELECTOR = Array.from(CONTENTFUL_TAGS).join(',')
const SKIP_CLEANUP_FORMATS = new Set<VitraBookFormat>(['PDF'])

function parseHtmlDocument(html: string): Document {
    return new DOMParser().parseFromString(html, 'text/html')
}

function normalizeText(text: string): string {
    return text.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim()
}

function hasAnchorIdentity(element: Element): boolean {
    return element.hasAttribute('id') || element.hasAttribute('name')
}

function hasContentfulDescendant(element: Element): boolean {
    return Boolean(element.querySelector(CONTENTFUL_SELECTOR))
}

function isEmptyEdgeNode(node: ChildNode): boolean {
    if (node.nodeType === Node.TEXT_NODE) {
        return normalizeText(node.textContent || '') === ''
    }
    if (!(node instanceof Element)) return false

    const tagName = node.tagName.toLowerCase()
    if (!TRIMMABLE_EMPTY_TAGS.has(tagName)) return false
    if (hasAnchorIdentity(node)) return false
    if (hasContentfulDescendant(node)) return false
    return normalizeText(node.textContent || '') === ''
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

export function trimChapterEdgeWhitespace(html: string): string {
    if (!html.trim()) return ''
    const doc = parseHtmlDocument(html)
    trimEmptyEdgesDeep(doc.body)
    return doc.body.innerHTML.trim()
}

export function shouldCleanChapterHtml(format: VitraBookFormat): boolean {
    return !SKIP_CLEANUP_FORMATS.has(format)
}

export function cleanChapterHtmlForFormat(html: string, format: VitraBookFormat): string {
    return shouldCleanChapterHtml(format) ? trimChapterEdgeWhitespace(html) : html
}
