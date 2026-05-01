import type { ContentProvider } from '@/engine/core/contentProvider'
import type { PageTurnMode } from '@/stores/useSettingsStore'

export interface ReaderModePositionSnapshot {
    readonly sourceMode: PageTurnMode
    readonly spineIndex: number
    readonly position: number
    readonly chapterProgress: number
}

interface FallbackSnapshotInput {
    readonly currentProgress: number
    readonly currentSectionHref: string
    readonly fallbackSpineIndex: number
    readonly provider: ContentProvider | null
    readonly sourceMode: PageTurnMode
}

interface PaginatedInitialPageInput {
    readonly initialChapterProgress?: number
    readonly initialPage: number
    readonly totalPages: number
}

interface ScrollInitialOffsetInput {
    readonly chapterHeight: number
    readonly chapterTop: number
    readonly initialChapterProgress?: number
    readonly initialScrollOffset: number
    readonly viewportHeight: number
}

export function clampReaderUnit(value: number): number {
    if (!Number.isFinite(value)) return 0
    return Math.max(0, Math.min(1, value))
}

export function resolvePageChapterProgress(currentPage: number, totalPages: number): number {
    if (!Number.isFinite(currentPage) || totalPages <= 1) return 0
    return clampReaderUnit(currentPage / (totalPages - 1))
}

export function resolveProgressInChapter(
    globalProgress: number,
    spineIndex: number,
    spineCount: number,
): number {
    if (!Number.isFinite(globalProgress) || spineCount <= 0) return 0
    return clampReaderUnit(globalProgress * spineCount - spineIndex)
}

export function resolvePaginatedInitialPage({
    initialChapterProgress,
    initialPage,
    totalPages,
}: PaginatedInitialPageInput): number {
    const maxPage = Math.max(0, totalPages - 1)
    if (typeof initialChapterProgress === 'number' && Number.isFinite(initialChapterProgress)) {
        return Math.max(0, Math.min(maxPage, Math.round(clampReaderUnit(initialChapterProgress) * maxPage)))
    }
    if (!Number.isFinite(initialPage)) return 0
    return Math.max(0, Math.min(maxPage, Math.round(initialPage)))
}

export function resolveScrollInitialOffset({
    chapterHeight,
    chapterTop,
    initialChapterProgress,
    initialScrollOffset,
    viewportHeight,
}: ScrollInitialOffsetInput): number {
    if (Number.isFinite(initialScrollOffset) && initialScrollOffset > 0) {
        return Math.max(0, Math.round(initialScrollOffset))
    }

    const progress = clampReaderUnit(initialChapterProgress ?? 0)
    if (progress <= 0) return 0

    const scrollableHeight = Math.max(0, chapterHeight - viewportHeight)
    return Math.max(0, Math.round(chapterTop + scrollableHeight * progress))
}

export function createFallbackModePositionSnapshot({
    currentProgress,
    currentSectionHref,
    fallbackSpineIndex,
    provider,
    sourceMode,
}: FallbackSnapshotInput): ReaderModePositionSnapshot {
    const spineItems = provider?.getSpineItems() ?? []
    const hrefSpineIndex = currentSectionHref && provider
        ? provider.getSpineIndexByHref(currentSectionHref)
        : -1
    const maxSpineIndex = Math.max(0, spineItems.length - 1)
    const rawSpineIndex = hrefSpineIndex >= 0 ? hrefSpineIndex : fallbackSpineIndex
    const spineIndex = Math.max(0, Math.min(maxSpineIndex, rawSpineIndex))
    const chapterProgress = resolveProgressInChapter(currentProgress, spineIndex, spineItems.length)

    return {
        sourceMode,
        spineIndex,
        position: 0,
        chapterProgress,
    }
}
