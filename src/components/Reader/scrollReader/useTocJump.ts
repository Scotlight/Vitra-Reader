import { useCallback, useEffect } from 'react';
import type { MutableRefObject } from 'react';
import type { ChapterMetaVector } from '@/engine/types/vectorRender';
import type { ContentProvider } from '@/engine/core/contentProvider';
import type { LoadedChapter } from './scrollReaderTypes';
import { resetScrollPipelineRuntime } from './scrollPipelineRuntime';
import type { ScrollReaderRefs } from './useScrollReaderRefs';
import { resolveReaderInternalLinkTarget } from '../readerInternalLink';
import { clearMountedChapterDom } from './tocJumpDomCleanup';
import { scrollMountedChapterIntoView } from './tocJumpMountedChapter';
import { prepareTocJumpRuntime } from './tocJumpRuntime';

interface UseTocJumpOptions {
    provider: ContentProvider;
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
 * - 附带监听正文内部链接（PDF 页码链接 / 普通 href），转发到 jumpToSpine
 */
export function useTocJump(
    refs: ScrollReaderRefs,
    options: UseTocJumpOptions,
) {
    const {
        provider,
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
    } = refs;

    const jumpToSpine = useCallback(async (targetSpineIndex: number, searchText?: string) => {
        if (targetSpineIndex < 0 || targetSpineIndex >= spineItemsRef.current.length) return;

        const generation = ++jumpGenerationRef.current;

        prepareTocJumpRuntime({
            searchText,
            cancelIdlePrefetch,
            stop,
            isUserScrollingRef,
            scrollIdleTimerRef,
            pendingSearchTextRef,
            initialScrollDone,
            progressTimerRef,
        });

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
                scrollMountedChapterIntoView({
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
                });
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
            clearMountedChapterDom({
                listEl,
                cleanupVirtualChapterRuntime,
                resetResizeObservers,
            });
        }

        chaptersRef.current = [];
        setChapters([]);
        setShadowQueue([]);
        resetScrollPipelineRuntime(refs);
        setCurrentSpineIndex(targetSpineIndex);
        lastKnownAnchorIndexRef.current = targetSpineIndex;

        if (jumpGenerationRef.current !== generation) return;

        loadChapter(targetSpineIndex, 'initial');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cancelIdlePrefetch, cleanupVirtualChapterRuntime, forceHydrateSegment, loadChapter, materializeAllVirtualSegments, onChapterChange, resetResizeObservers, stop, syncViewportState]);

    useEffect(() => {
        const listEl = chapterListRef.current;
        if (!listEl) return;

        const handleInternalLink = (event: MouseEvent) => {
            const target = event.target;
            if (!(target instanceof Element)) return;

            const anchor = target.closest('a');
            if (!(anchor instanceof HTMLAnchorElement)) return;
            const targetSpine = resolveReaderInternalLinkTarget(anchor, provider);
            if (targetSpine === null) return;
            if (targetSpine < 0 || targetSpine >= spineItemsRef.current.length) return;

            event.preventDefault();
            event.stopPropagation();
            void jumpToSpine(targetSpine);
        };

        listEl.addEventListener('click', handleInternalLink);
        return () => {
            listEl.removeEventListener('click', handleInternalLink);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [jumpToSpine, provider]);

    return { jumpToSpine };
}
