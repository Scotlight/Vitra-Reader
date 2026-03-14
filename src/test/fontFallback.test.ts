import { describe, it, expect } from 'vitest'
import { buildFontFamilyWithFallback } from '../utils/fontFallback'

describe('buildFontFamilyWithFallback', () => {
    it('单字体后追加回退栈', () => {
        const result = buildFontFamilyWithFallback('Arial')
        expect(result).toContain('Arial')
        expect(result).toContain('sans-serif')
    })

    it('空字符串使用 system-ui 作为首选', () => {
        const result = buildFontFamilyWithFallback('')
        expect(result).toContain('system-ui')
        expect(result).toContain('sans-serif')
    })

    it('已包含的字体不重复', () => {
        const result = buildFontFamilyWithFallback('"Microsoft YaHei"')
        const tokens = result.split(',').map(t => t.trim())
        const count = tokens.filter(t => t.toLowerCase().includes('microsoft yahei')).length
        expect(count).toBe(1)
    })

    it('多字体输入保持顺序', () => {
        const result = buildFontFamilyWithFallback('"Custom Font", Georgia')
        expect(result.indexOf('Custom Font')).toBeLessThan(result.indexOf('Georgia'))
    })

    it('始终以 sans-serif 结尾', () => {
        const result = buildFontFamilyWithFallback('MyFont')
        const tokens = result.split(',').map(t => t.trim())
        expect(tokens[tokens.length - 1]).toBe('sans-serif')
    })

    it('带引号的字体名去重正确', () => {
        const result = buildFontFamilyWithFallback('"Segoe UI"')
        const tokens = result.split(',').map(t => t.trim().replace(/^['"]|['"]$/g, '').toLowerCase())
        const count = tokens.filter(t => t === 'segoe ui').length
        expect(count).toBe(1)
    })

    it('中文字体名正确包含', () => {
        const result = buildFontFamilyWithFallback('"思源宋体"')
        expect(result).toContain('思源宋体')
    })
})
