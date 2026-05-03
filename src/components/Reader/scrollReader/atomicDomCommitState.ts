import type { LoadedChapter } from './scrollReaderTypes';

export function isReadyChapter(chapter: LoadedChapter): boolean {
    return chapter.status === 'ready';
}

export function isCommittedChapter(chapter: LoadedChapter): boolean {
    return chapter.status === 'ready' || chapter.status === 'mounted';
}

export function markReadyChaptersMounted(prev: LoadedChapter[]): LoadedChapter[] {
    return prev.map(ch =>
        ch.status === 'ready' ? { ...ch, status: 'mounted', mountedAt: Date.now() } : ch
    );
}
