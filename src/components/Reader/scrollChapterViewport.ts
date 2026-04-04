export interface ChapterViewportEntry {
    readonly spineIndex: number
    readonly top: number
    readonly bottom: number
}

interface ChapterViewportMatch {
    readonly bottom: number
    readonly spineIndex: number
    readonly top: number
}

function clampUnit(value: number): number {
    return Math.max(0, Math.min(1, value))
}

export function parseChapterSpineIndex(chapterIdAttr: string | null): number | null {
    if (!chapterIdAttr) return null
    const match = chapterIdAttr.match(/^ch-(\d+)$/)
    if (!match) return null
    return Number.parseInt(match[1], 10)
}

export function findChapterAtViewportOffset(
    chapters: readonly ChapterViewportEntry[],
    offset: number,
): ChapterViewportMatch | null {
    for (const chapter of chapters) {
        if (offset >= chapter.top && offset < chapter.bottom) {
            return chapter
        }
    }
    return null
}

export function resolveViewportChapterProgress(
    chapters: readonly ChapterViewportEntry[],
    offset: number,
    totalChapters: number,
): { spineIndex: number; progress: number } | null {
    if (totalChapters <= 0) return null

    const matched = findChapterAtViewportOffset(chapters, offset)
    if (!matched) return null

    const chapterHeight = matched.bottom - matched.top
    const localProgress = chapterHeight > 0
        ? clampUnit((offset - matched.top) / chapterHeight)
        : 0

    return {
        spineIndex: matched.spineIndex,
        progress: clampUnit((matched.spineIndex + localProgress) / totalChapters),
    }
}
