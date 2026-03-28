import { describe, expect, it } from 'vitest'
import { decodeMobiText } from '../engine/parsers/providers/mobiTextDecoding'

describe('decodeMobiText', () => {
    it('CP1252 声明但正文实际为 UTF-8 中文时优先还原可读文本', () => {
        const original = '这是一本不会再乱码的中文 MOBI。'
        const encoded = new TextEncoder().encode(original)

        expect(decodeMobiText(encoded, 1252)).toBe(original)
    })

    it('未知编码号且 UTF-8 解码出现替换字符时，自动回退可读编码', () => {
        const bytes = new Uint8Array([0x3c, 0x70, 0x3e, 0x48, 0x65, 0x6c, 0x6c, 0x6f, 0xa9, 0x3c, 0x2f, 0x70, 0x3e])
        const decoded = decodeMobiText(bytes, 0)

        expect(decoded).toContain('<p>')
        expect(decoded).toContain('©')
        expect(decoded).not.toContain('�')
    })
})
