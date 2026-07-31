import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion'

describe('usePrefersReducedMotion', () => {
    afterEach(() => {
        cleanup()
        vi.unstubAllGlobals()
    })

    it('读取并订阅系统减少动态效果偏好', () => {
        let changeListener: ((event: MediaQueryListEvent) => void) | null = null
        vi.stubGlobal('matchMedia', vi.fn(() => ({
            matches: false,
            media: '(prefers-reduced-motion: reduce)',
            onchange: null,
            addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
                changeListener = listener
            },
            removeEventListener: vi.fn(),
            addListener: vi.fn(),
            removeListener: vi.fn(),
            dispatchEvent: vi.fn(),
        })))

        const { result } = renderHook(() => usePrefersReducedMotion())
        expect(result.current).toBe(false)

        act(() => changeListener?.({ matches: true } as MediaQueryListEvent))
        expect(result.current).toBe(true)
    })

    it('WebView 未提供 matchMedia 时回退为不开启减少动态', () => {
        vi.stubGlobal('matchMedia', undefined)

        const { result } = renderHook(() => usePrefersReducedMotion())

        expect(result.current).toBe(false)
    })
})
