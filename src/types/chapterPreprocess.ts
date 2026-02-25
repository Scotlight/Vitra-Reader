export interface ChapterPreprocessInput {
    chapterId: string
    spineIndex: number
    chapterHref?: string
    htmlContent: string
    externalStyles: string[]
}

export interface ChapterPreprocessResult {
    htmlContent: string
    externalStyles: string[]
    removedTagCount: number
    removedAttributeCount: number
    usedFallback: boolean
}

export interface ChapterPreprocessRequest {
    id: number
    payload: ChapterPreprocessInput
}

export interface ChapterPreprocessResponse {
    id: number
    ok: boolean
    result?: ChapterPreprocessResult
    error?: string
}

