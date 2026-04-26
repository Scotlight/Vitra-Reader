import { describe, it, expect } from 'vitest'
import {
    escapeHtml,
    escapeHtmlAttribute,
    sanitizeChapterHtml,
    sanitizeUrlValue,
} from '@/engine/core/contentSanitizer'

describe('escapeHtml', () => {
    it('转义 & < >', () => {
        expect(escapeHtml('<b>a & b</b>')).toBe('&lt;b&gt;a &amp; b&lt;/b&gt;')
    })
    it('无特殊字符原样返回', () => {
        expect(escapeHtml('hello')).toBe('hello')
    })
})

describe('escapeHtmlAttribute', () => {
    it('转义双引号', () => {
        expect(escapeHtmlAttribute('say "hi"')).toBe('say &quot;hi&quot;')
    })
    it('转义 < > &', () => {
        expect(escapeHtmlAttribute('<a&b>')).toBe('&lt;a&amp;b&gt;')
    })
})

describe('sanitizeUrlValue', () => {
    it('允许 # 锚点链接', () => {
        expect(sanitizeUrlValue('#chapter1')).toBe('#chapter1')
    })

    it('拦截 javascript: 协议', () => {
        expect(sanitizeUrlValue('javascript:alert(1)')).toBe('')
    })

    it('拦截大写 JAVASCRIPT: 协议', () => {
        expect(sanitizeUrlValue('JAVASCRIPT:alert(1)')).toBe('')
    })

    it('拦截 vbscript: 协议', () => {
        expect(sanitizeUrlValue('vbscript:msgbox(1)')).toBe('')
    })

    it('允许 data:image/ 协议', () => {
        const url = 'data:image/png;base64,abc'
        expect(sanitizeUrlValue(url)).toBe(url)
    })

    it('拦截 data:text/ 协议', () => {
        expect(sanitizeUrlValue('data:text/html,<h1>xss</h1>')).toBe('')
    })

    it('允许 blob: 协议', () => {
        const url = 'blob:http://localhost/123'
        expect(sanitizeUrlValue(url)).toBe(url)
    })

    it('允许 vitra-res: 协议', () => {
        const url = 'vitra-res://assets/font.woff2'
        expect(sanitizeUrlValue(url)).toBe(url)
    })

    it('过滤 null 字节', () => {
        expect(sanitizeUrlValue('java\u0000script:alert(1)')).toBe('')
    })

    it('空字符串返回空字符串', () => {
        expect(sanitizeUrlValue('')).toBe('')
    })

    it('去除首尾引号', () => {
        expect(sanitizeUrlValue('"#anchor"')).toBe('#anchor')
    })
})

describe('sanitizeChapterHtml', () => {
    it('剥离 height=0 属性', () => {
        const { htmlContent } = sanitizeChapterHtml('<img src="vitra-res://a.png" height="0" width="100" />')
        expect(htmlContent).toContain('width="100"')
        expect(htmlContent).not.toContain('height="0"')
    })

    it('保留非零 height 属性', () => {
        const { htmlContent } = sanitizeChapterHtml('<img src="vitra-res://a.png" height="240" width="100" />')
        expect(htmlContent).toContain('height="240"')
    })
})
