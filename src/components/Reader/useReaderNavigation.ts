import { useCallback, useEffect, useRef, type Dispatch, type RefObject, type SetStateAction } from 'react'
import type { ContentProvider, SearchResult } from '@/engine/core/contentProvider'
import type { PaginatedReaderHandle } from './PaginatedReaderView'
import type { ScrollReaderHandle } from './ScrollReaderView'
import { normalizeTocHref } from './readerToc'

const JUMP_TARGET_DELAY_MS = 500
const MOBILE_BREAKPOINT_PX = 768

type ReaderTab = 'toc' | 'search' | 'annotations'

interface ReaderJumpTarget {
    readonly location: string
    readonly searchText?: string
}

interface UseReaderNavigationOptions {
    readonly isReady: boolean
    readonly isScrollMode: boolean
    readonly jumpTarget?: ReaderJumpTarget | null
    readonly paginatedReaderRef: RefObject<PaginatedReaderHandle | null>
    readonly providerRef: RefObject<ContentProvider | null>
    readonly scrollReaderRef: RefObject<ScrollReaderHandle | null>
    readonly searchQuery: string
    readonly setActiveTab: Dispatch<SetStateAction<ReaderTab>>
    readonly setCurrentSectionHref: Dispatch<SetStateAction<string>>
    readonly setIsSearching: Dispatch<SetStateAction<boolean>>
    readonly setLeftPanelOpen: Dispatch<SetStateAction<boolean>>
    readonly setSearchResults: Dispatch<SetStateAction<SearchResult[]>>
    readonly setSettingsOpen: Dispatch<SetStateAction<boolean>>
}

export function useReaderNavigation({
    isReady,
    isScrollMode,
    jumpTarget,
    paginatedReaderRef,
    providerRef,
    scrollReaderRef,
    searchQuery,
    setActiveTab,
    setCurrentSectionHref,
    setIsSearching,
    setLeftPanelOpen,
    setSearchResults,
    setSettingsOpen,
}: UseReaderNavigationOptions) {
    const jumpTargetDoneRef = useRef(false)

    const jumpToAnnotation = useCallback(async (location: string, searchText?: string) => {
        const spineIndex = resolveSpineIndex(location)
        if (spineIndex === null) return
        await jumpToReaderSpine(isScrollMode, scrollReaderRef, paginatedReaderRef, spineIndex, searchText)
        closeLeftPanelOnMobile(setLeftPanelOpen)
    }, [isScrollMode, paginatedReaderRef, scrollReaderRef, setLeftPanelOpen])

    const handleTocClick = useCallback(async (href: string) => {
        setCurrentSectionHref(normalizeTocHref(href))
        const provider = providerRef.current
        if (!provider) return
        const spineIndex = provider.getSpineIndexByHref(href)
        if (spineIndex >= 0) {
            await jumpToReaderSpine(isScrollMode, scrollReaderRef, paginatedReaderRef, spineIndex)
        }
        closeLeftPanelOnMobile(setLeftPanelOpen)
    }, [isScrollMode, paginatedReaderRef, providerRef, scrollReaderRef, setCurrentSectionHref, setLeftPanelOpen])

    const handleSearchWithKeyword = useCallback(async (keyword: string) => {
        if (!keyword.trim() || !providerRef.current) return
        setIsSearching(true)
        setSearchResults([])
        try {
            const results = await providerRef.current.search(keyword)
            setSearchResults(results)
        } catch (error) {
            console.error('Search failed', error)
        } finally {
            setIsSearching(false)
        }
    }, [providerRef, setIsSearching, setSearchResults])

    const handleSearch = useCallback(async () => {
        await handleSearchWithKeyword(searchQuery)
    }, [handleSearchWithKeyword, searchQuery])

    const toggleLeftPanel = useCallback(() => {
        setLeftPanelOpen((current) => {
            const next = !current
            if (next) setSettingsOpen(false)
            return next
        })
    }, [setLeftPanelOpen, setSettingsOpen])

    const toggleSettingsPanel = useCallback(() => {
        setSettingsOpen((current) => {
            const next = !current
            if (next) setLeftPanelOpen(false)
            return next
        })
    }, [setLeftPanelOpen, setSettingsOpen])

    const closePanels = useCallback(() => {
        setLeftPanelOpen(false)
        setSettingsOpen(false)
    }, [setLeftPanelOpen, setSettingsOpen])

    const openSearchPanelWithKeyword = useCallback((keyword: string) => {
        setActiveTab('search')
        setLeftPanelOpen(true)
        setSettingsOpen(false)
        void handleSearchWithKeyword(keyword)
    }, [handleSearchWithKeyword, setActiveTab, setLeftPanelOpen, setSettingsOpen])

    useEffect(() => {
        jumpTargetDoneRef.current = false
    }, [jumpTarget?.location, jumpTarget?.searchText])

    useEffect(() => {
        if (!jumpTarget || !isReady || jumpTargetDoneRef.current) return
        jumpTargetDoneRef.current = true
        const timer = window.setTimeout(() => {
            void jumpToAnnotation(jumpTarget.location, jumpTarget.searchText)
        }, JUMP_TARGET_DELAY_MS)
        return () => {
            window.clearTimeout(timer)
        }
    }, [isReady, jumpTarget, jumpToAnnotation])

    return {
        closePanels,
        handleSearch,
        handleSearchWithKeyword,
        handleTocClick,
        jumpToAnnotation,
        openSearchPanelWithKeyword,
        toggleLeftPanel,
        toggleSettingsPanel,
    }
}

function resolveSpineIndex(location: string): number | null {
    if (location.startsWith('vitra:') || location.startsWith('bdise:')) {
        return parseInt(location.split(':')[1], 10)
    }
    if (!location.startsWith('epubcfi(')) return null
    const match = location.match(/^epubcfi\(\/(\d+)\/(\d+)/)
    if (!match) return null
    return Math.max(0, Math.floor(parseInt(match[2], 10) / 2) - 1)
}

async function jumpToReaderSpine(
    isScrollMode: boolean,
    scrollReaderRef: RefObject<ScrollReaderHandle | null>,
    paginatedReaderRef: RefObject<PaginatedReaderHandle | null>,
    spineIndex: number,
    searchText?: string,
) {
    if (isScrollMode) {
        await scrollReaderRef.current?.jumpToSpine(spineIndex, searchText)
        return
    }
    await paginatedReaderRef.current?.jumpToSpine(spineIndex, searchText)
}

function closeLeftPanelOnMobile(setLeftPanelOpen: Dispatch<SetStateAction<boolean>>) {
    if (window.innerWidth >= MOBILE_BREAKPOINT_PX) return
    setLeftPanelOpen(false)
}
