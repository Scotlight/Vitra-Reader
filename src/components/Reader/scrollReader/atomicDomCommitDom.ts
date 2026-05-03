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
