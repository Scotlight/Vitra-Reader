import { describe, expect, it } from 'vitest'
import {
    DEFAULT_SWIPE_CONFIG,
    resolveDragOffset,
    resolveSwipeIntent,
    shouldCommitSwipe,
} from '@/components/Reader/paginatedReader/paginatedSwipeGesture'

describe('paginatedSwipeGesture', () => {
    describe('resolveSwipeIntent', () => {
        it('横向位移未达 44px 保持待定', () => {
            expect(resolveSwipeIntent(30, 5)).toBe('undecided')
            expect(resolveSwipeIntent(-44, 0)).toBe('undecided')
        })

        it('横向超阈值且大于纵向 1.4 倍 → 认定横滑', () => {
            expect(resolveSwipeIntent(60, 10)).toBe('horizontal')
            expect(resolveSwipeIntent(-60, -40)).toBe('horizontal')
        })

        it('横向超阈值但纵向占比过高 → 拒绝', () => {
            expect(resolveSwipeIntent(60, 50)).toBe('rejected')
        })

        it('纵向已明显占优时提前拒绝，不等横向达阈值', () => {
            expect(resolveSwipeIntent(10, 80)).toBe('rejected')
        })
    })

    describe('shouldCommitSwipe', () => {
        it('位移超页宽 30% 提交', () => {
            expect(shouldCommitSwipe(121, 400, 0)).toBe(true)
            expect(shouldCommitSwipe(-121, 400, 0)).toBe(true)
            expect(shouldCommitSwipe(100, 400, 0)).toBe(false)
        })

        it('快扫（速度 >0.5px/ms）短距离也提交', () => {
            expect(shouldCommitSwipe(60, 400, 0.8)).toBe(true)
            expect(shouldCommitSwipe(60, 400, -0.8)).toBe(true)
            expect(shouldCommitSwipe(60, 400, 0.3)).toBe(false)
        })

        it('页宽非法时不提交', () => {
            expect(shouldCommitSwipe(500, 0, 9)).toBe(false)
        })
    })

    describe('resolveDragOffset', () => {
        it('边界外方向乘阻尼：第一页往前拖', () => {
            expect(resolveDragOffset(100, false, true)).toBeCloseTo(35)
        })

        it('最后一页往后拖同样阻尼', () => {
            expect(resolveDragOffset(-100, true, false)).toBeCloseTo(-35)
        })

        it('可翻方向不衰减', () => {
            expect(resolveDragOffset(100, true, true)).toBe(100)
            expect(resolveDragOffset(-100, true, true)).toBe(-100)
        })

        it('阻尼系数来自配置', () => {
            expect(resolveDragOffset(100, false, true, { ...DEFAULT_SWIPE_CONFIG, edgeDampingFactor: 0.5 })).toBe(50)
        })
    })
})
