import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderHook, cleanup } from '@testing-library/react'
import { useReaderTabShortcut } from '@/components/Reader/useReaderTabShortcut'
import type { ReaderPanelTab } from '@/components/Reader/readerPanelTypes'

function dispatchTab(opts: { shiftKey?: boolean; ctrlKey?: boolean; target?: EventTarget } = {}): boolean {
    const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: opts.shiftKey ?? false, ctrlKey: opts.ctrlKey ?? false, cancelable: true })
    if (opts.target) Object.defineProperty(event, 'target', { value: opts.target, configurable: true })
    window.dispatchEvent(event)
    return event.defaultPrevented
}

describe('useReaderTabShortcut', () => {
    afterEach(() => cleanup())

    it('Tab 正向循环：toc → search → annotations → toc', () => {
        const onTabChange = vi.fn()
        const tabs: ReaderPanelTab[] = ['toc', 'search', 'annotations']
        tabs.forEach((activeTab, i) => {
            const { unmount } = renderHook(() => useReaderTabShortcut({ enabled: true, activeTab, onTabChange }))
            dispatchTab()
            const expected = (['search', 'annotations', 'toc'] as const)[i]!
            expect(onTabChange).toHaveBeenLastCalledWith(expected)
            unmount()
        })
    })

    it('Shift+Tab 反向循环：toc → annotations', () => {
        const onTabChange = vi.fn()
        renderHook(() => useReaderTabShortcut({ enabled: true, activeTab: 'toc', onTabChange }))
        const prevented = dispatchTab({ shiftKey: true })
        expect(prevented).toBe(true)
        expect(onTabChange).toHaveBeenCalledWith('annotations')
    })

    it('输入框内不拦截，保留原生焦点导航', () => {
        const onTabChange = vi.fn()
        renderHook(() => useReaderTabShortcut({ enabled: true, activeTab: 'toc', onTabChange }))
        const input = document.createElement('input')
        const prevented = dispatchTab({ target: input })
        expect(prevented).toBe(false)
        expect(onTabChange).not.toHaveBeenCalled()
    })

    it('enabled=false 时完全不响应', () => {
        const onTabChange = vi.fn()
        renderHook(() => useReaderTabShortcut({ enabled: false, activeTab: 'toc', onTabChange }))
        const prevented = dispatchTab()
        expect(prevented).toBe(false)
        expect(onTabChange).not.toHaveBeenCalled()
    })

    it('带 Ctrl/Meta 修饰键时跳过（不抢系统快捷键）', () => {
        const onTabChange = vi.fn()
        renderHook(() => useReaderTabShortcut({ enabled: true, activeTab: 'toc', onTabChange }))
        dispatchTab({ ctrlKey: true })
        expect(onTabChange).not.toHaveBeenCalled()
    })
})
