import { describe, expect, it } from 'vitest'
import { decodeMobiText } from '../engine/parsers/providers/mobiTextDecoding'

describe('decodeMobiText', () => {
    it('CP1252 声明但正文实际为 UTF-8 中文时优先还原可读文本', () => {
        const original = '这是一本不会再乱码的中文 MOBI。'
        const encoded = new TextEncoder().encode(original)

        expect(decodeMobiText(encoded, 1252)).toBe(original)
    })
})
