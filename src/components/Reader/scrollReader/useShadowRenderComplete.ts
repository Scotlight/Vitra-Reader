import { useCallback, useEffect } from 'react';
import type { MutableRefObject } from 'react';
import type { ChapterMetaVector } from '../../../engine';
import { buildChapterMetaVector } from '../../../engine';
import type { LoadedChapter } from './scrollReaderTypes';
import type { VirtualChapterRuntime } from './useVirtualChapterRuntime';
import type { ScrollReaderRefs } from './useScrollReaderRefs';

interface UseShadowRenderCompleteOptions {
    chapterVectorsRef: MutableRefObject<Map<string, ChapterMetaVector>>;
    virtualChaptersRef: MutableRefObject<Map<string, VirtualChapterRuntime>>;
    mountVirtualSegment: (runtime: VirtualChapterRuntime, segmentIndex: number) => void;
    refreshVirtualChapterLayout: (runtime: VirtualChapterRuntime) => void;
    setChapters: (updater: (prev: LoadedChapter[]) => LoadedChapter[]) => void;
    setShadowQueue: (updater: (prev: LoadedChapter[]) => LoadedChapter[]) => void;
    requestFlush: () => void;
}

/**
 * ShadowRenderer onReady 回调：
 * - handleShadowReady: 把 shadow 渲染完成的章节 DOM + 高度收集进本帧 batch，
 *   rAF 内统一 flush 为 setChapters(status='ready')；若锚点上方章节完成渲染，
 *   累计高度差分给 Atomic DOM Commit 的 requestFlush 做滚动补偿。
 * - forceHydrateSegment: 供 jumpToSpine / highlight 注入时强制展开某段
 *   （绕过可见性触发的渐进 hydration）。
 * - materializeAllVirtualSegments: 一次性展开整章所有虚拟段。
 *
 * 附带一个组件卸载时取消所有悬空 rAF 的 cleanup effect。
 */
export function useShadowRenderComplete(
    refs: ScrollReaderRefs,
    options: UseShadowRenderCompleteOptions,
) {
    const {
        chapterVectorsRef,
        virtualChaptersRef,
        mountVirtualSegment,
        refreshVirtualChapterLayout,
        setChapters,
        setShadowQueue,
        requestFlush,
    } = options;
    const {
        chaptersRef,
        pendingReadyRef,
        pendingReadyRafRef,
        pendingDeltaRef,
        flushRafRef,
        unlockAdjustingRafRef,
        ignoreScrollEventRef,
        lastKnownAnchorIndexRef,
    } = refs;

    const handleShadowReady = useCallback((
        spineIndex: number,
        node: HTMLElement,
        height: number,
    ) => {
        console.log(`[ScrollReader] Shadow ready: spine ${spineIndex}, height ${height}px`);

        const chapterId = `ch-${spineIndex}`;
        const ch = chaptersRef.current.find(c => c.spineIndex === spineIndex);
        const previousHeight = ch?.height ?? 0;
        const delta = height - previousHeight;

        if (ch?.segmentMetas && ch.segmentMetas.length > 0) {
            const vector = buildChapterMetaVector(chapterId, spineIndex, ch.segmentMetas);
            chapterVectorsRef.current.set(chapterId, vector);
        }

        pendingReadyRef.current.push({ spineIndex, node, height });

        if (pendingReadyRafRef.current === null) {
            pendingReadyRafRef.current = requestAnimationFrame(() => {
                pendingReadyRafRef.current = null;
                const batch = pendingReadyRef.current.splice(0);
                if (batch.length === 0) return;

                console.log(`[ScrollReader] Flush batch: ${batch.map(b => `spine ${b.spineIndex}`).join(', ')}`);

                const batchIndices = new Set(batch.map(b => b.spineIndex));
                setShadowQueue(prev => prev.filter(c => !batchIndices.has(c.spineIndex)));

                setChapters(prev => {
                    let updated = prev;
                    for (const item of batch) {
                        const index = updated.findIndex(c => c.spineIndex === item.spineIndex);
                        if (index < 0) continue;
                        if (updated[index].status === 'mounted') continue;
                        if (updated === prev) updated = [...prev];
                        updated[index] = {
                            ...updated[index],
                            domNode: item.node,
                            height: item.height,
                            status: 'ready',
                        };
                    }
                    return updated;
                });
            });
        }

        if (spineIndex < lastKnownAnchorIndexRef.current) {
            pendingDeltaRef.current += delta;
            requestFlush();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [requestFlush]);

    useEffect(() => {
        return () => {
            if (pendingReadyRafRef.current !== null) {
                cancelAnimationFrame(pendingReadyRafRef.current);
                pendingReadyRafRef.current = null;
            }
            if (flushRafRef.current !== null) {
                cancelAnimationFrame(flushRafRef.current);
                flushRafRef.current = null;
            }
            if (unlockAdjustingRafRef.current !== null) {
                cancelAnimationFrame(unlockAdjustingRafRef.current);
                unlockAdjustingRafRef.current = null;
            }
            pendingReadyRef.current = [];
            pendingDeltaRef.current = 0;
            ignoreScrollEventRef.current = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const forceHydrateSegment = useCallback((segmentEl: HTMLElement) => {
        const state = segmentEl.getAttribute('data-shadow-segment-state');
        if (state === 'hydrated') return;

        const chapterEl = segmentEl.closest('[data-chapter-id]') as HTMLElement | null;
        if (!chapterEl) return;
        const chapterId = chapterEl.getAttribute('data-chapter-id');
        if (!chapterId) return;

        const vector = chapterVectorsRef.current.get(chapterId);
        if (!vector) return;

        const segIndex = parseInt(segmentEl.getAttribute('data-shadow-segment-index') || '-1', 10);
        const meta = vector.segments[segIndex];
        if (!meta) return;

        segmentEl.innerHTML = meta.htmlContent;
        segmentEl.setAttribute('data-shadow-segment-state', 'hydrated');
        segmentEl.style.minHeight = '0px';
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const materializeAllVirtualSegments = useCallback((chapterId: string) => {
        const runtime = virtualChaptersRef.current.get(chapterId);
        if (!runtime) return;
        for (let index = 0; index < runtime.vector.segments.length; index += 1) {
            mountVirtualSegment(runtime, index);
        }
        refreshVirtualChapterLayout(runtime);
    }, [mountVirtualSegment, refreshVirtualChapterLayout]);

    return { handleShadowReady, forceHydrateSegment, materializeAllVirtualSegments };
}
