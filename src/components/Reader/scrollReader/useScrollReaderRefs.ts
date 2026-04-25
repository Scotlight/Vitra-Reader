import { useRef } from 'react';
import type { IdleTaskHandle } from '@/utils/idleScheduler';
import type { SpineItemInfo } from '@/engine/core/contentProvider';
import type { LoadedChapter, PipelineState } from './scrollReaderTypes';

interface ScrollReaderRefsInit {
    initialSpineIndex: number;
}

/**
 * 把 ScrollReaderView 内所有 useRef 调用集中为一个 hook 返回的普通对象，
 * 不是 Context / Store，只是显式的共享容器：
 * - 全部 ref 定义在此文件，加字段只改两处（interface + creator）
 * - 子 hook 接收 refs: ScrollReaderRefs 参数，签名短
 * - 调试写入来源用 `refs.xxxRef.current =` 全局搜即可
 */
export function useScrollReaderRefs(init: ScrollReaderRefsInit) {
    return {
        // ── DOM refs ──
        viewportRef: useRef<HTMLDivElement>(null),
        chapterListRef: useRef<HTMLDivElement>(null),

        // ── pipeline / scroll state ──
        lastScrollTopRef: useRef(0),
        pipelineRef: useRef<PipelineState>('idle'),
        loadingLockRef: useRef<Set<number>>(new Set()),
        progressTimerRef: useRef<number | null>(null),
        scrollIdleTimerRef: useRef<number | null>(null),
        idlePrefetchHandleRef: useRef<number | null>(null),
        isUserScrollingRef: useRef(false),
        initialScrollDone: useRef(false),
        pendingSearchTextRef: useRef<string | null>(null),
        jumpGenerationRef: useRef(0),

        // ── chapter / spine state mirrors ──
        chaptersRef: useRef<LoadedChapter[]>([]),
        spineItemsRef: useRef<SpineItemInfo[]>([]),

        // ── resize observer ──
        resizeObserverRef: useRef<ResizeObserver | null>(null),
        observedResizeNodesRef: useRef<Set<HTMLElement>>(new Set()),
        observedResizeHeightsRef: useRef<WeakMap<HTMLElement, number>>(new WeakMap()),

        // ── virtual segment sync ──
        virtualSyncRafRef: useRef<number | null>(null),

        // ── highlight ──
        highlightDirtyChaptersRef: useRef<Set<number>>(new Set()),
        highlightIdleHandlesRef: useRef<Map<number, IdleTaskHandle>>(new Map()),

        // ── progress snapshot ──
        lastReportedProgressRef: useRef<{ spineIndex: number; progress: number } | null>(null),
        pendingProgressSnapshotRef: useRef<{ spineIndex: number; progress: number; scrollTop: number } | null>(null),

        // ── rAF 批处理 ──
        pendingReadyRef: useRef<Array<{ spineIndex: number; node: HTMLElement; height: number }>>([]),
        pendingReadyRafRef: useRef<number | null>(null),
        pendingDeltaRef: useRef(0),
        flushRafRef: useRef<number | null>(null),
        unlockAdjustingRafRef: useRef<number | null>(null),
        ignoreScrollEventRef: useRef(false),

        // ── misc ──
        lastKnownAnchorIndexRef: useRef(init.initialSpineIndex),
        readerStylesKeyRef: useRef(''),
    };
}

export type ScrollReaderRefs = ReturnType<typeof useScrollReaderRefs>;
