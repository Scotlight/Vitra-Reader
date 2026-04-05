import type { ChapterPreprocessResult } from '../../engine/types/chapterPreprocess'

export interface PaginatedShadowData {
    chapterId: string
    externalStyles: string[]
    htmlContent: string
    htmlFragments: string[]
}

export function hasRenderableChapterContent(html: string): boolean {
    const plainText = html
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .trim()
    const hasMedia = /<(img|svg|video|audio|canvas|table|math|object|embed)\b/i.test(html)
    return plainText.length > 0 || hasMedia
}

export function resolvePaginatedFallbackIndex(
    spineIndex: number,
    goToLastPage: boolean,
    totalSpine: number,
): number | null {
    const fallbackIndex = goToLastPage ? spineIndex - 1 : spineIndex + 1
    if (fallbackIndex < 0 || fallbackIndex >= totalSpine) return null
    return fallbackIndex
}

export function createPaginatedShadowData(
    chapterId: string,
    preprocessed: Pick<ChapterPreprocessResult, 'htmlContent' | 'htmlFragments' | 'externalStyles'>,
): PaginatedShadowData {
    return {
        chapterId,
        htmlContent: preprocessed.htmlContent,
        htmlFragments: preprocessed.htmlFragments,
        externalStyles: preprocessed.externalStyles,
    }
}
