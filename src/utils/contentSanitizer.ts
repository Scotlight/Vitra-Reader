import type {
    ChapterPreprocessInput,
    ChapterPreprocessResult,
} from '../types/chapterPreprocess'

const URL_LIKE_ATTRS = new Set(['src', 'href', 'xlink:href', 'poster'])
const DANGEROUS_TAG_SELECTOR = [
    'script',
    'iframe',
    'frame',
    'frameset',
    'object',
    'embed',
    'applet',
    'base',
    'meta[http-equiv="refresh"]',
    'form',
    'input',
    'button',
    'textarea',
    'select',
].join(',')

function trimWrappedQuotes(value: string): string {
    const trimmed = value.trim()
    if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
        return trimmed.slice(1, -1)
    }
    return trimmed
}

export function escapeHtml(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function escapeHtmlAttribute(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
}

function sanitizeProtocol(url: string): string {
    const lowered = url.toLowerCase()

    if (/^(javascript:|vbscript:|file:)/i.test(lowered)) {
        return ''
    }

    if (/^vitra-res:/i.test(lowered)) {
        return url
    }

    if (/^blob:/i.test(lowered)) {
        return url
    }

    if (/^data:/i.test(lowered)) {
        if (/^data:(image|audio|video|font)\//i.test(lowered)) return url
        return ''
    }

    if (lowered.startsWith('#')) {
        return url
    }

    return ''
}

export function sanitizeUrlValue(rawValue: string): string {
    const normalized = trimWrappedQuotes(rawValue)
        .replace(/\u0000/g, '')
        .replace(/\\+/g, '/')
        .trim()

    if (!normalized) return ''

    return sanitizeProtocol(normalized)
}

function sanitizeSrcSetValue(srcSet: string): string {
    const parts = srcSet
        .split(',')
        .map((chunk) => chunk.trim())
        .filter(Boolean)

    const sanitized = parts
        .map((entry) => {
            const tokens = entry.split(/\s+/).filter(Boolean)
            if (tokens.length === 0) return ''
            const cleanUrl = sanitizeUrlValue(tokens[0])
            if (!cleanUrl) return ''
            return [cleanUrl, ...tokens.slice(1)].join(' ')
        })
        .filter(Boolean)

    return sanitized.join(', ')
}

function sanitizeInlineStyleValue(styleValue: string): string {
    let sanitized = styleValue.replace(/\u0000/g, '')
    sanitized = sanitized.replace(/expression\s*\([^)]*\)/gi, '')
    sanitized = sanitized.replace(/behavior\s*:[^;]+;?/gi, '')
    sanitized = sanitized.replace(/url\s*\(\s*(['"]?)\s*(javascript:|vbscript:|data:text\/html|data:application\/xhtml\+xml)[^)]+\)/gi, 'url("")')
    return sanitized.trim()
}

export function sanitizeStyleSheet(css: string): string {
    let sanitized = css.replace(/\u0000/g, '')
    sanitized = sanitized.replace(/@import\s+(['"]?)\s*(javascript:|vbscript:|data:text\/html|data:application\/xhtml\+xml)[^;]*;?/gi, '')
    sanitized = sanitized.replace(/expression\s*\([^)]*\)/gi, '')
    sanitized = sanitized.replace(/behavior\s*:[^;]+;?/gi, '')
    sanitized = sanitized.replace(/url\s*\(\s*(['"]?)\s*(javascript:|vbscript:|data:text\/html|data:application\/xhtml\+xml)[^)]+\)/gi, 'url("")')
    return sanitized.trim()
}

export function sanitizeStyleSheets(externalStyles: string[]): string[] {
    return externalStyles
        .map((style) => sanitizeStyleSheet(style))
        .filter((style) => style.length > 0)
}

function sanitizeWithDomParser(html: string): {
    htmlContent: string
    removedTagCount: number
    removedAttributeCount: number
    usedFallback: boolean
} {
    const parser = new DOMParser()
    const parsed = parser.parseFromString(`<div id="__bdise_sanitizer_root">${html}</div>`, 'text/html')
    const root = parsed.getElementById('__bdise_sanitizer_root')

    if (!root) {
        // DOMParser 解析失败 — 不可返回未消毒的原始 HTML，降级到 regex 消毒
        return sanitizeWithRegexFallback(html)
    }

    let removedTagCount = 0
    let removedAttributeCount = 0

    root.querySelectorAll(DANGEROUS_TAG_SELECTOR).forEach((element) => {
        removedTagCount += 1
        element.remove()
    })

    root.querySelectorAll('*').forEach((element) => {
        const attrs = Array.from(element.attributes)
        attrs.forEach((attribute) => {
            const attrName = attribute.name.toLowerCase()
            const attrValue = attribute.value || ''

            if (attrName.startsWith('on')) {
                element.removeAttribute(attribute.name)
                removedAttributeCount += 1
                return
            }

            if (attrName === 'style') {
                const safeStyle = sanitizeInlineStyleValue(attrValue)
                if (!safeStyle) {
                    element.removeAttribute(attribute.name)
                    removedAttributeCount += 1
                } else if (safeStyle !== attrValue) {
                    element.setAttribute(attribute.name, safeStyle)
                    removedAttributeCount += 1
                }
                return
            }

            if (attrName === 'srcset') {
                const safeSrcSet = sanitizeSrcSetValue(attrValue)
                if (!safeSrcSet) {
                    element.removeAttribute(attribute.name)
                    removedAttributeCount += 1
                } else if (safeSrcSet !== attrValue) {
                    element.setAttribute(attribute.name, safeSrcSet)
                    removedAttributeCount += 1
                }
                return
            }

            if (URL_LIKE_ATTRS.has(attrName)) {
                const safeUrl = sanitizeUrlValue(attrValue)
                if (!safeUrl) {
                    element.removeAttribute(attribute.name)
                    removedAttributeCount += 1
                } else if (safeUrl !== attrValue) {
                    element.setAttribute(attribute.name, safeUrl)
                    removedAttributeCount += 1
                }
            }
        })
    })

    return {
        htmlContent: root.innerHTML,
        removedTagCount,
        removedAttributeCount,
        usedFallback: false,
    }
}

/** 白名单标签 — EPUB 文档常用的安全 HTML 标签 */
const ALLOWED_TAG_NAMES = new Set([
    // 结构
    'div', 'span', 'p', 'br', 'hr', 'section', 'article', 'aside', 'header', 'footer', 'nav', 'main',
    // 标题
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    // 文本格式
    'a', 'b', 'i', 'u', 's', 'em', 'strong', 'small', 'sub', 'sup', 'mark', 'del', 'ins',
    'abbr', 'cite', 'code', 'pre', 'kbd', 'samp', 'var', 'time', 'dfn', 'q', 'bdi', 'bdo', 'wbr',
    // 列表
    'ul', 'ol', 'li', 'dl', 'dt', 'dd',
    // 表格
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'col', 'colgroup',
    // 媒体
    'img', 'picture', 'source', 'figure', 'figcaption', 'audio', 'video',
    // 引用/块级
    'blockquote', 'details', 'summary', 'ruby', 'rt', 'rp',
    // SVG 基础（行内图形）
    'svg', 'path', 'g', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'tspan', 'defs', 'use', 'image', 'clippath', 'mask',
    // MathML 基础
    'math', 'mi', 'mn', 'mo', 'ms', 'mrow', 'msup', 'msub', 'mfrac', 'mover', 'munder', 'msqrt', 'mroot', 'mtable', 'mtr', 'mtd',
])

/** 白名单属性 — 所有标签通用安全属性 */
const ALLOWED_ATTR_NAMES = new Set([
    'id', 'class', 'lang', 'dir', 'title', 'role', 'aria-label', 'aria-hidden', 'aria-describedby',
    'style', 'src', 'href', 'xlink:href', 'alt', 'width', 'height', 'srcset', 'poster',
    'colspan', 'rowspan', 'scope', 'headers',
    'viewbox', 'xmlns', 'xmlns:xlink', 'fill', 'stroke', 'stroke-width', 'd', 'transform',
    'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'points',
    'data-pdf-page',
])

function sanitizeWithRegexFallback(html: string): {
    htmlContent: string
    removedTagCount: number
    removedAttributeCount: number
    usedFallback: boolean
} {
    let removedTagCount = 0
    let removedAttributeCount = 0

    // 白名单模式：处理每个 HTML 标签，不在白名单内的标签被剥离（保留内容）
    const sanitized = html.replace(/<\/?([a-zA-Z][a-zA-Z0-9-]*)\b([^>]*)?\/?>/gi, (fullMatch, tagName: string, attrsStr: string | undefined) => {
        const tag = tagName.toLowerCase()

        if (!ALLOWED_TAG_NAMES.has(tag)) {
            removedTagCount += 1
            // 自闭合危险标签完全移除；块级标签移除但保留内容
            return ''
        }

        // 标签在白名单中 — 过滤属性
        if (!attrsStr || !attrsStr.trim()) return fullMatch

        const isClosing = fullMatch.startsWith('</')
        if (isClosing) return fullMatch

        const safeAttrs: string[] = []
        const attrPattern = /([a-zA-Z][a-zA-Z0-9:_-]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|(\S+)))?/gi
        let attrMatch: RegExpExecArray | null

        while ((attrMatch = attrPattern.exec(attrsStr)) !== null) {
            const attrName = attrMatch[1].toLowerCase()
            const attrValue = attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? ''

            // 拒绝 event handler 属性
            if (attrName.startsWith('on')) {
                removedAttributeCount += 1
                continue
            }

            if (!ALLOWED_ATTR_NAMES.has(attrName)) {
                removedAttributeCount += 1
                continue
            }

            // URL 属性消毒
            if (URL_LIKE_ATTRS.has(attrName)) {
                const safeUrl = sanitizeUrlValue(attrValue)
                if (!safeUrl) {
                    removedAttributeCount += 1
                    continue
                }
                safeAttrs.push(`${attrName}="${escapeHtmlAttribute(safeUrl)}"`)
                continue
            }

            // srcset 消毒
            if (attrName === 'srcset') {
                const safeSrcSet = sanitizeSrcSetValue(attrValue)
                if (!safeSrcSet) {
                    removedAttributeCount += 1
                    continue
                }
                safeAttrs.push(`srcset="${escapeHtmlAttribute(safeSrcSet)}"`)
                continue
            }

            // style 消毒
            if (attrName === 'style') {
                const safeStyle = sanitizeInlineStyleValue(attrValue)
                if (!safeStyle) {
                    removedAttributeCount += 1
                    continue
                }
                safeAttrs.push(`style="${escapeHtmlAttribute(safeStyle)}"`)
                continue
            }

            safeAttrs.push(`${attrName}="${escapeHtmlAttribute(attrValue)}"`)
        }

        const isSelfClosing = fullMatch.endsWith('/>')
        const attrStr = safeAttrs.length > 0 ? ' ' + safeAttrs.join(' ') : ''
        return `<${tagName}${attrStr}${isSelfClosing ? '/>' : '>'}`
    })

    return {
        htmlContent: sanitized,
        removedTagCount,
        removedAttributeCount,
        usedFallback: true,
    }
}

export function sanitizeChapterHtml(html: string): {
    htmlContent: string
    removedTagCount: number
    removedAttributeCount: number
    usedFallback: boolean
} {
    if (!html) {
        return {
            htmlContent: '',
            removedTagCount: 0,
            removedAttributeCount: 0,
            usedFallback: false,
        }
    }

    if (typeof DOMParser !== 'undefined') {
        return sanitizeWithDomParser(html)
    }

    return sanitizeWithRegexFallback(html)
}

export function preprocessChapterSync(input: ChapterPreprocessInput): ChapterPreprocessResult {
    const htmlSanitized = sanitizeChapterHtml(input.htmlContent)
    const styleSanitized = sanitizeStyleSheets(input.externalStyles)

    return {
        htmlContent: htmlSanitized.htmlContent,
        htmlFragments: [htmlSanitized.htmlContent],
        externalStyles: styleSanitized,
        removedTagCount: htmlSanitized.removedTagCount,
        removedAttributeCount: htmlSanitized.removedAttributeCount,
        usedFallback: htmlSanitized.usedFallback,
        stylesScoped: false,
    }
}
