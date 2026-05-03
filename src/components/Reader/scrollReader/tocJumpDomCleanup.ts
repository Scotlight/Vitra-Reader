import { releaseMediaResources } from '@/utils/mediaResourceCleanup';
import { segmentPool } from '../ShadowRenderer';

interface ClearMountedChapterDomOptions {
    listEl: HTMLElement;
    cleanupVirtualChapterRuntime: (chapterId: string) => void;
    resetResizeObservers: () => void;
}

export function clearMountedChapterDom({
    listEl,
    cleanupVirtualChapterRuntime,
    resetResizeObservers,
}: ClearMountedChapterDomOptions): void {
    resetResizeObservers();
    const chapterNodes = listEl.querySelectorAll('[data-chapter-id]');
    chapterNodes.forEach(node => {
        const el = node as HTMLElement;
        const chapterId = el.getAttribute('data-chapter-id');
        if (chapterId) {
            cleanupVirtualChapterRuntime(chapterId);
        }
        el.querySelectorAll('[data-shadow-segment-index]').forEach(seg => {
            segmentPool.release(seg as HTMLElement);
        });
        releaseMediaResources(el);
        el.remove();
    });
}
