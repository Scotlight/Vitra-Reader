import type { MutableRefObject } from 'react';
import { findTextInDOM } from '@/utils/textFinder';
import type { LoadedChapter } from './scrollReaderTypes';

interface ScrollMountedChapterIntoViewOptions {
    listEl: HTMLElement;
    viewport: HTMLElement;
    targetSpineIndex: number;
    existing: LoadedChapter;
    searchText?: string;
    generation: number;
    jumpGenerationRef: MutableRefObject<number>;
    pendingSearchTextRef: MutableRefObject<string | null>;
    lastScrollTopRef: MutableRefObject<number>;
    syncViewportState: (scrollTop: number, viewportHeight: number, opts?: { commitProgress?: boolean }) => void;
    materializeAllVirtualSegments: (chapterId: string) => void;
    forceHydrateSegment: (segmentEl: HTMLElement) => void;
}

export function shouldSmoothJump(
    currentScrollTop: number,
    targetTop: number,
    viewportHeight: number,
    hasSearchText: boolean,
): boolean {
    return !hasSearchText && Math.abs(targetTop - currentScrollTop) <= viewportHeight * 3;
}

export function scrollMountedChapterIntoView({
    listEl,
    viewport,
    targetSpineIndex,
    existing,
    searchText,
    generation,
    jumpGenerationRef,
    pendingSearchTextRef,
    lastScrollTopRef,
    syncViewportState,
    materializeAllVirtualSegments,
    forceHydrateSegment,
}: ScrollMountedChapterIntoViewOptions): void {
    const domEl = listEl.querySelector(`[data-chapter-id="ch-${targetSpineIndex}"]`) as HTMLElement | null;
    if (!domEl) return;

    const targetTop = domEl.offsetTop;
    if (
        typeof viewport.scrollTo === 'function'
        && shouldSmoothJump(viewport.scrollTop, targetTop, viewport.clientHeight, !!searchText)
    ) {
        viewport.scrollTo({ top: targetTop, behavior: 'smooth' });
        lastScrollTopRef.current = targetTop;
        syncViewportState(targetTop, viewport.clientHeight, { commitProgress: true });
        return;
    }

    viewport.scrollTop = domEl.offsetTop;
    lastScrollTopRef.current = viewport.scrollTop;
    syncViewportState(viewport.scrollTop, viewport.clientHeight, { commitProgress: true });

    requestAnimationFrame(() => {
        if (jumpGenerationRef.current !== generation) return;
        viewport.scrollTop = domEl.offsetTop;
        lastScrollTopRef.current = viewport.scrollTop;
        syncViewportState(viewport.scrollTop, viewport.clientHeight, { commitProgress: true });
    });

    if (searchText) {
        pendingSearchTextRef.current = null;
        materializeAllVirtualSegments(existing.id);
        domEl.querySelectorAll('[data-shadow-segment-state="placeholder"]').forEach(seg => {
            forceHydrateSegment(seg as HTMLElement);
        });
        const range = findTextInDOM(domEl, searchText);
        if (range) {
            const rect = range.getBoundingClientRect();
            const vpRect = viewport.getBoundingClientRect();
            viewport.scrollTop += rect.top - vpRect.top;
            lastScrollTopRef.current = viewport.scrollTop;
        }
    }
}
