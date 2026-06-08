import type { LoadedChapter } from './scrollReaderTypes';

interface ShadowReadyEntry {
    spineIndex: number;
    node: HTMLElement;
    height: number;
}

export function removeReadyChaptersFromShadowQueue(
    chapters: LoadedChapter[],
    readySpineIndexes: ReadonlySet<number>,
): LoadedChapter[] {
    return chapters.filter(chapter => !readySpineIndexes.has(chapter.spineIndex));
}

export function applyShadowReadyBatch(
    chapters: LoadedChapter[],
    batch: ShadowReadyEntry[],
): LoadedChapter[] {
    let updated = chapters;
    for (const item of batch) {
        const index = updated.findIndex(chapter => chapter.spineIndex === item.spineIndex);
        if (index < 0) continue;
        const chapter = updated[index];
        if (!chapter) continue;
        if (chapter.status === 'mounted') continue;
        if (updated === chapters) updated = [...chapters];
        updated[index] = {
            ...chapter,
            domNode: item.node,
            height: item.height,
            status: 'ready',
        };
    }
    return updated;
}
