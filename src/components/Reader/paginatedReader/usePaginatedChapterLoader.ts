import { useRef, useEffect, useCallback, useState, type MutableRefObject } from 'react'
import type { ContentProvider, SpineItemInfo } from '../../../engine/core/contentProvider'
import { preprocessChapterContent } from '../../../engine/render/chapterPreprocessService'

/** 章节切换淡出动画时长（ms），与 CSS transition 保持一致 */
const CHAPTER_FADE_DURATION_MS = 160

interface UsePaginatedChapterLoaderOptions {
    provider: ContentProvider
    renderedHighlightsRef: MutableRefObject<Set<string>>
    abortPaginationMeasure: () => void
    pendingLastPageRef: MutableRefObject<boolean>
    isInitialLoadRef: MutableRefObject<boolean>
    pageBoundariesRef: MutableRefObject<readonly unknown[]>
    pageMapReadyRef: MutableRefObject<boolean>
    currentSpineIndexRef: MutableRefObject<number>
    setCurrentSpineIndex: (index: number) => void
    setIsLoading: (v: boolean) => void
    setChapterFading: (v: boolean) => void
    setShadowData: (data: { htmlContent: string; htmlFragments: string[]; externalStyles: string[]; chapterId: string } | null) => void
    onLoadError?: (spineIndex: number) => void
}

export function usePaginatedChapterLoader({
    provider,
    renderedHighlightsRef,
    abortPaginationMeasure,
    pendingLastPageRef,
    isInitialLoadRef,
    pageBoundariesRef,
    pageMapReadyRef,
    currentSpineIndexRef,
    setCurrentSpineIndex,
    setIsLoading,
    setChapterFading,
    setShadowData,
    onLoadError,
}: UsePaginatedChapterLoaderOptions) {
    const [spineItems, setSpineItems] = useState<SpineItemInfo[]>([])
    const spineItemsRef = useRef<SpineItemInfo[]>([])

    useEffect(() => {
        const items = provider.getSpineItems()
        spineItemsRef.current = items
        setSpineItems(items)
    }, [provider])

    const loadChapter = useCallback(async (
        spineIndex: number,
        goToLastPage = false,
        visited = new Set<number>(),
    ) => {
        if (spineIndex < 0 || spineIndex >= spineItemsRef.current.length) return
        if (visited.has(spineIndex)) return
        visited.add(spineIndex)
        abortPaginationMeasure()
        pendingLastPageRef.current = goToLastPage

        if (!isInitialLoadRef.current) {
            setChapterFading(true)
            await new Promise(resolve => setTimeout(resolve, CHAPTER_FADE_DURATION_MS))
        }

        setIsLoading(true)
        pageBoundariesRef.current = []
        pageMapReadyRef.current = false
        renderedHighlightsRef.current.clear()
        try {
            const rawHtml = await provider.extractChapterHtml(spineIndex)

            let chapterStyles: string[] = []
            try { chapterStyles = await provider.extractChapterStyles(spineIndex) } catch { /* optional */ }

            const preprocessed = await preprocessChapterContent({
                chapterId: `pch-${spineIndex}`,
                spineIndex,
                chapterHref: spineItemsRef.current[spineIndex]?.href,
                htmlContent: rawHtml,
                externalStyles: chapterStyles,
            })

            if (!preprocessed.hasRenderableContent) {
                const fallbackIndex = goToLastPage ? spineIndex - 1 : spineIndex + 1
                if (fallbackIndex >= 0 && fallbackIndex < spineItemsRef.current.length) {
                    setCurrentSpineIndex(fallbackIndex)
                    currentSpineIndexRef.current = fallbackIndex
                    await loadChapter(fallbackIndex, goToLastPage, visited)
                    return
                }
            }

            setShadowData({
                htmlContent: preprocessed.htmlContent,
                htmlFragments: preprocessed.htmlFragments,
                externalStyles: preprocessed.externalStyles,
                chapterId: `pch-${spineIndex}`,
            })
        } catch (err) {
            console.error(`[PaginatedReader] Failed to load chapter ${spineIndex}:`, err)
            pageBoundariesRef.current = []
            pageMapReadyRef.current = false
            setIsLoading(false)
            setChapterFading(false)
            onLoadError?.(spineIndex)
        }
    }, [provider, abortPaginationMeasure, pendingLastPageRef, isInitialLoadRef, pageBoundariesRef, pageMapReadyRef, renderedHighlightsRef, currentSpineIndexRef, setCurrentSpineIndex, setIsLoading, setChapterFading, setShadowData])

    return { loadChapter, spineItems, spineItemsRef }
}
