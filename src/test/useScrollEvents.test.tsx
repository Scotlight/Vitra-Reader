import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useRef } from 'react'
import { useScrollEvents } from '@/hooks/useScrollEvents'

const DEFAULT_WHEEL_CONFIG = {
    enabled: true,
    stepSizePx: 120,
    accelerationDeltaMs: 70,
    accelerationMax: 7,
    reverseDirection: false,
}

function WheelProbe({
    onWheelImpulse,
    wheelConfig = DEFAULT_WHEEL_CONFIG,
}: {
    onWheelImpulse: (deltaY: number) => void
    wheelConfig?: typeof DEFAULT_WHEEL_CONFIG
}) {
    const viewportRef = useRef<HTMLDivElement>(null)
    useScrollEvents(viewportRef, { onWheelImpulse, wheelConfig })
    return <div data-testid="viewport" ref={viewportRef} />
}

function dispatchWheel(target: Element, init: WheelEventInit): WheelEvent {
    const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, ...init })
    target.dispatchEvent(event)
    return event
}

describe('useScrollEvents wheel smoothing', () => {
    afterEach(() => cleanup())

    it('把垂直 wheel 输入转成物理冲量并阻止原生离散滚动', () => {
        const onWheelImpulse = vi.fn()
        const view = render(<WheelProbe onWheelImpulse={onWheelImpulse} />)
        const viewport = view.getByTestId('viewport')

        const event = dispatchWheel(viewport, { deltaY: 120, deltaX: 0, deltaMode: 0 })

        expect(event.defaultPrevented).toBe(true)
        expect(onWheelImpulse).toHaveBeenCalledTimes(1)
        expect(onWheelImpulse.mock.calls[0][0]).toBeGreaterThan(90)
        expect(onWheelImpulse.mock.calls[0][0]).toBeLessThan(92)
    })

    it('连续的小幅像素 wheel 不叠加滚轮加速，保留触摸板细粒度输入', () => {
        const onWheelImpulse = vi.fn()
        const view = render(<WheelProbe onWheelImpulse={onWheelImpulse} />)
        const viewport = view.getByTestId('viewport')

        dispatchWheel(viewport, { deltaY: 4, deltaX: 0, deltaMode: 0 })
        dispatchWheel(viewport, { deltaY: 4, deltaX: 0, deltaMode: 0 })

        expect(onWheelImpulse).toHaveBeenCalledTimes(2)
        expect(onWheelImpulse.mock.calls[1][0]).toBeCloseTo(onWheelImpulse.mock.calls[0][0], 3)
    })

    it('保留横向 wheel 与缩放手势的浏览器默认处理', () => {
        const onWheelImpulse = vi.fn()
        const view = render(<WheelProbe onWheelImpulse={onWheelImpulse} />)
        const viewport = view.getByTestId('viewport')

        const horizontal = dispatchWheel(viewport, { deltaY: 3, deltaX: 30, deltaMode: 0 })
        const zoom = dispatchWheel(viewport, { deltaY: 120, deltaX: 0, deltaMode: 0, ctrlKey: true })

        expect(horizontal.defaultPrevented).toBe(false)
        expect(zoom.defaultPrevented).toBe(false)
        expect(onWheelImpulse).not.toHaveBeenCalled()
    })

    it('关闭 wheel 平滑时不拦截原生滚动', () => {
        const onWheelImpulse = vi.fn()
        const view = render(
            <WheelProbe
                onWheelImpulse={onWheelImpulse}
                wheelConfig={{ ...DEFAULT_WHEEL_CONFIG, enabled: false }}
            />
        )
        const viewport = view.getByTestId('viewport')

        const event = dispatchWheel(viewport, { deltaY: 120, deltaX: 0, deltaMode: 0 })

        expect(event.defaultPrevented).toBe(false)
        expect(onWheelImpulse).not.toHaveBeenCalled()
    })
})
