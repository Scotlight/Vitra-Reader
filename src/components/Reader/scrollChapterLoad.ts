import type { ChapterPreprocessResult } from '../../engine/types/chapterPreprocess'
import type { SegmentMeta } from '../../engine/types/vectorRender'

export type LoadedChapterStatus = 'loading' | 'shadow-rendering' | 'ready' | 'mounted' | 'placeholder'
export type ChapterInsertDirection = 'prev' | 'next' | 'initial'

export interface LoadedChapterState {
    spineIndex: number
    id: string
    htmlContent: string
    htmlFragments: string[]
    externalStyles: string[]
    segmentMetas?: SegmentMeta[]
    vectorStyleKey?: string
    domNode: HTMLElement | null
    height: number
    status: LoadedChapterStatus
    mountedAt?: number
}

export function createLoadingChapterState(input: {
    chapterId: string
    currentReaderStyleKey: string
    existingChapter?: Pick<LoadedChapterState, 'externalStyles' | 'height' | 'segmentMetas' | 'vectorStyleKey'>
    spineIndex: number
}): LoadedChapterState {
    const {
        chapterId,
        currentReaderStyleKey,
        existingChapter,
        spineIndex,
    } = input

    return {
        spineIndex,
        id: chapterId,
        htmlContent: '',
        htmlFragments: [],
        externalStyles: existingChapter?.externalStyles || [],
        segmentMetas: existingChapter?.segmentMetas,
        vectorStyleKey: existingChapter?.vectorStyleKey ?? currentReaderStyleKey,
        domNode: null,
        height: existingChapter?.height || 0,
        status: 'loading',
    }
}

export function createVectorRestoreChapterState(
    loadingChapter: LoadedChapterState,
    currentReaderStyleKey: string,
): LoadedChapterState {
    return {
        ...loadingChapter,
        status: 'shadow-rendering',
        vectorStyleKey: currentReaderStyleKey,
    }
}

export function createPreprocessedChapterState(
    loadingChapter: LoadedChapterState,
    preprocessed: Pick<ChapterPreprocessResult, 'htmlContent' | 'htmlFragments' | 'externalStyles' | 'segmentMetas'>,
    currentReaderStyleKey: string,
): LoadedChapterState {
    return {
        ...loadingChapter,
        htmlContent: preprocessed.htmlContent,
        htmlFragments: preprocessed.htmlFragments,
        externalStyles: preprocessed.externalStyles,
        segmentMetas: preprocessed.segmentMetas,
        vectorStyleKey: currentReaderStyleKey,
        status: 'shadow-rendering',
    }
}

export function insertLoadingChapterState(
    chapters: readonly LoadedChapterState[],
    loadingChapter: LoadedChapterState,
    existingChapter: LoadedChapterState | undefined,
    direction: ChapterInsertDirection,
): LoadedChapterState[] {
    if (existingChapter) {
        return chapters.map((chapter) =>
            chapter.spineIndex === loadingChapter.spineIndex ? loadingChapter : chapter
        )
    }
    if (direction === 'prev') {
        return [loadingChapter, ...chapters]
    }
    return [...chapters, loadingChapter]
}

export function replaceChapterState(
    chapters: readonly LoadedChapterState[],
    nextChapter: LoadedChapterState,
): LoadedChapterState[] {
    return chapters.map((chapter) =>
        chapter.spineIndex === nextChapter.spineIndex ? nextChapter : chapter
    )
}

export function appendShadowQueueChapter(
    queue: readonly LoadedChapterState[],
    chapter: LoadedChapterState,
): LoadedChapterState[] {
    return [
        ...queue.filter((item) => item.spineIndex !== chapter.spineIndex),
        chapter,
    ]
}

export function rollbackFailedChapterState(
    chapters: readonly LoadedChapterState[],
    spineIndex: number,
    existingChapter: LoadedChapterState | undefined,
): LoadedChapterState[] {
    if (existingChapter?.status === 'placeholder') {
        return replaceChapterState(chapters, existingChapter)
    }
    return chapters.filter((chapter) => chapter.spineIndex !== spineIndex)
}
