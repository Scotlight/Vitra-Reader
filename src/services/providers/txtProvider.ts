import type { ContentProvider, TocItem, SpineItemInfo, SearchResult } from '../contentProvider'
const PARAGRAPHS_PER_CHAPTER = 500
const MAX_LABEL_LENGTH = 24
const TITLE_CANDIDATE_MAX_LENGTH = 40
const MIN_DISTANCE_BETWEEN_TITLES = 12
const MIN_AVERAGE_PARAGRAPHS_PER_TITLE = 30
const CHAPTER_KEYWORDS = ['章', '节', '回', '節', '卷', '部', '輯', '辑', '話', '集', '话', '篇']
const SPECIAL_STARTS = [
    'CHAPTER',
    'Chapter',
    'Prologue',
    'Epilogue',
    '序章',
    '前言',
    '声明',
    '写在前面的话',
    '后记',
    '楔子',
    '后序',
    '章节目录',
    '尾声',
    '聲明',
    '寫在前面的話',
    '後記',
    '後序',
    '章節目錄',
    '尾聲',
]
const BODY_PUNCTUATION = /[。；;，,！!？?…—“”"‘’'：:]/
const ZH_NUM = /^[\u96f6\u4e00\u4e8c\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d\u5341\u767e\u5343\u4e07\u4ebf\u5146\u58f9\u8d30\u53c1\u8086\u4f0d\u9646\u67d2\u634c\u7396\u4e24\u842c\u5169]+$/

interface TxtChapter {
    title: string
    start: number
    end: number
}

export class TxtContentProvider implements ContentProvider {
    private chapters: TxtChapter[] = []
    private paragraphs: string[] = []
    private plainCache = new Map<number, string>()

    constructor(private data: ArrayBuffer) {}

    async init() {
        const rawText = decodeTxt(this.data)
        this.paragraphs = splitParagraphs(rawText)
        this.chapters = buildChapterLayout(this.paragraphs)
    }

    destroy() {
        this.chapters = []
        this.paragraphs = []
        this.plainCache.clear()
    }

    getToc(): TocItem[] {
        return this.chapters.map((chapter, i) => ({
            id: `ch-${i}`, href: `ch-${i}`, label: chapter.title,
        }))
    }

    getSpineItems(): SpineItemInfo[] {
        return this.chapters.map((_, i) => ({
            index: i, href: `ch-${i}`, id: `ch-${i}`, linear: true,
        }))
    }

    getSpineIndexByHref(href: string): number {
        const m = href.match(/ch-(\d+)/)
        return m ? parseInt(m[1], 10) : -1
    }

    async extractChapterHtml(i: number): Promise<string> {
        const chapter = this.chapters[i]
        if (!chapter) return ''
        return renderChapterHtml(this.paragraphs.slice(chapter.start, chapter.end))
    }

    async extractChapterStyles(): Promise<string[]> { return [] }
    unloadChapter() {}

    async search(keyword: string): Promise<SearchResult[]> {
        const results: SearchResult[] = []
        const lk = keyword.trim().toLowerCase()
        if (!lk) return results

        for (let i = 0; i < this.chapters.length; i++) {
            const plain = this.getChapterPlain(i)
            const lower = plain.toLowerCase()
            let pos = lower.indexOf(lk)
            while (pos !== -1) {
                const start = Math.max(0, pos - 20)
                const end = Math.min(lower.length, pos + lk.length + 20)
                results.push({ cfi: `bdise:${i}:0`, excerpt: plain.slice(start, end) })
                pos = lower.indexOf(lk, pos + 1)
            }
        }
        return results
    }

    private getChapterPlain(index: number): string {
        const cached = this.plainCache.get(index)
        if (cached !== undefined) return cached

        const chapter = this.chapters[index]
        if (!chapter) return ''

        const plain = this.paragraphs.slice(chapter.start, chapter.end).join('\n')
        this.plainCache.set(index, plain)
        return plain
    }
}

function decodeTxt(data: ArrayBuffer): string {
    try {
        return new TextDecoder('utf-8', { fatal: true }).decode(data)
    } catch {
        return new TextDecoder('gbk').decode(data)
    }
}

function splitParagraphs(rawText: string): string[] {
    if (!rawText) return []
    return rawText.split(/\r?\n/)
}

function buildChapterLayout(paragraphs: string[]): TxtChapter[] {
    if (paragraphs.length === 0) {
        return [{ title: '正文', start: 0, end: 0 }]
    }

    const explicitTitles = findExplicitTitleIndexes(paragraphs)
    if (shouldUseExplicitTitles(paragraphs.length, explicitTitles)) {
        return buildExplicitChapters(paragraphs, explicitTitles)
    }

    return buildVirtualChapters(paragraphs)
}

function buildVirtualChapters(paragraphs: string[]): TxtChapter[] {
    const chapters: TxtChapter[] = []
    const total = Math.ceil(paragraphs.length / PARAGRAPHS_PER_CHAPTER)

    for (let i = 0; i < total; i++) {
        const start = i * PARAGRAPHS_PER_CHAPTER
        const end = Math.min(paragraphs.length, start + PARAGRAPHS_PER_CHAPTER)
        chapters.push({
            title: buildVirtualChapterTitle(paragraphs, start, end, i),
            start,
            end,
        })
    }
    return chapters
}

function buildVirtualChapterTitle(paragraphs: string[], start: number, end: number, index: number): string {
    for (let cursor = start; cursor < end; cursor += 1) {
        const line = (paragraphs[cursor] || '').trim()
        if (!line) continue
        if (isChapterTitle(line)) return trimLabel(line)
        break
    }
    return `第 ${index + 1} 节`
}

function shouldUseExplicitTitles(totalParagraphs: number, titleIndexes: number[]): boolean {
    if (titleIndexes.length < 2) return false
    const averageSpan = totalParagraphs / titleIndexes.length
    return averageSpan >= MIN_AVERAGE_PARAGRAPHS_PER_TITLE
}

function findExplicitTitleIndexes(paragraphs: string[]): number[] {
    const result: number[] = []
    let lastAccepted = -MIN_DISTANCE_BETWEEN_TITLES

    for (let i = 0; i < paragraphs.length; i += 1) {
        const line = (paragraphs[i] || '').trim()
        if (!isChapterTitle(line)) continue
        if (!hasHeadingContext(paragraphs, i)) continue
        if (i - lastAccepted < MIN_DISTANCE_BETWEEN_TITLES) continue
        result.push(i)
        lastAccepted = i
    }
    return result
}

function buildExplicitChapters(paragraphs: string[], titleIndexes: number[]): TxtChapter[] {
    const chapters: TxtChapter[] = []
    const firstTitle = titleIndexes[0]
    if (firstTitle > 0) {
        chapters.push({ title: '序章', start: 0, end: firstTitle })
    }

    for (let i = 0; i < titleIndexes.length; i += 1) {
        const start = titleIndexes[i]
        const end = i + 1 < titleIndexes.length ? titleIndexes[i + 1] : paragraphs.length
        if (end <= start) continue
        chapters.push({
            title: trimLabel((paragraphs[start] || '').trim()) || `第 ${chapters.length + 1} 节`,
            start,
            end,
        })
    }

    if (chapters.length === 0) return buildVirtualChapters(paragraphs)
    return chapters
}

function hasHeadingContext(paragraphs: string[], index: number): boolean {
    const prev = index > 0 ? (paragraphs[index - 1] || '').trim() : ''
    const next = index + 1 < paragraphs.length ? (paragraphs[index + 1] || '').trim() : ''
    if (!prev || !next) return true
    const shortNeighborCount = [prev, next].filter((line) => line.length <= 8).length
    return shortNeighborCount === 0
}

function normalizeTitleLine(line: string): string {
    return line
        .trim()
        .replace(/[\r\n\t]/g, '')
        .replace(/[=\-_+]/g, '')
        .replace(/\s+/g, ' ')
        .slice(0, 100)
}

function isChapterTitle(line: string): boolean {
    const cleaned = normalizeTitleLine(line)
    if (!cleaned || cleaned.length >= TITLE_CANDIDATE_MAX_LENGTH) return false
    if (BODY_PUNCTUATION.test(cleaned)) return false
    if (SPECIAL_STARTS.some((prefix) => cleaned.startsWith(prefix))) return true

    if (cleaned.startsWith('第')) {
        for (const keyword of CHAPTER_KEYWORDS) {
            const keywordIndex = cleaned.indexOf(keyword)
            if (keywordIndex <= 1) continue
            const mid = cleaned.substring(1, keywordIndex).trim()
            if (ZH_NUM.test(mid) || /^\d+$/.test(mid)) return true
        }
    }

    if (cleaned.startsWith('卷')) {
        const rest = cleaned.substring(1).trim().split(/\s+/)[0]
        if (ZH_NUM.test(rest) || /^\d+$/.test(rest)) return true
    }

    return false
}

function trimLabel(label: string): string {
    if (!label) return ''
    if (label.length <= MAX_LABEL_LENGTH) return label
    return `${label.slice(0, MAX_LABEL_LENGTH)}...`
}

function renderChapterHtml(paragraphs: string[]): string {
    if (paragraphs.length === 0) {
        return '<p>(空章节)</p>'
    }

    return paragraphs.map((text) => {
        const trimmed = text.trim()
        if (!trimmed) return '<br/>'
        return `<p>${escapeHtml(trimmed)}</p>`
    }).join('\n')
}

function escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export async function parseTxtMetadata(_data: ArrayBuffer, filename: string) {
    return { title: filename.replace(/\.txt$/i, ''), author: '未知作者' }
}
