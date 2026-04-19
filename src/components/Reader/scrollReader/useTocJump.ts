import { useCallback, useEffect } from 'react';
import type { MutableRefObject } from 'react';
import { findTextInDOM } from '../../../utils/textFinder';
import { releaseMediaResources } from '../../../utils/mediaResourceCleanup';
import { segmentPool } from '../ShadowRenderer';
import type { ChapterMetaVector } from '../../../engine';
import type { LoadedChapter } from './scrollReaderTypes';
import type { ScrollReaderRefs } from './useScrollReaderRefs';

interface UseTocJumpOptions {
    onChapterChange?: (label: string, href: string) => void;
    setCurrentSpineIndex: (value: number) => void;
    setChapters: (next: LoadedChapter[]) => void;
    setShadowQueue: (next: LoadedChapter[]) => void;
    chapterVectorsRef: MutableRefObject<Map<string, ChapterMetaVector>>;
    loadChapter: (spineIndex: number, direction: 'prev' | 'next' | 'initial') => void;
    cleanupVirtualChapterRuntime: (chapterId: string) => void;
    forceHydrateSegment: (segmentEl: HTMLElement) => void;
    materializeAllVirtualSegments: (chapterId: string) => void;
    resetResizeObservers: () => void;
    syncViewportState: (scrollTop: number, viewportHeight: number, opts?: { commitProgress?: boolean }) => void;
    cancelIdlePrefetch: () => void;
    stop: () => void;
}

/**
 * TOC / 外部跳转协议：
 * - 目标章节已挂载：直接 scrollTo 到 chapterEl.offsetTop，若附带 searchText
 *   则强制 hydrate 所有段后查找文本并精确滚动
 * - 目标章节未挂载：清空所有 DOM / state / 段池，重置 scrollTop，loadChapter 新章节
 * - 通过 jumpGenerationRef 维护代数，中途新跳转让旧清理中断
 * - 附带监听 PDF 内部链接（a[data-pdf-page]）的点击事件，转发到 jumpToSpine
 */
export function useTocJump(
    refs: ScrollReaderRefs,
    options: UseTocJumpOptions,
) {
    const {
        onChapterChange,
        setCurrentSpineIndex,
        setChapters,
        setShadowQueue,
        loadChapter,
        cleanupVirtualChapterRuntime,
        forceHydrateSegment,
        materializeAllVirtualSegments,
        resetResizeObservers,
        syncViewportState,
        cancelIdlePrefetch,
        stop,
    } = options;
    const {
        viewportRef,
        chapterListRef,
        spineItemsRef,
        chaptersRef,
        jumpGenerationRef,
        pendingSearchTextRef,
        initialScrollDone,
        scrollIdleTimerRef,
        progressTimerRef,
        isUserScrollingRef,
        lastScrollTopRef,
        lastKnownAnchorIndexRef,
        loadingLockRef,
        pipelineRef,
    } = refs;

    const jumpToSpine = useCallback(async (targetSpineIndex: number, searchText?: string) => {
        if (targetSpineIndex < 0 || targetSpineIndex >= spineItemsRef.current.length) return;

        const generation = ++jumpGenerationRef.current;

        cancelIdlePrefetch();
        isUserScrollingRef.current = false;
        if (scrollIdleTimerRef.current !== null) {
            window.clearTimeout(scrollIdleTimerRef.current);
            scrollIdleTimerRef.current = null;
        }
        pendingSearchTextRef.current = searchText || null;
        initialScrollDone.current = true;
        stop();
        if (progressTimerRef.current) {
            window.clearTimeout(progressTimerRef.current);
            progressTimerRef.current = null;
        }

        setCurrentSpineIndex(targetSpineIndex);
        lastKnownAnchorIndexRef.current = targetSpineIndex;
        if (onChapterChange && spineItemsRef.current[targetSpineIndex]) {
            onChapterChange(
                spineItemsRef.current[targetSpineIndex].id,
                spineItemsRef.current[targetSpineIndex].href,
            );
        }

        const existing = chaptersRef.current.find(ch =>
            ch.spineIndex === targetSpineIndex && ch.status === 'mounted'
        );

        if (existing) {
            const listEl = chapterListRef.current;
            const viewport = viewportRef.current;
            if (listEl && viewport) {
                const domEl = listEl.querySelector(`[data-chapter-id="ch-${targetSpineIndex}"]`) as HTMLElement | null;
                if (domEl) {
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
            }
            return;
        }

        const viewport = viewportRef.current;
        if (viewport) {
            viewport.scrollTop = 0;
            lastScrollTopRef.current = 0;
        }
        const listEl = chapterListRef.current;
        if (listEl) {
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

        chaptersRef.current = [];
        setChapters([]);
        setShadowQueue([]);
        loadingLockRef.current.clear();
        pipelineRef.current = 'idle';
        setCurrentSpineIndex(targetSpineIndex);
        lastKnownAnchorIndexRef.current = targetSpineIndex;

        if (jumpGenerationRef.current !== generation) return;

        loadChapter(targetSpineIndex, 'initial');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cancelIdlePrefetch, cleanupVirtualChapterRuntime, forceHydrateSegment, loadChapter, materializeAllVirtualSegments, onChapterChange, resetResizeObservers, stop, syncViewportState]);

    useEffect(() => {
        const listEl = chapterListRef.current;
        if (!listEl) return;

        const handlePdfInternalLink = (event: MouseEvent) => {
            const target = event.target;
            if (!(target instanceof Element)) return;

            const anchor = target.closest('a[data-pdf-page]');
            if (!(anchor instanceof HTMLAnchorElement)) return;

            const rawPage = anchor.getAttribute('data-pdf-page');
            if (!rawPage) return;
            const targetSpine = Number.parseInt(rawPage, 10);
            if (!Number.isFinite(targetSpine)) return;
            if (targetSpine < 0 || targetSpine >= spineItemsRef.current.length) return;

            event.preventDefault();
            event.stopPropagation();
            void jumpToSpine(targetSpine);
        };

        listEl.addEventListener('click', handlePdfInternalLink);
        return () => {
            listEl.removeEventListener('click', handlePdfInternalLink);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [jumpToSpine]);

    return { jumpToSpine };
}
