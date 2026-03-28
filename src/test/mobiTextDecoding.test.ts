import { describe, expect, it } from 'vitest'
import { decodeMobiText } from '../engine/parsers/providers/mobiTextDecoding'

describe('decodeMobiText', () => {
    it('CP1252 声明但正文实际为 UTF-8 中文时优先还原可读文本', () => {
        const original = '这是一本不会再乱码的中文 MOBI。'
        const encoded = new TextEncoder().encode(original)

        expect(decodeMobiText(encoded, 1252)).toBe(original)
    })

    it('CP1252 声明但正文实际为 GBK 中文时，优先回退到中文可读结果', () => {
        // "<p>中文</p>" 其中 "中文" 为 GBK: D6 D0 CE C4
        const bytes = new Uint8Array([0x3c, 0x70, 0x3e, 0xd6, 0xd0, 0xce, 0xc4, 0x3c, 0x2f, 0x70, 0x3e])
        const decoded = decodeMobiText(bytes, 1252)

        expect(decoded).toContain('<p>')
        expect(decoded).toContain('中文')
        expect(decoded).not.toContain('�')
    })

    it('UTF-8 声明但正文实际为 GBK 中文时，回退到中文可读结果', () => {
        // "<p>罗中夏</p>"，中文部分采用 GBK 编码
        const bytes = new Uint8Array([
            0x3c, 0x70, 0x3e,
            0xc2, 0xde, 0xd6, 0xd0, 0xcf, 0xc4,
            0x3c, 0x2f, 0x70, 0x3e,
        ])
        const decoded = decodeMobiText(bytes, 65001)

        expect(decoded).toContain('<p>')
        expect(decoded).toContain('罗中夏')
        expect(decoded).not.toContain('�')
    })
})
