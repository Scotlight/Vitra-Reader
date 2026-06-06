import { useEffect, type RefObject } from 'react'
import type { ReaderPanelTab } from './readerPanelTypes'
import { scheduleCenterActiveToc } from './tocAutoScroll'

interface UseAutoScrollActiveTocArgs {
    readonly activeTab: ReaderPanelTab
    readonly currentSectionHref: string
    readonly tocLength: number
    readonly tocListRef: RefObject<HTMLDivElement>
}

export function useAutoScrollActiveToc({
    activeTab,
    currentSectionHref,
    tocLength,
    tocListRef,
}: UseAutoScrollActiveTocArgs) {
    useEffect(() => {
        if (activeTab !== 'toc') return
        const cancel = scheduleCenterActiveToc(() => tocListRef.current)
        return () => cancel()
    }, [activeTab, currentSectionHref, tocLength, tocListRef])
}
