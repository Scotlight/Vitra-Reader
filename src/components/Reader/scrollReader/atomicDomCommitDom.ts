import { findTextInDOM } from '@/utils/textFinder';
import { resolveScrollInitialOffset } from '../readerModeSwitchPosition';
import type { LoadedChapter } from './scrollReaderTypes';

export function getOrCreateChapterElement(
    listEl: HTMLElement,
    chapterId: string,
    className: string,
): { chapterEl: HTMLElement; isInsertion: boolean } {
    const existingChapterEl = listEl.querySelector(`[data-chapter-id="${chapterId}"]`) as HTMLElement | null;
    const isInsertion = !existingChapterEl;
    const chapterEl = existingChapterEl || document.createElement('div');

    if (!existingChapterEl) {
        chapterEl.setAttribute('data-chapter-id', chapterId);
        chapterEl.className = className;
    }

    return { chapterEl, isInsertion };
}

export function insertChapterElementAtIndex(
    listEl: HTMLElement,
    chapterEl: HTMLElement,
    targetIndex: number,
): void {
    const existingNodes = Array.from(listEl.children);

    if (targetIndex === 0 && existingNodes.length > 0) {
        listEl.prepend(chapterEl);
    } else if (targetIndex >= existingNodes.length) {
        listEl.appendChild(chapterEl);
    } else {
        listEl.insertBefore(chapterEl, existingNodes[targetIndex] || null);
    }
}

export function scrollToSearchTextInChapters(
    viewport: HTMLElement,
    listEl: HTMLElement,
    chapters: LoadedChapter[],
    searchText: string,
): number | null {
    for (const ch of chapters) {
        const el = listEl.querySelector(`[data-chapter-id="${ch.id}"]`) as HTMLElement | null;
        if (!el) continue;

        const range = findTextInDOM(el, searchText);
        if (!range) continue;

        const rect = range.getBoundingClientRect();
        const vpRect = viewport.getBoundingClientRect();
        viewport.scrollTop += rect.top - vpRect.top;
        return viewport.scrollTop;
    }

    return null;
}

export function scrollToInitialChapterOffset(options: {
    viewport: HTMLElement;
    listEl: HTMLElement;
    currentSpineIndex: number;
    initialChapterProgress?: number;
    initialScrollOffset: number;
}): number | null {
    const chapterEl = options.listEl.querySelector(`[data-chapter-id="ch-${options.currentSpineIndex}"]`) as HTMLElement | null;
    const targetScrollTop = resolveScrollInitialOffset({
        chapterHeight: chapterEl?.scrollHeight ?? 0,
        chapterTop: chapterEl?.offsetTop ?? 0,
        initialChapterProgress: options.initialChapterProgress,
        initialScrollOffset: options.initialScrollOffset,
        viewportHeight: options.viewport.clientHeight,
    });

    if (targetScrollTop <= 0) return null;

    options.viewport.scrollTop = targetScrollTop;
    return options.viewport.scrollTop;
}
