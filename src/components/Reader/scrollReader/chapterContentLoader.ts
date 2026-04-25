import type { ContentProvider } from '@/engine/core/contentProvider'
import { preprocessChapterContent } from '@/engine/render/chapterPreprocessService'
import type { ReaderStyleConfig } from '../ShadowRenderer'

interface LoadPreprocessedChapterContentOptions {
    provider: ContentProvider
    chapterId: string
    spineIndex: number
    chapterHref?: string
    readerStyles: ReaderStyleConfig
}

export async function loadPreprocessedChapterContent({
    provider,
    chapterId,
    spineIndex,
    chapterHref,
    readerStyles,
}: LoadPreprocessedChapterContentOptions) {
    const html = await provider.extractChapterHtml(spineIndex)
    let chapterStyles: string[] = []
    try {
        chapterStyles = await provider.extractChapterStyles(spineIndex)
    } catch {
        // Styles are optional
    }

    return preprocessChapterContent({
        chapterId,
        spineIndex,
        chapterHref,
        htmlContent: html,
        externalStyles: chapterStyles,
        vectorize: true,
        vectorConfig: {
            targetChars: 16_000,
            fontSize: readerStyles.fontSize,
            pageWidth: readerStyles.pageWidth,
            lineHeight: readerStyles.lineHeight,
            paragraphSpacing: readerStyles.paragraphSpacing,
        },
    })
}
