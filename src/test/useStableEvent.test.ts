import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useLatestRef, useStableEvent } from '@/hooks/useStableEvent'

describe('useLatestRef', () => {
  afterEach(() => cleanup())

  it('保持 ref identity，并更新 current 值', () => {
    const { result, rerender } = renderHook(({ value }) => useLatestRef(value), {
      initialProps: { value: 'first' },
    })

    const initialRef = result.current
    expect(initialRef.current).toBe('first')

    rerender({ value: 'second' })

    expect(result.current).toBe(initialRef)
    expect(result.current.current).toBe('second')
  })
})

describe('useStableEvent', () => {
  afterEach(() => cleanup())

  it('保持回调 identity 稳定，并调用最新闭包', () => {
    const first = vi.fn((value: number) => `first:${value}`)
    const second = vi.fn((value: number) => `second:${value}`)

    const { result, rerender } = renderHook(({ callback }) => useStableEvent(callback), {
      initialProps: { callback: first },
    })

    const stableCallback = result.current
    expect(stableCallback(1)).toBe('first:1')

    rerender({ callback: second })

    expect(result.current).toBe(stableCallback)
    expect(result.current(2)).toBe('second:2')
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('透传参数和返回值类型', () => {
    const callback = vi.fn((left: number, right: number) => left + right)
    const { result } = renderHook(() => useStableEvent(callback))

    expect(result.current(2, 3)).toBe(5)
    expect(callback).toHaveBeenCalledWith(2, 3)
  })
})
