import { useCallback, useLayoutEffect } from 'react';
import type { MutableRefObject } from 'react';
import type { SpineItemInfo } from '../../../engine/core/contentProvider';
import { findTextInDOM } from '../../../utils/textFinder';
import { computeGlobalVirtualSegmentMountPlan, shouldBypassShadowQueueForSegmentMetas } from '../scrollVectorStrategy';
import styles from '../ScrollReaderView.module.css';
import { markChapterAsMounted, resolveViewportDerivedMetrics } from './scrollReaderHelpers';
import {
    SCROLL_HEDGE_EPSILON_PX,
    INSTANT_SCROLL_BEHAVIOR,
    RANGE_HYDRATION_OVERSCAN_SEGMENTS,
    RANGE_HYDRATION_PRELOAD_MARGIN_PX,
    GLOBAL_VIRTUAL_SEGMENT_BUDGET,
} from './scrollReaderConstants';
import type { LoadedChapter } from './scrollReaderTypes';
import type { VirtualChapterRuntime } from './useVirtualChapterRuntime';
import type { ScrollReaderRefs } from './useScrollReaderRefs';
import { useScrollProgressCommit } from './useScrollProgressCommit';

interface UseAtomicDomCommitOptions {
    chapters: LoadedChapter[];
    spineItems: SpineItemInfo[];
    currentSpineIndex: number;
    initialScrollOffset: number;
    isInitialized: boolean;
    bookId: string;
    onProgressChange?: (progress: number) => void;
    onChapterChange?: (label: string, href: string) => void;
    setChapters: (updater: (prev: LoadedChapter[]) => LoadedChapter[]) => void;
    setIsInitialized: (value: boolean) => void;
    setCurrentSpineIndex: (value: number) => void;
    virtualChaptersRef: MutableRefObject<Map<string, VirtualChapterRuntime>>;
    cleanupVirtualChapterRuntime: (chapterId: string) => void;
    registerVirtualChapterRuntime: (chapterId: string, spineIndex: number, chapterEl: HTMLElement) => void;
    mountVirtualSegment: (runtime: VirtualChapterRuntime, segmentIndex: number) => void;
    refreshVirtualChapterLayout: (runtime: VirtualChapterRuntime) => void;
    observeChapterResizeNodes: (chapterEl: HTMLElement | null) => void;
    unobserveChapterResizeNodes: (chapterEl: HTMLElement | null) => void;
}

/**
 * 原子 DOM 挂载协议：
 * - useLayoutEffect: 把 ready 状态的章节 DOM 一次性挂入 listEl，按顺序
 *   prepend/append/insertBefore，挂完统一设置 mounted；触发首次初始滚动、
 *   pending 搜索定位；计算整体虚拟段挂载计划（全局预算 + overscan）
 * - requestFlush: 累计上方章节高度差分后批量补偿 scrollTop，让视口锚点
 *   保持在原章节
 * - syncViewportState: 从当前 scrollTop 派生 activeSpine + progress 快照
 */
export function useAtomicDomCommit(
    refs: ScrollReaderRefs,
    options: UseAtomicDomCommitOptions,
) {
    const {
        chapters,
        spineItems,
        currentSpineIndex,
        initialScrollOffset,
        isInitialized,
        bookId,
        onProgressChange,
        onChapterChange,
        setChapters,
        setIsInitialized,
        setCurrentSpineIndex,
        virtualChaptersRef,
        cleanupVirtualChapterRuntime,
        registerVirtualChapterRuntime,
        mountVirtualSegment,
        refreshVirtualChapterLayout,
        observeChapterResizeNodes,
        unobserveChapterResizeNodes,
    } = options;
    const {
        viewportRef,
        chapterListRef,
        flushRafRef,
        pendingDeltaRef,
        ignoreScrollEventRef,
        unlockAdjustingRafRef,
        initialScrollDone,
        lastScrollTopRef,
        pendingSearchTextRef,
        virtualSyncRafRef,
        pipelineRef,
        lastKnownAnchorIndexRef,
        lastReportedProgressRef,
        pendingProgressSnapshotRef,
    } = refs;

    const commitProgressSnapshot = useScrollProgressCommit({
        bookId,
        spineItems,
        lastReportedProgressRef,
        onProgressChange,
    });

    const requestFlush = useCallback(() => {
        if (flushRafRef.current !== null) return;

        flushRafRef.current = requestAnimationFrame(() => {
            flushRafRef.current = null;

            const viewport = viewportRef.current;
            if (!viewport) {
                pendingDeltaRef.current = 0;
                return;
            }

            const totalDelta = pendingDeltaRef.current;
            if (Math.abs(totalDelta) <= SCROLL_HEDGE_EPSILON_PX) {
                pendingDeltaRef.current = 0;
                return;
            }

            pendingDeltaRef.current = 0;
            ignoreScrollEventRef.current = true;
            const targetTop = viewport.scrollTop + totalDelta;
            viewport.scrollTo({ top: targetTop, behavior: INSTANT_SCROLL_BEHAVIOR });

            if (unlockAdjustingRafRef.current !== null) {
                cancelAnimationFrame(unlockAdjustingRafRef.current);
            }

            unlockAdjustingRafRef.current = requestAnimationFrame(() => {
                unlockAdjustingRafRef.current = requestAnimationFrame(() => {
                    unlockAdjustingRafRef.current = null;
                    ignoreScrollEventRef.current = false;
                });
            });
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useLayoutEffect(() => {
        const viewport = viewportRef.current;
        const listEl = chapterListRef.current;
        if (!viewport || !listEl) return;

        const readyChapters = chapters.filter(ch => ch.status === 'ready');
        if (readyChapters.length === 0) return;

        readyChapters.forEach(ch => {
            const existingChapterEl = listEl.querySelector(`[data-chapter-id="${ch.id}"]`) as HTMLElement | null;
            const isInsertion = !existingChapterEl;

            const chapterEl = existingChapterEl || document.createElement('div');
            if (!existingChapterEl) {
                chapterEl.setAttribute('data-chapter-id', ch.id);
                chapterEl.className = styles.chapterBlock;
            }
            unobserveChapterResizeNodes(chapterEl);
            markChapterAsMounted(chapterEl, ch.height);
            chapterEl.replaceChildren();

            if (ch.domNode) {
                chapterEl.appendChild(ch.domNode);
            }

            if (isInsertion) {
                const targetIndex = chapters.indexOf(ch);
                const existingNodes = Array.from(listEl.children);

                if (targetIndex === 0 && existingNodes.length > 0) {
                    listEl.prepend(chapterEl);
                } else if (targetIndex >= existingNodes.length) {
                    listEl.appendChild(chapterEl);
                } else {
                    listEl.insertBefore(chapterEl, existingNodes[targetIndex] || null);
                }
            }
            observeChapterResizeNodes(chapterEl);
            if (ch.segmentMetas && shouldBypassShadowQueueForSegmentMetas(ch.segmentMetas)) {
                registerVirtualChapterRuntime(ch.id, ch.spineIndex, chapterEl);
            } else {
                cleanupVirtualChapterRuntime(ch.id);
            }
        });

        pipelineRef.current = 'idle';

        setChapters(prev =>
            prev.map(ch =>
                ch.status === 'ready' ? { ...ch, status: 'mounted', mountedAt: Date.now() } : ch
            )
        );

        if (!initialScrollDone.current && initialScrollOffset > 0) {
            viewport.scrollTop = initialScrollOffset;
            lastScrollTopRef.current = viewport.scrollTop;
            initialScrollDone.current = true;
        }

        const searchText = pendingSearchTextRef.current;
        if (searchText) {
            pendingSearchTextRef.current = null;
            const mountedChapters = chapters.filter(ch => ch.status === 'ready' || ch.status === 'mounted');
            for (const ch of mountedChapters) {
                const el = listEl.querySelector(`[data-chapter-id="${ch.id}"]`) as HTMLElement | null;
                if (el) {
                    const range = findTextInDOM(el, searchText);
                    if (range) {
                        const rect = range.getBoundingClientRect();
                        const vpRect = viewport.getBoundingClientRect();
                        viewport.scrollTop += rect.top - vpRect.top;
                        lastScrollTopRef.current = viewport.scrollTop;
                        break;
                    }
                }
            }
        }

        if (!isInitialized && chapters.some(ch => ch.status === 'ready' || ch.status === 'mounted')) {
            setIsInitialized(true);
        }
        if (virtualSyncRafRef.current === null) {
            virtualSyncRafRef.current = requestAnimationFrame(() => {
                virtualSyncRafRef.current = null;
                const viewportEl = viewportRef.current;
                if (!viewportEl) return;
                const scrollTop = viewportEl.scrollTop;
                const viewportHeight = viewportEl.clientHeight;
                const runtimes = Array.from(virtualChaptersRef.current.values());
                const mountPlan = computeGlobalVirtualSegmentMountPlan(
                    runtimes.map((runtime) => ({
                        chapterId: runtime.chapterId,
                        chapterTop: runtime.chapterEl.offsetTop,
                        vector: runtime.vector,
                    })),
                    scrollTop,
                    viewportHeight,
                    {
                        overscanSegments: RANGE_HYDRATION_OVERSCAN_SEGMENTS,
                        preloadMarginPx: RANGE_HYDRATION_PRELOAD_MARGIN_PX,
                        globalSegmentBudget: GLOBAL_VIRTUAL_SEGMENT_BUDGET,
                    },
                );
                runtimes.forEach((runtime) => {
                    const nextIndices = new Set(mountPlan.get(runtime.chapterId) ?? []);
                    Array.from(nextIndices).sort((a, b) => a - b).forEach((segmentIndex) => {
                        mountVirtualSegment(runtime, segmentIndex);
                    });
                    refreshVirtualChapterLayout(runtime);
                });
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [chapters, cleanupVirtualChapterRuntime, initialScrollOffset, isInitialized, mountVirtualSegment, observeChapterResizeNodes, refreshVirtualChapterLayout, registerVirtualChapterRuntime, unobserveChapterResizeNodes]);

    const syncViewportState = useCallback((
        scrollTop: number,
        viewportHeight: number,
        opts: { commitProgress?: boolean } = {},
    ) => {
        if (spineItems.length === 0) return;

        const listEl = chapterListRef.current;
        if (!listEl) return;

        const metrics = resolveViewportDerivedMetrics(listEl, scrollTop, viewportHeight, spineItems.length);
        if (metrics.activeSpineIndex !== null) {
            lastKnownAnchorIndexRef.current = metrics.activeSpineIndex;
            if (metrics.activeSpineIndex !== currentSpineIndex) {
                setCurrentSpineIndex(metrics.activeSpineIndex);
                if (onChapterChange && spineItems[metrics.activeSpineIndex]) {
                    onChapterChange(spineItems[metrics.activeSpineIndex].id, spineItems[metrics.activeSpineIndex].href);
                }
            }
        }

        if (metrics.progress !== null && metrics.progressSpineIndex !== null) {
            const snapshot = {
                spineIndex: metrics.progressSpineIndex,
                progress: metrics.progress,
                scrollTop,
            };
            pendingProgressSnapshotRef.current = snapshot;
            if (opts.commitProgress) {
                commitProgressSnapshot(snapshot);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [spineItems, currentSpineIndex, onChapterChange, commitProgressSnapshot, setCurrentSpineIndex]);

    return { requestFlush, commitProgressSnapshot, syncViewportState };
}
