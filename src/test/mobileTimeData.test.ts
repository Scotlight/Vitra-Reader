import { describe, expect, it } from 'vitest'
import {
    formatCompactDuration,
    normalizeTrendBars,
    resolveTodayBarIndex,
    toTopBookRatios,
} from '@/components/Library/mobileTime/mobileTimeData'

describe('mobileTimeData', () => {
    describe('normalizeTrendBars', () => {
        it('全 0 时返回全 0，不产生 NaN', () => {
            const trend = [
                { dateKey: '2026-08-01', activeMs: 0 },
                { dateKey: '2026-08-02', activeMs: 0 },
            ]
            expect(normalizeTrendBars(trend)).toEqual([0, 0])
        })

        it('单点非 0 时该点为 1', () => {
            const trend = [{ dateKey: '2026-08-02', activeMs: 600_000 }]
            expect(normalizeTrendBars(trend)).toEqual([1])
        })

        it('按最高柱归一化', () => {
            const trend = [
                { dateKey: '2026-08-01', activeMs: 300_000 },
                { dateKey: '2026-08-02', activeMs: 600_000 },
                { dateKey: '2026-08-03', activeMs: 150_000 },
            ]
            expect(normalizeTrendBars(trend)).toEqual([0.5, 1, 0.25])
        })

        it('空数组返回空数组', () => {
            expect(normalizeTrendBars([])).toEqual([])
        })
    })

    describe('toTopBookRatios', () => {
        it('榜首恒为 1', () => {
            const items = [
                { bookId: 'a', activeMs: 600_000 },
                { bookId: 'b', activeMs: 300_000 },
            ]
            expect(toTopBookRatios(items)).toEqual([1, 0.5])
        })

        it('榜首为 0 时全 0', () => {
            const items = [
                { bookId: 'a', activeMs: 0 },
                { bookId: 'b', activeMs: 0 },
            ]
            expect(toTopBookRatios(items)).toEqual([0, 0])
        })

        it('空数组返回空数组', () => {
            expect(toTopBookRatios([])).toEqual([])
        })
    })

    describe('formatCompactDuration', () => {
        it('0 显示 0m', () => {
            expect(formatCompactDuration(0)).toBe('0m')
        })

        it('不足 1 分钟显示 <1m', () => {
            expect(formatCompactDuration(30_000)).toBe('<1m')
        })

        it('不足 1 小时显示分钟', () => {
            expect(formatCompactDuration(18 * 60_000)).toBe('18m')
        })

        it('59分59秒 仍是 59m', () => {
            expect(formatCompactDuration(59 * 60_000 + 59_000)).toBe('59m')
        })

        it('满 1 小时向下取整为小时', () => {
            expect(formatCompactDuration(90 * 60_000)).toBe('1h')
            expect(formatCompactDuration(42 * 3_600_000 + 18 * 60_000)).toBe('42h')
        })

        it('负数按 0 处理', () => {
            expect(formatCompactDuration(-100)).toBe('0m')
        })
    })

    describe('resolveTodayBarIndex', () => {
        it('最后一条即今天', () => {
            const trend = [
                { dateKey: '2026-08-01', activeMs: 0 },
                { dateKey: '2026-08-02', activeMs: 0 },
            ]
            expect(resolveTodayBarIndex(trend)).toBe(1)
        })

        it('空数组返回 -1', () => {
            expect(resolveTodayBarIndex([])).toBe(-1)
        })
    })
})
