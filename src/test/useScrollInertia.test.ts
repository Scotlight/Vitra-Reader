import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useScrollInertia } from '@/hooks/useScrollInertia'

function createScrollableViewport(): HTMLElement {
    const viewport = document.createElement('div')
    Object.defineProperty(viewport, 'clientHeight', { configurable: true, value: 300 })
    Object.defineProperty(viewport, 'scrollHeight', { configurable: true, value: 2000 })
    viewport.scrollTop = 0
    return viewport
}

describe('useScrollInertia', () => {
    let frameCallbacks: FrameRequestCallback[]

    beforeEach(() => {
        frameCallbacks = []
        vi.stubGlobal('requestAnimationFrame', ((callback: FrameRequestCallback) => {
            frameCallbacks.push(callback)
            return frameCallbacks.length
        }) as typeof requestAnimationFrame)
        vi.stubGlobal('cancelAnimationFrame', vi.fn() as unknown as typeof cancelAnimationFrame)
    })

    afterEach(() => {
        cleanup()
        vi.unstubAllGlobals()
    })

    it('addImpulse 通过 rAF 驱动 scrollTop，恢复 wheel 平滑路径', () => {
        const viewport = createScrollableViewport()
        const viewportRef = { current: viewport }
        const { result } = renderHook(() => useScrollInertia(
            viewportRef,
            {
                friction: 0.08,
                stopThreshold: 0.01,
                springStiffness: 0.06,
                springDamping: 0.6,
            },
            {},
            {
                maxAbsVelocity: 96,
                impulseGain: 0.24,
                impulseBlend: 0.82,
                frameCapMs: 32,
            },
        ))

        act(() => {
            result.current.addImpulse(120)
        })
        expect(frameCallbacks).toHaveLength(1)

        act(() => {
            frameCallbacks[0]?.(16)
        })

        expect(viewport.scrollTop).toBeGreaterThan(0)
    })
})
