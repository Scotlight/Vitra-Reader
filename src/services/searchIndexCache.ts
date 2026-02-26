import type { SearchResult } from './contentProvider'

const EXCERPT_CONTEXT_CHARS = 20
const BOOK_INDEX_STORE = new Map<string, Map<number, string>>()

function normalizeKeyword(keyword: string): string {
    return keyword.trim().toLowerCase()
}

function toPlainText(html: string): string {
    return html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;|&#160;/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim()
}

function buildExcerpt(text: string, start: number, keywordLength: number): string {
    const safeStart = Math.max(0, start - EXCERPT_CONTEXT_CHARS)
    const safeEnd = Math.min(text.length, start + keywordLength + EXCERPT_CONTEXT_CHARS)
    return text.slice(safeStart, safeEnd)
}

function getBookIndex(bookId: string): Map<number, string> {
    let index = BOOK_INDEX_STORE.get(bookId)
    if (!index) {
        index = new Map<number, string>()
        BOOK_INDEX_STORE.set(bookId, index)
    }
    return index
}

export function upsertChapterIndex(bookId: string, spineIndex: number, html: string): void {
    const text = toPlainText(html)
    if (!text) return
    const index = getBookIndex(bookId)
    index.set(spineIndex, text)
}

export function hasChapterIndex(bookId: string, spineIndex: number): boolean {
    return getBookIndex(bookId).has(spineIndex)
}

export function getIndexedChapterCount(bookId: string): number {
    return getBookIndex(bookId).size
}

export function clearBookIndex(bookId: string): void {
    BOOK_INDEX_STORE.delete(bookId)
}

export function searchBookIndex(bookId: string, keyword: string): SearchResult[] {
    const normalized = normalizeKeyword(keyword)
    if (!normalized) return []
    const index = getBookIndex(bookId)
    const results: SearchResult[] = []

    index.forEach((text, spineIndex) => {
        const lower = text.toLowerCase()
        let pos = lower.indexOf(normalized)
        while (pos !== -1) {
            results.push({
                cfi: `bdise:${spineIndex}:0`,
                excerpt: buildExcerpt(text, pos, normalized.length),
            })
            pos = lower.indexOf(normalized, pos + normalized.length)
        }
    })

    return results
}
