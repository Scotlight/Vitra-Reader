import { useCallback, useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import type { ChapterMetaVector } from '../../../engine';
import { batchUpdateSegmentHeights } from '../../../engine';
import { SCROLL_HEDGE_EPSILON_PX } from './scrollReaderConstants';
import type { ScrollReaderRefs } from './useScrollReaderRefs';
import type { VirtualChapterRuntime } from './useVirtualChapterRuntime';

interface UseVirtualHeightCommitOptions {
    chapterVectorsRef: MutableRefObject<Map<string, ChapterMetaVector>>;
    virtualChaptersRef: MutableRefObject<Map<string, VirtualChapterRuntime>>;
    refreshVirtualChapterLayout: (runtime: VirtualChapterRuntime) => void;
    requestFlush: () => void;
}

/**
 * 段实测高度回写：
 * - useChapterResizeObserver 探测到带 data-shadow-segment-index 的节点尺寸
 *   变化时，通过 refs.segmentResizeCallbackRef 调到这里
 * - 按 chapterId 聚合 pending 高度更新，rAF 防抖一帧
 * - flush 时调用 batchUpdateSegmentHeights，重算 vector 的 offsetY 与
 *   totalEstimatedHeight
 * - 锚点上方章节的累计 delta 进入 pendingDeltaRef 并触发 requestFlush，
 *   保证视口锚点不漂移
 * - 同时 refresh 已挂虚拟段的 transform，反映新的 offsetY
 */
export function useVirtualHeightCommit(
    refs: ScrollReaderRefs,
    options: UseVirtualHeightCommitOptions,
) {
    const {
        chapterVectorsRef,
        virtualChaptersRef,
        refreshVirtualChapterLayout,
        requestFlush,
    } = options;
    const {
        lastKnownAnchorIndexRef,
        pendingDeltaRef,
        segmentResizeCallbackRef,
    } = refs;

    const pendingUpdatesRef = useRef<Map<string, Map<number, number>>>(new Map());
    const flushRafRef = useRef<number | null>(null);

    const flushPendingHeightUpdates = useCallback(() => {
        flushRafRef.current = null;
        const pending = pendingUpdatesRef.current;
        if (pending.size === 0) return;

        const anchorIndex = lastKnownAnchorIndexRef.current;
        let aboveAnchorDelta = 0;

        pending.forEach((segmentMap, chapterId) => {
            const vector = chapterVectorsRef.current.get(chapterId);
            if (!vector) return;

            const updates: Array<{ index: number; realHeight: number }> = [];
            segmentMap.forEach((height, index) => {
                updates.push({ index, realHeight: height });
            });
            if (updates.length === 0) return;

            const totalDelta = batchUpdateSegmentHeights(vector, updates);
            const runtime = virtualChaptersRef.current.get(chapterId);
            if (!runtime) return;

            if (runtime.spineIndex < anchorIndex) {
                aboveAnchorDelta += totalDelta;
            }
            refreshVirtualChapterLayout(runtime);
        });

        pending.clear();

        if (Math.abs(aboveAnchorDelta) > SCROLL_HEDGE_EPSILON_PX) {
            pendingDeltaRef.current += aboveAnchorDelta;
            requestFlush();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [refreshVirtualChapterLayout, requestFlush]);

    const commitSegmentResize = useCallback((target: HTMLElement, height: number) => {
        const indexAttr = target.getAttribute('data-shadow-segment-index');
        if (indexAttr === null) return;
        const segmentIndex = Number.parseInt(indexAttr, 10);
        if (!Number.isFinite(segmentIndex) || segmentIndex < 0) return;

        const chapterEl = target.closest('[data-chapter-id]') as HTMLElement | null;
        if (!chapterEl) return;
        const chapterId = chapterEl.getAttribute('data-chapter-id');
        if (!chapterId) return;
        if (!chapterVectorsRef.current.has(chapterId)) return;

        let segmentMap = pendingUpdatesRef.current.get(chapterId);
        if (!segmentMap) {
            segmentMap = new Map();
            pendingUpdatesRef.current.set(chapterId, segmentMap);
        }
        segmentMap.set(segmentIndex, height);

        if (flushRafRef.current === null) {
            flushRafRef.current = requestAnimationFrame(flushPendingHeightUpdates);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [flushPendingHeightUpdates]);

    useEffect(() => {
        segmentResizeCallbackRef.current = commitSegmentResize;
        return () => {
            if (segmentResizeCallbackRef.current === commitSegmentResize) {
                segmentResizeCallbackRef.current = null;
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [commitSegmentResize]);

    useEffect(() => {
        return () => {
            if (flushRafRef.current !== null) {
                cancelAnimationFrame(flushRafRef.current);
                flushRafRef.current = null;
            }
            pendingUpdatesRef.current.clear();
        };
    }, []);
}
