import { describe, it, expect } from 'vitest'
import { isChapterTitle, normalizeTitleLine } from '@/engine/render/chapterTitleDetector'

describe('normalizeTitleLine', () => {
    it('去除首尾空白', () => {
        expect(normalizeTitleLine('  第一章  ')).toBe('第一章')
    })

    it('去除装饰符号 = - _', () => {
        expect(normalizeTitleLine('=== 第一章 ===')).toBe(' 第一章 ')
    })

    it('压缩多余空格', () => {
        expect(normalizeTitleLine('第  一  章')).toBe('第 一 章')
    })

    it('去除换行制表', () => {
        expect(normalizeTitleLine('第一章\n正文')).toBe('第一章正文')
    })
})

describe('isChapterTitle — 中文模式', () => {
    it('「第N章」阿拉伯数字', () => {
        expect(isChapterTitle('第1章 开始')).toBe(true)
    })

    it('「第N章」中文数字', () => {
        expect(isChapterTitle('第一章 开始')).toBe(true)
    })

    it('「第N节」', () => {
        expect(isChapterTitle('第三节 内容')).toBe(true)
    })

    it('「卷N」模式', () => {
        expect(isChapterTitle('卷一 序章')).toBe(true)
    })

    it('序章特殊起始词', () => {
        expect(isChapterTitle('序章')).toBe(true)
    })

    it('前言特殊起始词', () => {
        expect(isChapterTitle('前言')).toBe(true)
    })

    it('后记特殊起始词', () => {
        expect(isChapterTitle('后记')).toBe(true)
    })
})

describe('isChapterTitle — 英文模式', () => {
    it('Chapter N', () => {
        expect(isChapterTitle('Chapter 1')).toBe(true)
    })

    it('CHAPTER N 大写', () => {
        expect(isChapterTitle('CHAPTER 10 The Beginning')).toBe(true)
    })

    it('Prologue', () => {
        expect(isChapterTitle('Prologue')).toBe(true)
    })

    it('Epilogue', () => {
        expect(isChapterTitle('Epilogue')).toBe(true)
    })
})

describe('isChapterTitle — 排除规则', () => {
    it('超过最大长度时返回 false', () => {
        const longLine = '第一章 ' + 'a'.repeat(50)
        expect(isChapterTitle(longLine)).toBe(false)
    })

    it('普通正文句子返回 false', () => {
        expect(isChapterTitle('他走进了那扇门，看见了光。')).toBe(false)
    })

    it('TXT 模式：含正文标点排除', () => {
        expect(isChapterTitle('这是一句话，很长。', { excludeBodyPunctuation: true })).toBe(false)
    })

    it('空字符串返回 false', () => {
        expect(isChapterTitle('')).toBe(false)
    })
})
