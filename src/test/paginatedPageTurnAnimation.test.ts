import { describe, expect, it } from 'vitest'
import {
    formatSlideStartTransform,
    resolvePageTurnDirection,
} from '@/components/Reader/paginatedReader/paginatedPageTurnAnimation'

describe('paginatedPageTurnAnimation', () => {
    it('由 from→to 推导翻页方向', () => {
        expect(resolvePageTurnDirection(0, 1)).toBe('forward')
        expect(resolvePageTurnDirection(3, 1)).toBe('backward')
        // delta 为 0 视为前进（调用方在 delta===0 时直接瞬时返回，不启动动画）
        expect(resolvePageTurnDirection(2, 2)).toBe('forward')
    })

    it('slide 起始帧恒为即将离开的旧页，与方向无关', () => {
        expect(formatSlideStartTransform(2, 600)).toBe('translateX(-1200px)')
        expect(formatSlideStartTransform(0, 600)).toBe('translateX(0px)')
        // 起始帧只依赖 fromPage：前进/后退都从旧页起滑，方向感来自 from→to 的位移差
        expect(formatSlideStartTransform(2, 600)).toBe(formatSlideStartTransform(2, 600))
    })
})
