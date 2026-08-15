import { describe, expect, it } from 'vitest'
import {
    buildRealisticFlipKeyframes,
} from '@/components/Reader/paginatedReader/paginatedFlipLayer'

describe('paginatedFlipLayer 关键帧', () => {
    it('前进：0° 掀到 -168°，投影中段最强', () => {
        const frames = buildRealisticFlipKeyframes('forward')
        expect(frames).toHaveLength(3)
        expect(frames[0]?.transform).toBe('rotateY(0deg)')
        expect(frames[1]?.transform).toBe('rotateY(-84deg)')
        expect(frames[2]?.transform).toBe('rotateY(-168deg)')
        expect(frames[1]?.boxShadow).toContain('rgba(0, 0, 0')
        // 首尾无投影：掀页前是平铺页（无影），翻过后离屏（影随纸走）
        expect(frames[0]?.boxShadow).toBe('0 0 0 rgba(0, 0, 0, 0)')
        expect(frames[2]?.boxShadow).toBe('0 0 0 rgba(0, 0, 0, 0)')
        // 中段正好在半程（速度峰前投影最重）
        expect(frames[1]?.offset).toBe(0.5)
    })

    it('后退：-168° 盖回 0°，与前进镜像对称', () => {
        const backward = buildRealisticFlipKeyframes('backward')
        const forward = buildRealisticFlipKeyframes('forward')
        const backwardTransforms = backward.map((frame) => frame.transform)
        const forwardTransforms = forward.map((frame) => frame.transform)
        expect(backwardTransforms).toEqual([...forwardTransforms].reverse())
    })

    it('两种方向的角度都不越过 -168°/不超过 0°（不露镜像背面）', () => {
        for (const frame of buildRealisticFlipKeyframes('forward')) {
            const angle = Number(frame.transform.match(/rotateY\((-?\d+)deg\)/)?.[1] ?? 0)
            expect(angle).toBeLessThanOrEqual(0)
            expect(angle).toBeGreaterThanOrEqual(-168)
        }
        for (const frame of buildRealisticFlipKeyframes('backward')) {
            const angle = Number(frame.transform.match(/rotateY\((-?\d+)deg\)/)?.[1] ?? 0)
            expect(angle).toBeLessThanOrEqual(0)
            expect(angle).toBeGreaterThanOrEqual(-168)
        }
    })
})
