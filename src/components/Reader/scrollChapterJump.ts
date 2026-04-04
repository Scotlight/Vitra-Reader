export type ScrollJumpDirection = 'prev' | 'next' | 'initial'

export interface ScrollJumpChapterLike {
    readonly spineIndex: number
    readonly status: 'loading' | 'shadow-rendering' | 'ready' | 'mounted' | 'placeholder'
}

export function resolveJumpLoadDirection(
    targetSpineIndex: number,
    anchorSpineIndex: number,
): ScrollJumpDirection {
    if (targetSpineIndex < anchorSpineIndex) return 'prev'
    if (targetSpineIndex > anchorSpineIndex) return 'next'
    return 'initial'
}

export function findMountedJumpTarget<T extends ScrollJumpChapterLike>(
    chapters: readonly T[],
    targetSpineIndex: number,
): T | undefined {
    return chapters.find((chapter) =>
        chapter.spineIndex === targetSpineIndex && chapter.status === 'mounted'
    )
}

export function resolveChapterDomId(spineIndex: number): string {
    return `ch-${spineIndex}`
}
