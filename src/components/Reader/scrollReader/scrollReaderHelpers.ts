import type { ViewportDerivedMetrics } from './scrollReaderTypes';
import {
    CHAPTER_PLACEHOLDER_MIN_HEIGHT_PX,
    CHAPTER_PLACEHOLDER_DEFAULT_HEIGHT_PX,
    CHAPTER_DETECTION_ANCHOR_RATIO,
    CHAPTER_DETECTION_ANCHOR_MAX_PX,
} from './scrollReaderConstants';

export function resolveChapterPlaceholderHeight(height: number): number {
    // 已被 ResizeObserver 实测过的高度：原值直接用，保留亚像素精度，杜绝舍入漂移
    if (height > CHAPTER_PLACEHOLDER_MIN_HEIGHT_PX) return height;
    return Math.max(
        CHAPTER_PLACEHOLDER_MIN_HEIGHT_PX,
        height || CHAPTER_PLACEHOLDER_DEFAULT_HEIGHT_PX,
    );
}

export function applyChapterShellStyles(chapterEl: HTMLElement, height: number): void {
    chapterEl.style.contain = 'layout style paint';
    chapterEl.style.display = 'flow-root';
    chapterEl.style.contentVisibility = 'auto';
    chapterEl.style.containIntrinsicSize = `${resolveChapterPlaceholderHeight(height)}px`;
}

export function markChapterAsPlaceholder(chapterEl: HTMLElement, height: number): void {
    const resolvedHeight = resolveChapterPlaceholderHeight(height);
    applyChapterShellStyles(chapterEl, resolvedHeight);
    chapterEl.style.height = `${resolvedHeight}px`;
    chapterEl.style.minHeight = `${resolvedHeight}px`;
    chapterEl.setAttribute('data-chapter-state', 'placeholder');
}

export function markChapterAsMounted(chapterEl: HTMLElement, height: number): void {
    applyChapterShellStyles(chapterEl, height);
    chapterEl.style.height = '';
    chapterEl.style.minHeight = '';
    chapterEl.removeAttribute('data-chapter-state');
}

export function resolveHighlightSpineIndex(cfiRange: string): number | null {
    if (cfiRange.startsWith('vitra:') || cfiRange.startsWith('bdise:')) {
        const parsed = Number.parseInt(cfiRange.split(':')[1] || '', 10);
        return Number.isFinite(parsed) ? parsed : null;
    }
    if (cfiRange.startsWith('epubcfi(')) {
        const match = cfiRange.match(/^epubcfi\(\/\d+\/(\d+)/);
        if (!match) return null;
        const parsed = Number.parseInt(match[1], 10);
        return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed / 2) - 1) : null;
    }
    return null;
}

export function resolveViewportDerivedMetrics(
    listEl: HTMLElement,
    scrollTop: number,
    viewportHeight: number,
    totalChapterCount: number,
): ViewportDerivedMetrics {
    const chapterProbeLine = scrollTop + Math.min(
        viewportHeight * CHAPTER_DETECTION_ANCHOR_RATIO,
        CHAPTER_DETECTION_ANCHOR_MAX_PX,
    );
    const viewportMid = scrollTop + viewportHeight / 2;
    const chapterEls = Array.from(listEl.querySelectorAll('[data-chapter-id]')) as HTMLElement[];
    let activeSpineIndex: number | null = null;
    let progressSpineIndex: number | null = null;
    let progress: number | null = null;

    for (const el of chapterEls) {
        const chapterIdAttr = el.getAttribute('data-chapter-id') || '';
        const match = chapterIdAttr.match(/^ch-(\d+)$/);
        if (!match) continue;

        const spineIndex = Number.parseInt(match[1], 10);
        const top = el.offsetTop;
        const height = el.offsetHeight;
        const bottom = top + height;

        if (activeSpineIndex === null && chapterProbeLine >= top && chapterProbeLine < bottom) {
            activeSpineIndex = spineIndex;
        }

        if (progressSpineIndex === null && viewportMid >= top && viewportMid < bottom) {
            progressSpineIndex = spineIndex;
            progress = height > 0 ? Math.max(0, Math.min(1, (spineIndex + ((viewportMid - top) / height)) / Math.max(1, totalChapterCount))) : 0;
        }

        if (activeSpineIndex !== null && progressSpineIndex !== null) {
            break;
        }
    }

    return {
        activeSpineIndex,
        progressSpineIndex,
        progress,
    };
}
