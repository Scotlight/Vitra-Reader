import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, renderHook } from '@testing-library/react'
import { useReaderShortcuts } from '@/components/Reader/useReaderShortcuts'

function setup() {
    const onFontSizeDelta = vi.fn()
    const onThemeChange = vi.fn()
    const onToggleFullscreen = vi.fn()
    const view = renderHook(() => useReaderShortcuts({ onFontSizeDelta, onThemeChange, onToggleFullscreen }))
    return { onFontSizeDelta, onThemeChange, onToggleFullscreen, ...view }
}

function dispatchKey(key: string, init: KeyboardEventInit = {}): boolean {
    const event = new KeyboardEvent('keydown', { key, cancelable: true, ...init })
    window.dispatchEvent(event)
    return event.defaultPrevented
}

function dispatchWheel(deltaY: number, ctrlKey: boolean): boolean {
    const event = new WheelEvent('wheel', { deltaY, ctrlKey, cancelable: true })
    window.dispatchEvent(event)
    return event.defaultPrevented
}

describe('useReaderShortcuts', () => {
    afterEach(() => cleanup())

    it('Ctrl+= 调大字号并吃掉默认行为', () => {
        const { onFontSizeDelta } = setup()
        expect(dispatchKey('=', { ctrlKey: true })).toBe(true)
        expect(onFontSizeDelta).toHaveBeenCalledWith(1)
    })

    it('F2 切到深色主题', () => {
        const { onThemeChange } = setup()
        expect(dispatchKey('F2')).toBe(true)
        expect(onThemeChange).toHaveBeenCalledWith('dark')
    })

    it('F11 触发全屏切换', () => {
        const { onToggleFullscreen } = setup()
        expect(dispatchKey('F11')).toBe(true)
        expect(onToggleFullscreen).toHaveBeenCalledTimes(1)
    })

    // 这条是防回归的关键：滚轮是滚动阅读与分页翻页的主输入，
    // 一旦本 hook 把裸滚轮也吃掉，整个阅读器就翻不动页了。
    it('裸滚轮完全不参与：不改字号、不阻止默认行为', () => {
        const { onFontSizeDelta } = setup()
        expect(dispatchWheel(-200, false)).toBe(false)
        expect(dispatchWheel(200, false)).toBe(false)
        expect(onFontSizeDelta).not.toHaveBeenCalled()
    })

    it('Ctrl+滚轮攒够阈值才走一格，触摸板惯性不会把字号顶到底', () => {
        const { onFontSizeDelta } = setup()

        expect(dispatchWheel(-20, true)).toBe(true)
        expect(onFontSizeDelta).not.toHaveBeenCalled()

        dispatchWheel(-20, true)
        expect(onFontSizeDelta).toHaveBeenCalledTimes(1)
        expect(onFontSizeDelta).toHaveBeenLastCalledWith(1)

        dispatchWheel(-20, true)
        dispatchWheel(-20, true)
        expect(onFontSizeDelta).toHaveBeenCalledTimes(2)
    })

    it('Ctrl+向下滚缩小字号', () => {
        const { onFontSizeDelta } = setup()
        dispatchWheel(60, true)
        expect(onFontSizeDelta).toHaveBeenLastCalledWith(-1)
    })

    it('卸载后不再响应任何键位', () => {
        const { onFontSizeDelta, onThemeChange, unmount } = setup()
        unmount()
        expect(dispatchKey('=', { ctrlKey: true })).toBe(false)
        expect(dispatchKey('F1')).toBe(false)
        expect(onFontSizeDelta).not.toHaveBeenCalled()
        expect(onThemeChange).not.toHaveBeenCalled()
    })
})
