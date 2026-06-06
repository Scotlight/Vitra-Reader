import { useEffect } from 'react'
import { READER_TABS, type ReaderPanelTab } from './readerPanelTypes'

interface UseReaderTabShortcutArgs {
    readonly enabled: boolean
    readonly activeTab: ReaderPanelTab
    readonly onTabChange: (tab: ReaderPanelTab) => void
}

function isEditableTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false
    const tag = target.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
    return target.isContentEditable
}

// Tab / Shift+Tab 在三个面板 tab 间循环切换。
// 输入框（搜索框等）内不拦截，保留原生焦点导航；enabled 关闭时完全不监听。
export function useReaderTabShortcut({ enabled, activeTab, onTabChange }: UseReaderTabShortcutArgs) {
    useEffect(() => {
        if (!enabled) return

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key !== 'Tab') return
            if (event.ctrlKey || event.metaKey || event.altKey) return
            if (isEditableTarget(event.target)) return

            event.preventDefault()
            const currentIndex = READER_TABS.indexOf(activeTab)
            const base = currentIndex < 0 ? 0 : currentIndex
            const delta = event.shiftKey ? -1 : 1
            const nextIndex = (base + delta + READER_TABS.length) % READER_TABS.length
            onTabChange(READER_TABS[nextIndex])
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [enabled, activeTab, onTabChange])
}
