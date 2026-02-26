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
].join(',')

function trimWrappedQuotes(value: string): string {
    const trimmed = value.trim()
    if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
        return trimmed.slice(1, -1)
    }
    return trimmed
}

function escapeHtmlAttribute(value: string): string {
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
        if (/^data:application\/(octet-stream|pdf)/i.test(lowered)) return url
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
        return {
            htmlContent: html,
            removedTagCount: 0,
            removedAttributeCount: 0,
            usedFallback: true,
        }
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

function sanitizeWithRegexFallback(html: string): {
    htmlContent: string
    removedTagCount: number
    removedAttributeCount: number
    usedFallback: boolean
} {
    let removedTagCount = 0
    let removedAttributeCount = 0

    let sanitized = html

    sanitized = sanitized.replace(/<\s*(script|iframe|frame|frameset|object|embed|applet|base|meta)\b[\s\S]*?(?:<\/\s*\1\s*>|\/?>)/gi, (_match) => {
        removedTagCount += 1
        return ''
    })

    sanitized = sanitized.replace(/\s+on[a-z0-9_-]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, (_match) => {
        removedAttributeCount += 1
        return ''
    })

    sanitized = sanitized.replace(/\s+(href|src|xlink:href|poster)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, (_match, attrName: string, rawValue: string) => {
        const safeValue = sanitizeUrlValue(rawValue)
        if (!safeValue) {
            removedAttributeCount += 1
            return ''
        }
        const decodedRaw = trimWrappedQuotes(rawValue)
        if (safeValue !== decodedRaw) {
            removedAttributeCount += 1
        }
        return ` ${attrName}="${escapeHtmlAttribute(safeValue)}"`
    })

    sanitized = sanitized.replace(/\s+srcset\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, (_match, rawValue: string) => {
        const safeValue = sanitizeSrcSetValue(trimWrappedQuotes(rawValue))
        if (!safeValue) {
            removedAttributeCount += 1
            return ''
        }
        return ` srcset="${escapeHtmlAttribute(safeValue)}"`
    })

    sanitized = sanitized.replace(/\s+style\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, (_match, rawValue: string) => {
        const safeStyle = sanitizeInlineStyleValue(trimWrappedQuotes(rawValue))
        if (!safeStyle) {
            removedAttributeCount += 1
            return ''
        }
        return ` style="${escapeHtmlAttribute(safeStyle)}"`
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
