import type { SpineItemInfo, TocItem } from '@/engine/core/contentProvider'

const FLAT_CHAPTER_PREFIX = 'ch-'
const FLAT_CHAPTER_HREF_RE = /^ch-(\d+)$/

interface FlatChapterLike {
    readonly title: string
}

export function buildFlatChapterHref(index: number): string {
    return `${FLAT_CHAPTER_PREFIX}${index}`
}

export function parseFlatChapterHrefIndex(href: string): number {
    const match = href.match(FLAT_CHAPTER_HREF_RE)
    return match ? Number.parseInt(match[1], 10) : -1
}

export function buildFlatChapterToc(chapters: readonly FlatChapterLike[]): TocItem[] {
    return chapters.map((chapter, index) => ({
        id: buildFlatChapterHref(index),
        href: buildFlatChapterHref(index),
        label: chapter.title,
    }))
}

export function buildFlatChapterSpineItems(count: number): SpineItemInfo[] {
    return Array.from({ length: count }, (_, index) => ({
        index,
        href: buildFlatChapterHref(index),
        id: buildFlatChapterHref(index),
        linear: true,
    }))
}
