import { useCallback, useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import type { ChapterMetaVector } from '@/engine';
import { SCROLL_HEDGE_EPSILON_PX } from './scrollReaderConstants';
import {
    applyPendingVirtualHeightUpdates,
    recordPendingSegmentHeightUpdate,
    resolveSegmentResizeTarget,
} from './virtualHeightCommitState';
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

        const aboveAnchorDelta = applyPendingVirtualHeightUpdates({
            pending,
            chapterVectors: chapterVectorsRef.current,
            virtualChapters: virtualChaptersRef.current,
            anchorIndex: lastKnownAnchorIndexRef.current,
            refreshVirtualChapterLayout,
        });

        pending.clear();

        if (Math.abs(aboveAnchorDelta) > SCROLL_HEDGE_EPSILON_PX) {
            pendingDeltaRef.current += aboveAnchorDelta;
            requestFlush();
        }
    }, [
        chapterVectorsRef,
        lastKnownAnchorIndexRef,
        pendingDeltaRef,
        refreshVirtualChapterLayout,
        requestFlush,
        virtualChaptersRef,
    ]);

    const commitSegmentResize = useCallback((target: HTMLElement, height: number) => {
        const resizeTarget = resolveSegmentResizeTarget(target);
        if (!resizeTarget) return;

        if (!chapterVectorsRef.current.has(resizeTarget.chapterId)) return;

        recordPendingSegmentHeightUpdate(
            pendingUpdatesRef.current,
            resizeTarget.chapterId,
            resizeTarget.segmentIndex,
            height,
        );

        if (flushRafRef.current === null) {
            flushRafRef.current = requestAnimationFrame(flushPendingHeightUpdates);
        }
    }, [chapterVectorsRef, flushPendingHeightUpdates]);

    useEffect(() => {
        segmentResizeCallbackRef.current = commitSegmentResize;
        return () => {
            if (segmentResizeCallbackRef.current === commitSegmentResize) {
                segmentResizeCallbackRef.current = null;
            }
        };
    }, [commitSegmentResize, segmentResizeCallbackRef]);

    useEffect(() => {
        const pendingUpdates = pendingUpdatesRef.current;

        return () => {
            if (flushRafRef.current !== null) {
                cancelAnimationFrame(flushRafRef.current);
                flushRafRef.current = null;
            }
            pendingUpdates.clear();
        };
    }, []);
}
