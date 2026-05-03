import type { ScrollDirection } from '@/utils/scrollDetection';
import type { LoadedChapter } from './scrollReaderTypes';

export function normalizeScrollDirection(
    rawDirection: ScrollDirection,
    scrollTop: number,
    previousScrollTop: number,
): ScrollDirection {
    return Math.abs(scrollTop - previousScrollTop) < 0.5 ? 'none' : rawDirection;
}

export type ScrollPreloadRequest =
    | { kind: 'predictive' }
    | { kind: 'chapter'; spineIndex: number; loadKind: 'prev' | 'next' };

export function resolveScrollPreloadRequest(
    chapters: LoadedChapter[],
    direction: ScrollDirection,
    spineItemCount: number,
): ScrollPreloadRequest | null {
    const mountedChapters = [...chapters]
        .sort((a, b) => a.spineIndex - b.spineIndex)
        .filter(ch => ch.status === 'mounted');

    if (mountedChapters.length === 0) return { kind: 'predictive' };

    if (direction === 'up') {
        const earliest = mountedChapters[0].spineIndex;
        if (earliest > 0) return { kind: 'chapter', spineIndex: earliest - 1, loadKind: 'prev' };
    } else if (direction === 'down') {
        const latest = mountedChapters[mountedChapters.length - 1].spineIndex;
        if (latest < spineItemCount - 1) return { kind: 'chapter', spineIndex: latest + 1, loadKind: 'next' };
    }

    return null;
}
