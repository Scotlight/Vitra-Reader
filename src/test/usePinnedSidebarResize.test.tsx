import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PointerEvent as ReactPointerEvent } from 'react'
import {
    clampPinnedSidebarWidth,
    usePinnedSidebarResize,
} from '@/components/Reader/usePinnedSidebarResize'

function buildPointerDown(clientX: number, button = 0): ReactPointerEvent<HTMLElement> {
    return {
        button,
        clientX,
        preventDefault: vi.fn(),
    } as unknown as ReactPointerEvent<HTMLElement>
}

describe('clampPinnedSidebarWidth', () => {
    it('低于下限时收敛到 240', () => {
        expect(clampPinnedSidebarWidth(80, 1920)).toBe(240)
    })

    it('高于上限时收敛到 600', () => {
        expect(clampPinnedSidebarWidth(900, 1920)).toBe(600)
    })

    it('上限受视口一半约束', () => {
        expect(clampPinnedSidebarWidth(900, 1000)).toBe(500)
    })

    it('视口过窄时仍保住最小宽度', () => {
        expect(clampPinnedSidebarWidth(300, 400)).toBe(240)
    })

    it('小数宽度四舍五入', () => {
        expect(clampPinnedSidebarWidth(300.6, 1920)).toBe(301)
    })
})

describe('usePinnedSidebarResize', () => {
    afterEach(() => {
        cleanup()
    })

    it('未拖拽时使用持久化宽度，缺省回退 360', () => {
        const withPersisted = renderHook(() => usePinnedSidebarResize(420, vi.fn()))
        expect(withPersisted.result.current.sidebarWidth).toBe(420)
        expect(withPersisted.result.current.isResizing).toBe(false)

        const withoutPersisted = renderHook(() => usePinnedSidebarResize(undefined, undefined))
        expect(withoutPersisted.result.current.sidebarWidth).toBe(360)
    })

    it('拖拽实时更新宽度，松手提交夹紧值并退出拖拽态', () => {
        const onCommit = vi.fn()
        const { result } = renderHook(() => usePinnedSidebarResize(360, onCommit))

        act(() => {
            result.current.startResize(buildPointerDown(360))
        })
        expect(result.current.isResizing).toBe(true)

        act(() => {
            window.dispatchEvent(new MouseEvent('pointermove', { clientX: 480 }))
        })
        expect(result.current.sidebarWidth).toBe(480)
        expect(onCommit).not.toHaveBeenCalled()

        act(() => {
            window.dispatchEvent(new MouseEvent('pointerup'))
        })
        expect(onCommit).toHaveBeenCalledWith(480)
        expect(result.current.isResizing).toBe(false)
        expect(result.current.sidebarWidth).toBe(360)
    })

    it('非主键按下不进入拖拽', () => {
        const { result } = renderHook(() => usePinnedSidebarResize(360, vi.fn()))
        act(() => {
            result.current.startResize(buildPointerDown(500, 2))
        })
        expect(result.current.isResizing).toBe(false)
    })

    it('pointercancel 同样结束拖拽并提交当前宽度', () => {
        const onCommit = vi.fn()
        const { result } = renderHook(() => usePinnedSidebarResize(360, onCommit))
        act(() => {
            result.current.startResize(buildPointerDown(300))
        })
        act(() => {
            window.dispatchEvent(new Event('pointercancel'))
        })
        expect(onCommit).toHaveBeenCalledWith(300)
        expect(result.current.isResizing).toBe(false)
    })
})
