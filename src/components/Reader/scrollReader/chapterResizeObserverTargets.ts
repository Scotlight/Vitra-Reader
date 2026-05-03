import type { MutableRefObject } from 'react';

interface HandleResizeObserverEntriesOptions {
    entries: ResizeObserverEntry[];
    observedResizeHeightsRef: MutableRefObject<WeakMap<HTMLElement, number>>;
    segmentResizeCallbackRef: MutableRefObject<((target: HTMLElement, height: number) => void) | null>;
}

interface ObserveResizeNodeOptions {
    node: HTMLElement | null;
    resizeObserver: ResizeObserver | null;
    observedResizeNodesRef: MutableRefObject<Set<HTMLElement>>;
    observedResizeHeightsRef: MutableRefObject<WeakMap<HTMLElement, number>>;
}

interface UnobserveResizeNodeOptions {
    node: HTMLElement | null;
    resizeObserver: ResizeObserver | null;
    observedResizeNodesRef: MutableRefObject<Set<HTMLElement>>;
}

interface ResetResizeObserverTargetsOptions {
    resizeObserver: ResizeObserver | null;
    observedResizeNodesRef: MutableRefObject<Set<HTMLElement>>;
    observedResizeHeightsRef: MutableRefObject<WeakMap<HTMLElement, number>>;
}

export function handleResizeObserverEntries({
    entries,
    observedResizeHeightsRef,
    segmentResizeCallbackRef,
}: HandleResizeObserverEntriesOptions): void {
    entries.forEach((entry) => {
        const target = entry.target as HTMLElement;
        const nextHeight = Math.max(1, entry.contentRect.height);
        observedResizeHeightsRef.current.set(target, nextHeight);
        if (target.hasAttribute('data-shadow-segment-index')) {
            segmentResizeCallbackRef.current?.(target, nextHeight);
        }
    });
}

export function getChapterResizeTargets(chapterEl: HTMLElement): HTMLElement[] {
    return Array.from(
        chapterEl.querySelectorAll('[data-shadow-segment-index]')
    ) as HTMLElement[];
}

export function observeResizeNode({
    node,
    resizeObserver,
    observedResizeNodesRef,
    observedResizeHeightsRef,
}: ObserveResizeNodeOptions): void {
    if (!node) return;
    if (observedResizeNodesRef.current.has(node)) return;
    observedResizeNodesRef.current.add(node);
    observedResizeHeightsRef.current.set(node, Math.max(1, node.getBoundingClientRect().height));
    resizeObserver?.observe(node);
}

export function unobserveResizeNode({
    node,
    resizeObserver,
    observedResizeNodesRef,
}: UnobserveResizeNodeOptions): void {
    if (!node) return;
    if (!observedResizeNodesRef.current.has(node)) return;
    observedResizeNodesRef.current.delete(node);
    resizeObserver?.unobserve(node);
}

export function resetResizeObserverTargets({
    resizeObserver,
    observedResizeNodesRef,
    observedResizeHeightsRef,
}: ResetResizeObserverTargetsOptions): void {
    observedResizeNodesRef.current.forEach((node) => {
        resizeObserver?.unobserve(node);
    });
    observedResizeNodesRef.current.clear();
    observedResizeHeightsRef.current = new WeakMap<HTMLElement, number>();
}
