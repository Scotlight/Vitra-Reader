import { useCallback, useRef } from 'react';
import type { ChapterMetaVector, SegmentMeta } from '@/engine/types/vectorRender';
import { segmentPool } from '../ShadowRenderer';

const VIRTUAL_SEGMENT_MIN_HEIGHT_PX = 96;

export interface VirtualChapterRuntime {
    chapterId: string;
    spineIndex: number;
    chapterEl: HTMLElement;
    contentEl: HTMLElement;
    vector: ChapterMetaVector;
    activeSegmentEls: Map<number, HTMLElement>;
}

export function getVectorContentContainer(node: ParentNode | null): HTMLElement | null {
    if (!node) return null;
    return node.querySelector('[data-vitra-vector-content="true"]') as HTMLElement | null;
}

function resolveVirtualSegmentHeight(segment: SegmentMeta): number {
    return Math.max(VIRTUAL_SEGMENT_MIN_HEIGHT_PX, segment.realHeight ?? segment.estimatedHeight);
}

function updateVirtualContentHeight(contentEl: HTMLElement, vector: ChapterMetaVector): void {
    const totalHeight = Math.max(1, vector.totalEstimatedHeight);
    contentEl.style.position = 'relative';
    contentEl.style.height = `${totalHeight}px`;
    contentEl.style.minHeight = `${totalHeight}px`;
    contentEl.setAttribute('data-vitra-vector-total-height', String(totalHeight));
}

function updateVirtualSegmentLayout(segmentEl: HTMLElement, segment: SegmentMeta): void {
    segmentEl.style.position = 'absolute';
    segmentEl.style.top = '0';
    segmentEl.style.left = '0';
    segmentEl.style.right = '0';
    segmentEl.style.width = '100%';
    segmentEl.style.transform = `translateY(${Math.max(0, segment.offsetY)}px)`;
    segmentEl.style.containIntrinsicSize = `${resolveVirtualSegmentHeight(segment)}px`;
}

function insertVirtualSegmentInOrder(
    container: HTMLElement,
    activeSegmentEls: ReadonlyMap<number, HTMLElement>,
    nextIndex: number,
    segmentEl: HTMLElement,
): void {
    const ordered = Array.from(activeSegmentEls.entries()).sort((a, b) => a[0] - b[0]);
    const nextSibling = ordered.find(([index]) => index > nextIndex)?.[1] ?? null;
    container.insertBefore(segmentEl, nextSibling);
}

interface UseVirtualChapterRuntimeOptions {
    observeResizeNode: (node: HTMLElement | null) => void;
    unobserveResizeNode: (node: HTMLElement | null) => void;
}

export function useVirtualChapterRuntime(options: UseVirtualChapterRuntimeOptions) {
    const { observeResizeNode, unobserveResizeNode } = options;
    const virtualChaptersRef = useRef<Map<string, VirtualChapterRuntime>>(new Map());
    const chapterVectorsRef = useRef<Map<string, ChapterMetaVector>>(new Map());

    const releaseVirtualSegment = useCallback((runtime: VirtualChapterRuntime, segmentIndex: number) => {
        const segmentEl = runtime.activeSegmentEls.get(segmentIndex);
        if (!segmentEl) return;
        runtime.activeSegmentEls.delete(segmentIndex);
        unobserveResizeNode(segmentEl);
        if (segmentEl.isConnected) {
            segmentEl.remove();
        }
        segmentPool.release(segmentEl);
    }, [unobserveResizeNode]);

    const cleanupVirtualChapterRuntime = useCallback((chapterId: string) => {
        const runtime = virtualChaptersRef.current.get(chapterId);
        if (!runtime) return;
        Array.from(runtime.activeSegmentEls.keys()).forEach((segmentIndex) => {
            releaseVirtualSegment(runtime, segmentIndex);
        });
        virtualChaptersRef.current.delete(chapterId);
    }, [releaseVirtualSegment]);

    const refreshVirtualChapterLayout = useCallback((runtime: VirtualChapterRuntime) => {
        updateVirtualContentHeight(runtime.contentEl, runtime.vector);
        runtime.activeSegmentEls.forEach((segmentEl, segmentIndex) => {
            const segment = runtime.vector.segments[segmentIndex];
            if (!segment) return;
            updateVirtualSegmentLayout(segmentEl, segment);
        });
    }, []);

    const mountVirtualSegment = useCallback((runtime: VirtualChapterRuntime, segmentIndex: number) => {
        const segment = runtime.vector.segments[segmentIndex];
        if (!segment) return;

        const existing = runtime.activeSegmentEls.get(segmentIndex);
        if (existing) {
            updateVirtualSegmentLayout(existing, segment);
            return;
        }

        const segmentEl = segmentPool.acquire();
        segmentEl.setAttribute('data-shadow-segment-index', String(segmentIndex));
        segmentEl.setAttribute('data-shadow-segment-state', 'hydrated');
        segmentEl.style.contain = 'layout style paint';
        segmentEl.style.minHeight = '0px';
        segmentEl.innerHTML = segment.htmlContent;
        updateVirtualSegmentLayout(segmentEl, segment);

        insertVirtualSegmentInOrder(runtime.contentEl, runtime.activeSegmentEls, segmentIndex, segmentEl);
        runtime.activeSegmentEls.set(segmentIndex, segmentEl);
        observeResizeNode(segmentEl);
    }, [observeResizeNode]);

    const registerVirtualChapterRuntime = useCallback((chapterId: string, spineIndex: number, chapterEl: HTMLElement) => {
        const vector = chapterVectorsRef.current.get(chapterId);
        const contentEl = getVectorContentContainer(chapterEl);
        if (!vector || !contentEl) {
            cleanupVirtualChapterRuntime(chapterId);
            return;
        }

        cleanupVirtualChapterRuntime(chapterId);
        updateVirtualContentHeight(contentEl, vector);
        virtualChaptersRef.current.set(chapterId, {
            chapterId,
            spineIndex,
            chapterEl,
            contentEl,
            vector,
            activeSegmentEls: new Map<number, HTMLElement>(),
        });
    }, [cleanupVirtualChapterRuntime]);

    return {
        virtualChaptersRef,
        chapterVectorsRef,
        mountVirtualSegment,
        releaseVirtualSegment,
        cleanupVirtualChapterRuntime,
        refreshVirtualChapterLayout,
        registerVirtualChapterRuntime,
    };
}
