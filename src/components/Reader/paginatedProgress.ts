export interface PaginatedProgressState {
    readonly progress: number
    readonly chapterProgress: number
}

export interface PaginatedProgressRecordInput {
    readonly bookId: string
    readonly currentChapterHref: string
    readonly currentPage: number
    readonly currentSpineIndex: number
    readonly percentage: number
    readonly updatedAt: number
}

export function resolvePaginatedProgress(
    currentPage: number,
    currentSpineIndex: number,
    totalPages: number,
    spineCount: number,
): PaginatedProgressState | null {
    if (spineCount <= 0) return null

    const chapterProgress = totalPages > 1 ? currentPage / (totalPages - 1) : 0
    const progress = (currentSpineIndex + Math.min(1, chapterProgress)) / spineCount
    const clamped = Math.max(0, Math.min(1, progress))

    return {
        chapterProgress,
        progress: clamped,
    }
}

export function createPaginatedProgressRecord(input: PaginatedProgressRecordInput) {
    return {
        bookId: input.bookId,
        location: `vitra:${input.currentSpineIndex}:${input.currentPage}`,
        percentage: input.percentage,
        currentChapter: input.currentChapterHref,
        updatedAt: input.updatedAt,
    }
}
