import { describe, it, expect, beforeEach, vi } from 'vitest'
import { estimateLineWidth, invalidateCharWidthTable } from '../engine/render/charWidthTable'

// 构造最小 CanvasRenderingContext2D mock
function makeCtx(measureWidth: (text: string) => number): CanvasRenderingContext2D {
    return {
        font: '',
        save: vi.fn(),
        restore: vi.fn(),
        measureText: vi.fn((text: string) => ({ width: measureWidth(text) })),
    } as unknown as CanvasRenderingContext2D
}

beforeEach(() => {
    invalidateCharWidthTable()
})

describe('estimateLineWidth - ASCII 查表', () => {
    it('纯 ASCII 文本命中查表，不调用 measureText（建表后）', () => {
        const ctx = makeCtx((text) => text.length * 0.6) // 采样时每字符宽 0.6px@1px
        const font = '16px sans-serif'

        // 第一次调用触发 buildTable（会调用 measureText 采样）
        const width1 = estimateLineWidth(ctx, 'Hello', 16, font)
        const callsAfterBuild = (ctx.measureText as ReturnType<typeof vi.fn>).mock.calls.length

        // 第二次调用同字体，不应再触发 measureText（全部命中表）
        ;(ctx.measureText as ReturnType<typeof vi.fn>).mockClear()
        const width2 = estimateLineWidth(ctx, 'World', 16, font)

        expect(ctx.measureText).not.toHaveBeenCalled()
        expect(width1).toBeGreaterThan(0)
        expect(width2).toBeGreaterThan(0)
        expect(callsAfterBuild).toBeGreaterThan(0)
        // 采样用 0.6px@1px，实际宽度 = 0.6 * 16 * charCount
        expect(width2).toBeCloseTo(0.6 * 16 * 5, 1)
    })
})

describe('estimateLineWidth - 常用汉字查表', () => {
    it('采样字集内的汉字建表后命中，不再调用 measureText', () => {
        // 汉字宽度通常约为字号 1 倍（全角）
        const ctx = makeCtx(() => 1.0)
        const font = '18px serif'

        // 触发建表（采样字集包含 U+4E00-U+5B17 前 2500 字）
        estimateLineWidth(ctx, '\u4E00', 18, font)

        // 清除调用记录后再测——使用确定在字集内的前几个汉字
        ;(ctx.measureText as ReturnType<typeof vi.fn>).mockClear()
        // \u4E00 一 \u4E01 丁 \u4E03 七 \u4E04 丄 均在前 2500 字内
        const width = estimateLineWidth(ctx, '\u4E00\u4E01\u4E03\u4E04', 18, font)

        expect(ctx.measureText).not.toHaveBeenCalled()
        // 4 个汉字，每个 1.0px@1px，× 18 = 72
        expect(width).toBeCloseTo(1.0 * 18 * 4, 1)
    })
})

describe('estimateLineWidth - 生僻字 fallback 并写回', () => {
    it('表外字符触发 measureText fallback，结果写回表后下次不再 fallback', () => {
        const ctx = makeCtx(() => 1.2) // 所有字符统一返回 1.2px
        const font = '14px serif'
        const rareChar = '\u9FA6' // CJK 扩展 A 区第一字，不在采样字集内

        // 触发建表
        estimateLineWidth(ctx, 'a', 14, font)
        ;(ctx.measureText as ReturnType<typeof vi.fn>).mockClear()

        // 第一次：生僻字应 fallback 到 measureText
        estimateLineWidth(ctx, rareChar, 14, font)
        expect(ctx.measureText).toHaveBeenCalled()

        // 第二次：已写回表，不再 fallback
        ;(ctx.measureText as ReturnType<typeof vi.fn>).mockClear()
        estimateLineWidth(ctx, rareChar, 14, font)
        expect(ctx.measureText).not.toHaveBeenCalled()
    })
})

describe('estimateLineWidth - 字重变化触发重建', () => {
    it('regular 切 bold 时重建字宽表', () => {
        const ctx = makeCtx((text) => text.length * 0.6)
        const regularFont = '16px sans-serif'
        const boldFont = 'bold 16px sans-serif'

        estimateLineWidth(ctx, 'test', 16, regularFont)
        const callsAfterRegular = (ctx.measureText as ReturnType<typeof vi.fn>).mock.calls.length

        // 切换到 bold，应触发重建
        ;(ctx.measureText as ReturnType<typeof vi.fn>).mockClear()
        estimateLineWidth(ctx, 'test', 16, boldFont)
        const callsForBold = (ctx.measureText as ReturnType<typeof vi.fn>).mock.calls.length

        // 重建时会对 SAMPLE_CHARS 全量采样，调用次数应 > 0
        expect(callsForBold).toBeGreaterThan(0)
        expect(callsAfterRegular).toBeGreaterThan(0)
    })

    it('只改行高不重建字宽表', () => {
        const ctx = makeCtx((text) => text.length * 0.6)
        const font1 = 'bold 16px/1.5 sans-serif'
        const font2 = 'bold 16px/2.0 sans-serif'

        estimateLineWidth(ctx, 'test', 16, font1)
        ;(ctx.measureText as ReturnType<typeof vi.fn>).mockClear()

        // 只改行高，字重+字族不变，不应重建
        estimateLineWidth(ctx, 'test', 16, font2)
        expect(ctx.measureText).not.toHaveBeenCalled()
    })
})
