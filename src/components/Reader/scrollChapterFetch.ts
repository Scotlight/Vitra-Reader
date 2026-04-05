import type { ContentProvider } from '../../engine/core/contentProvider'
import { preprocessChapterContent } from '../../engine/render/chapterPreprocessService'
import type { ChapterPreprocessResult } from '../../engine/types/chapterPreprocess'

export interface ScrollChapterVectorStyleInput {
    fontSize: number
    lineHeight: number
    pageWidth: number
    paragraphSpacing: number
}

export function buildScrollChapterVectorConfig(readerStyles: ScrollChapterVectorStyleInput) {
    return {
        targetChars: 16_000,
        fontSize: readerStyles.fontSize,
        pageWidth: readerStyles.pageWidth,
        lineHeight: readerStyles.lineHeight,
        paragraphSpacing: readerStyles.paragraphSpacing,
    }
}

export async function fetchAndPreprocessChapter(input: {
    chapterId: string
    chapterHref?: string
    provider: Pick<ContentProvider, 'extractChapterHtml' | 'extractChapterStyles'>
    readerStyles: ScrollChapterVectorStyleInput
    spineIndex: number
    preprocess?: typeof preprocessChapterContent
}): Promise<ChapterPreprocessResult> {
    const {
        chapterId,
        chapterHref,
        provider,
        readerStyles,
        spineIndex,
        preprocess = preprocessChapterContent,
    } = input

    const html = await provider.extractChapterHtml(spineIndex)
    let chapterStyles: string[] = []
    try {
        chapterStyles = await provider.extractChapterStyles(spineIndex)
    } catch {
        // Styles are optional
    }

    return preprocess({
        chapterId,
        spineIndex,
        chapterHref,
        htmlContent: html,
        externalStyles: chapterStyles,
        vectorize: true,
        vectorConfig: buildScrollChapterVectorConfig(readerStyles),
    })
}
