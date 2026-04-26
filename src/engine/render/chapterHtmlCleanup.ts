import type { VitraBookFormat } from '@/engine/types/vitraBook'

/**
 * 章节 HTML 边缘清理：
 * - 只处理章节首尾空白节点，保留正文中间空行；
 * - 保留锚点和媒体内容，避免破坏目录跳转与图片章节；
 * - PDF 页面含定位层，必须跳过。
 */

const EDGE_TRIMMABLE_EMPTY_TAGS = new Set([
    'br',
    'p',
    'div',
    'span',
    'section',
    'article',
    'blockquote',
])

const EDGE_PRESERVED_CONTENT_TAGS = new Set([
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

const EDGE_PRESERVED_CONTENT_SELECTOR = Array.from(EDGE_PRESERVED_CONTENT_TAGS).join(',')
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

function hasPreservedContent(element: Element): boolean {
    return Boolean(element.querySelector(EDGE_PRESERVED_CONTENT_SELECTOR))
}

function isEmptyEdgeNode(node: ChildNode): boolean {
    if (node.nodeType === Node.TEXT_NODE) {
        return normalizeText(node.textContent || '') === ''
    }
    if (!(node instanceof Element)) return false

    const tagName = node.tagName.toLowerCase()
    if (!EDGE_TRIMMABLE_EMPTY_TAGS.has(tagName)) return false
    if (hasAnchorIdentity(node)) return false
    if (hasPreservedContent(node)) return false
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

function trimEmptyEdgesDeep(root: Element): void {
    const descendants = Array.from(root.querySelectorAll('*'))
    for (let index = descendants.length - 1; index >= 0; index -= 1) {
        trimEmptyEdgeNodes(descendants[index])
    }
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
