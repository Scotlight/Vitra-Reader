import { useEffect, type RefObject } from 'react'
import type { ReaderPanelTab } from './ReaderLeftPanel'
import { scheduleCenterActiveToc } from './tocAutoScroll'

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
        const cancel = scheduleCenterActiveToc(() => tocListRef.current)
        return () => cancel()
    }, [leftPanelOpen, activeTab, currentSectionHref, tocLength, tocListRef])
}
