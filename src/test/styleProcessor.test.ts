import { describe, it, expect } from 'vitest'
import {
    scopeStyles,
    extractStyles,
    removeStyleTags,
    generateCSSOverride,
    generatePaginatedCSSOverride,
} from '../utils/styleProcessor'

const ID = 'ch-001'
const PREFIX = `[data-chapter-id="${ID}"]`

describe('scopeStyles — 普通选择器', () => {
    it('单个选择器加前缀', () => {
        const result = scopeStyles('p { color: red; }', ID)
        expect(result).toContain(`${PREFIX} p`)
    })

    it('多个选择器分别加前缀', () => {
        const result = scopeStyles('h1, h2 { font-size: 2em; }', ID)
        expect(result).toContain(`${PREFIX} h1`)
        expect(result).toContain(`${PREFIX} h2`)
    })

    it(':root 选择器替换为前缀本身', () => {
        const result = scopeStyles(':root { --color: red; }', ID)
        expect(result).not.toContain(':root')
        expect(result).toContain(PREFIX)
    })

    it('body 选择器替换为前缀', () => {
        const result = scopeStyles('body { margin: 0; }', ID)
        expect(result).not.toMatch(/\bbody\b/)
        expect(result).toContain(PREFIX)
    })

    it('空 CSS 返回空字符串', () => {
        expect(scopeStyles('', ID)).toBe('')
        expect(scopeStyles('   ', ID)).toBe('')
    })
})

describe('scopeStyles — @font-face 豁免', () => {
    it('@font-face 原样保留，不加 scope 前缀', () => {
        const css = `@font-face { font-family: "MyFont"; src: url(my.woff2); }`
        const result = scopeStyles(css, ID)
        expect(result).toContain('@font-face')
        expect(result).not.toContain(PREFIX)
    })

    it('@keyframes 原样保留', () => {
        const css = `@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`
        const result = scopeStyles(css, ID)
        expect(result).toContain('@keyframes spin')
        expect(result).not.toContain(PREFIX)
    })
})

describe('scopeStyles — @media 嵌套', () => {
    it('@media 内部选择器被递归 scope', () => {
        const css = `@media (max-width: 600px) { p { font-size: 14px; } }`
        const result = scopeStyles(css, ID)
        expect(result).toContain('@media (max-width: 600px)')
        expect(result).toContain(`${PREFIX} p`)
    })

    it('@supports 内部选择器被递归 scope', () => {
        const css = `@supports (display: grid) { .grid { display: grid; } }`
        const result = scopeStyles(css, ID)
        expect(result).toContain('@supports')
        expect(result).toContain(`${PREFIX} .grid`)
    })
})

describe('scopeStyles — @import / @charset 透传', () => {
    it('@charset 原样保留', () => {
        const css = `@charset "UTF-8"; p { color: red; }`
        const result = scopeStyles(css, ID)
        expect(result).toContain('@charset')
    })
})

describe('extractStyles / removeStyleTags', () => {
    it('提取单个 style 块', () => {
        const html = '<style>p { color: red; }</style><p>text</p>'
        const styles = extractStyles(html)
        expect(styles).toHaveLength(1)
        expect(styles[0]).toContain('color: red')
    })

    it('提取多个 style 块', () => {
        const html = '<style>a{}</style><p>x</p><style>b{}</style>'
        expect(extractStyles(html)).toHaveLength(2)
    })

    it('无 style 块返回空数组', () => {
        expect(extractStyles('<p>no styles</p>')).toHaveLength(0)
    })

    it('removeStyleTags 移除所有 style 块', () => {
        const html = '<style>p{}</style><p>text</p><style>a{}</style>'
        const result = removeStyleTags(html)
        expect(result).not.toContain('<style>')
        expect(result).toContain('<p>text</p>')
    })
})

describe('generateCSSOverride / generatePaginatedCSSOverride', () => {
    it('滚动模式 override 包含 column-count: auto', () => {
        expect(generateCSSOverride(ID)).toContain('column-count')
    })

    it('翻页模式 override 包含 break-before: auto', () => {
        expect(generatePaginatedCSSOverride(ID)).toContain('break-before')
    })

    it('override 包含 chapterId 前缀', () => {
        expect(generateCSSOverride(ID)).toContain(ID)
        expect(generatePaginatedCSSOverride(ID)).toContain(ID)
    })
})
