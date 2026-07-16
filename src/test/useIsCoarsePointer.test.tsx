import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useIsCoarsePointer } from '@/hooks/useIsCoarsePointer'

interface FakeMediaQuery {
    matches: boolean
    addEventListener: ReturnType<typeof vi.fn>
    removeEventListener: ReturnType<typeof vi.fn>
    dispatch: (matches: boolean) => void
}

function stubMatchMedia(initialMatches: boolean): FakeMediaQuery {
    let listener: ((event: { matches: boolean }) => void) | null = null
    const fake: FakeMediaQuery = {
        matches: initialMatches,
        addEventListener: vi.fn((_event: string, cb: (event: { matches: boolean }) => void) => {
            listener = cb
        }),
        removeEventListener: vi.fn(),
        dispatch: (matches: boolean) => {
            fake.matches = matches
            listener?.({ matches })
        },
    }
    vi.stubGlobal('matchMedia', vi.fn(() => fake))
    return fake
}

describe('useIsCoarsePointer', () => {
    afterEach(() => {
        cleanup()
        vi.unstubAllGlobals()
    })

    it('触摸主指针返回 true', () => {
        stubMatchMedia(true)
        const { result } = renderHook(() => useIsCoarsePointer())
        expect(result.current).toBe(true)
    })

    it('鼠标主指针返回 false', () => {
        stubMatchMedia(false)
        const { result } = renderHook(() => useIsCoarsePointer())
        expect(result.current).toBe(false)
    })

    it('无 matchMedia 时缺省按桌面处理', () => {
        vi.stubGlobal('matchMedia', undefined)
        const { result } = renderHook(() => useIsCoarsePointer())
        expect(result.current).toBe(false)
    })

    it('指针能力变化时实时更新', () => {
        const fake = stubMatchMedia(false)
        const { result } = renderHook(() => useIsCoarsePointer())
        expect(result.current).toBe(false)

        act(() => {
            fake.dispatch(true)
        })
        expect(result.current).toBe(true)
    })

    it('卸载时移除监听', () => {
        const fake = stubMatchMedia(true)
        const { unmount } = renderHook(() => useIsCoarsePointer())
        unmount()
        expect(fake.removeEventListener).toHaveBeenCalledTimes(1)
    })
})
