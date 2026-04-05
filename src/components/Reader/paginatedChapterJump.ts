export type PaginatedJumpDecision =
    | { kind: 'page'; page: number }
    | { kind: 'chapter'; spineIndex: number; goToLastPage: boolean }
    | { kind: 'none' }

export function resolveNextPaginatedTarget(input: {
    currentPage: number
    currentSpineIndex: number
    isPageLikelyBlank: (pageIndex: number) => boolean
    totalPages: number
    totalSpines: number
}): PaginatedJumpDecision {
    const { currentPage, currentSpineIndex, isPageLikelyBlank, totalPages, totalSpines } = input

    if (currentPage < totalPages - 1) {
        let next = currentPage + 1
        while (next < totalPages && isPageLikelyBlank(next)) {
            next += 1
        }
        if (next < totalPages) {
            return { kind: 'page', page: next }
        }
    }

    const nextSpineIndex = currentSpineIndex + 1
    if (nextSpineIndex < totalSpines) {
        return { kind: 'chapter', spineIndex: nextSpineIndex, goToLastPage: false }
    }

    return { kind: 'none' }
}

export function resolvePrevPaginatedTarget(input: {
    currentPage: number
    currentSpineIndex: number
    isPageLikelyBlank: (pageIndex: number) => boolean
}): PaginatedJumpDecision {
    const { currentPage, currentSpineIndex, isPageLikelyBlank } = input

    if (currentPage > 0) {
        let prev = currentPage - 1
        while (prev >= 0 && isPageLikelyBlank(prev)) {
            prev -= 1
        }
        if (prev >= 0) {
            return { kind: 'page', page: prev }
        }
    }

    const prevSpineIndex = currentSpineIndex - 1
    if (prevSpineIndex >= 0) {
        return { kind: 'chapter', spineIndex: prevSpineIndex, goToLastPage: true }
    }

    return { kind: 'none' }
}
