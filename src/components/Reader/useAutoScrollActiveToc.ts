import { useEffect, type RefObject } from 'react'
import type { ReaderPanelTab } from './ReaderLeftPanel'

interface UseAutoScrollActiveTocArgs {
    readonly activeTab: ReaderPanelTab
    readonly currentSectionHref: string
    readonly leftPanelOpen: boolean
    readonly tocLength: number
    readonly tocListRef: RefObject<HTMLDivElement>
}

export function useAutoScrollActiveToc({
    activeTab,
    currentSectionHref,
    leftPanelOpen,
    tocLength,
    tocListRef,
}: UseAutoScrollActiveTocArgs) {
    useEffect(() => {
        if (!leftPanelOpen || activeTab !== 'toc') return

        const timer = window.setTimeout(() => {
            const container = tocListRef.current
            if (!container) return

            const activeItem = container.querySelector('button[data-toc-active="true"]') as HTMLButtonElement | null
            if (!activeItem) return

            const containerRect = container.getBoundingClientRect()
            const itemRect = activeItem.getBoundingClientRect()
            const targetTop =
                container.scrollTop +
                (itemRect.top - containerRect.top) -
                containerRect.height / 2 +
                itemRect.height / 2

            container.scrollTo({
                top: Math.max(0, targetTop),
                behavior: 'auto',
            })
        }, 120)

        return () => {
            window.clearTimeout(timer)
        }
    }, [leftPanelOpen, activeTab, currentSectionHref, tocLength, tocListRef])
}
