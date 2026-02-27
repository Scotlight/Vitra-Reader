import type { SegmentMeta, VectorizeConfig } from './vectorRender'

export interface ChapterPreprocessInput {
    chapterId: string
    spineIndex: number
    chapterHref?: string
    htmlContent: string
    externalStyles: string[]
    vectorize?: boolean
    vectorConfig?: VectorizeConfig
}

export interface ChapterPreprocessResult {
    htmlContent: string
    htmlFragments: string[]
    externalStyles: string[]
    removedTagCount: number
    removedAttributeCount: number
    usedFallback: boolean
    stylesScoped: boolean
    segmentMetas?: SegmentMeta[]
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
