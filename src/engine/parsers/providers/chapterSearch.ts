import type { SearchResult } from '@/engine/core/contentProvider'

const SEARCH_CONTEXT_CHARS = 20

export function stripHtmlTags(html: string): string {
    return html.replace(/<[^>]+>/g, '')
}

export function searchPlainChapterTexts(
    keyword: string,
    chapterCount: number,
    getChapterText: (index: number) => string,
): SearchResult[] {
    const normalizedKeyword = keyword.trim().toLowerCase()
    if (!normalizedKeyword) return []

    const results: SearchResult[] = []
    for (let index = 0; index < chapterCount; index += 1) {
        const text = getChapterText(index)
        const lowerText = text.toLowerCase()
        let position = lowerText.indexOf(normalizedKeyword)
        while (position !== -1) {
            const start = Math.max(0, position - SEARCH_CONTEXT_CHARS)
            const end = Math.min(text.length, position + normalizedKeyword.length + SEARCH_CONTEXT_CHARS)
            results.push({
                cfi: `vitra:${index}:0`,
                excerpt: text.slice(start, end),
            })
            position = lowerText.indexOf(normalizedKeyword, position + 1)
        }
    }
    return results
}
