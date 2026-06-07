import type { LoadedChapter } from './scrollReaderTypes';

export type ChapterLoadDirection = 'prev' | 'next' | 'initial';

export interface PendingReadyEntry {
    spineIndex: number;
    node: HTMLElement;
    height: number;
}

export function isStyleRefreshTarget(chapter: LoadedChapter): boolean {
    return chapter.status === 'mounted' || chapter.status === 'ready';
}

export function buildLoadingChapter(
    spineIndex: number,
    chapterId: string,
    chapterTitle: string,
    existingChapter: LoadedChapter | undefined,
    currentReaderStyleKey: string,
): LoadedChapter {
    return {
        spineIndex,
        id: chapterId,
        chapterTitle,
        htmlContent: '',
        htmlFragments: [],
        externalStyles: existingChapter?.externalStyles || [],
        segmentMetas: existingChapter?.segmentMetas,
        vectorStyleKey: existingChapter?.vectorStyleKey ?? currentReaderStyleKey,
        domNode: null,
        height: existingChapter?.height || 0,
        status: 'loading',
    };
}

export function buildShadowRerenderChapter(chapter: LoadedChapter, vectorStyleKey: string): LoadedChapter {
    return {
        ...chapter,
        domNode: null,
        vectorStyleKey,
        status: 'shadow-rendering',
    };
}

export function updateChapterBySpineIndex(
    prev: LoadedChapter[],
    spineIndex: number,
    updater: (chapter: LoadedChapter) => LoadedChapter,
): LoadedChapter[] {
    return prev.map(ch => ch.spineIndex === spineIndex ? updater(ch) : ch);
}

export function applyLoadingChapter(
    prev: LoadedChapter[],
    loadingChapter: LoadedChapter,
    spineIndex: number,
    direction: ChapterLoadDirection,
    existingChapter: LoadedChapter | undefined,
): LoadedChapter[] {
    if (existingChapter) {
        return updateChapterBySpineIndex(prev, spineIndex, () => loadingChapter);
    }
    if (direction === 'prev') return [loadingChapter, ...prev];
    return [...prev, loadingChapter];
}

export function applyShadowRerenderChapters(
    prev: LoadedChapter[],
    rerenderIndexes: ReadonlySet<number>,
    vectorStyleKey: string,
): LoadedChapter[] {
    return prev.map((chapter) =>
        rerenderIndexes.has(chapter.spineIndex)
            ? buildShadowRerenderChapter(chapter, vectorStyleKey)
            : chapter
    );
}

export function removeChapterFromQueue(prev: LoadedChapter[], spineIndex: number): LoadedChapter[] {
    return prev.filter(ch => ch.spineIndex !== spineIndex);
}

export function upsertQueuedChapter(prev: LoadedChapter[], chapter: LoadedChapter): LoadedChapter[] {
    return [...removeChapterFromQueue(prev, chapter.spineIndex), chapter];
}

export function replaceQueuedChapters(
    prev: LoadedChapter[],
    replacementIndexes: ReadonlySet<number>,
    replacements: LoadedChapter[],
): LoadedChapter[] {
    return [
        ...prev.filter((chapter) => !replacementIndexes.has(chapter.spineIndex)),
        ...replacements,
    ];
}

export function removePendingReadyEntries(
    pending: PendingReadyEntry[],
    indexes: ReadonlySet<number>,
): PendingReadyEntry[] {
    return pending.filter((item) => !indexes.has(item.spineIndex));
}
