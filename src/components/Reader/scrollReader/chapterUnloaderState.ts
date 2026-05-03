import { UNLOAD_ABOVE_RADIUS, UNLOAD_BELOW_RADIUS, UNLOAD_COOLDOWN_MS } from './scrollReaderConstants';
import { resolveChapterPlaceholderHeight } from './scrollReaderHelpers';
import type { LoadedChapter } from './scrollReaderTypes';

export function shouldUnloadMountedChapter(
    chapter: LoadedChapter,
    currentSpineIndex: number,
    now: number,
): boolean {
    const dist = chapter.spineIndex - currentSpineIndex;
    const radius = dist < 0 ? UNLOAD_ABOVE_RADIUS : UNLOAD_BELOW_RADIUS;
    return Math.abs(dist) > radius
        && (!chapter.mountedAt || now - chapter.mountedAt > UNLOAD_COOLDOWN_MS);
}

export function resolveChaptersToUnload(
    chapters: LoadedChapter[],
    currentSpineIndex: number,
    isUserScrolling: boolean,
    now: number,
): LoadedChapter[] {
    if (isUserScrolling) return [];

    return chapters
        .filter(ch => ch.status === 'mounted')
        .filter(ch => shouldUnloadMountedChapter(ch, currentSpineIndex, now))
        .sort((a, b) =>
            Math.abs(b.spineIndex - currentSpineIndex) - Math.abs(a.spineIndex - currentSpineIndex)
        );
}

export function collapseUnloadedChaptersToPlaceholders(
    chapters: LoadedChapter[],
    unloadSpineIndexes: ReadonlySet<number>,
): LoadedChapter[] {
    return chapters.map(ch => {
        if (!unloadSpineIndexes.has(ch.spineIndex)) return ch;
        return {
            ...ch,
            htmlContent: '',
            htmlFragments: [],
            domNode: null,
            height: resolveChapterPlaceholderHeight(ch.height),
            status: 'placeholder',
        };
    });
}
