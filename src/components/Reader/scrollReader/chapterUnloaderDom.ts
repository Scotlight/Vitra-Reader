import { releaseMediaResources } from '@/utils/mediaResourceCleanup';
import { segmentPool } from '../ShadowRenderer';
import { markChapterAsPlaceholder } from './scrollReaderHelpers';
import type { LoadedChapter } from './scrollReaderTypes';

interface ReleaseChapterDomResourcesOptions {
    listEl: HTMLElement | null;
    chapter: LoadedChapter;
    unobserveChapterResizeNodes: (chapterEl: HTMLElement | null) => void;
}

export function releaseChapterDomResources({
    listEl,
    chapter,
    unobserveChapterResizeNodes,
}: ReleaseChapterDomResourcesOptions): void {
    if (!listEl) return;

    const domEl = listEl.querySelector(`[data-chapter-id="${chapter.id}"]`) as HTMLElement | null;
    if (!domEl) return;

    unobserveChapterResizeNodes(domEl);
    domEl.querySelectorAll('section[data-shadow-segment-index]').forEach(seg => {
        segmentPool.release(seg as HTMLElement);
    });
    releaseMediaResources(domEl);
    markChapterAsPlaceholder(domEl, chapter.height);
}
