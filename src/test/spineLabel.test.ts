import { describe, expect, it } from 'vitest'
import { buildSpineFallbackLabel } from '@/engine/core/spineLabel'

describe('buildSpineFallbackLabel', () => {
    it('从 spine href 生成可读标题', () => {
        expect(buildSpineFallbackLabel('OPS/Text/chapter_01.xhtml#start', 0)).toBe('chapter 01')
        expect(buildSpineFallbackLabel('Text/%E7%AC%AC%E4%B8%80%E7%AB%A0.html', 0)).toBe('第一章')
    })

    it('href 为空或无法清理时返回序号 fallback', () => {
        expect(buildSpineFallbackLabel('', 2)).toBe('Chapter 3')
        expect(buildSpineFallbackLabel('/.xhtml', 1)).toBe('Chapter 2')
    })

    it('保留无法解码的原始文件名', () => {
        expect(buildSpineFallbackLabel('Text/%E0%A4%A.xhtml', 0)).toBe('%E0%A4%A')
    })
})
