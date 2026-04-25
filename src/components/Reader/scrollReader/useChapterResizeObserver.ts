import { useCallback, useEffect } from 'react';
import type { ScrollReaderRefs } from './useScrollReaderRefs';

export function useChapterResizeObserver(refs: ScrollReaderRefs) {
    const {
        resizeObserverRef,
        observedResizeNodesRef,
        observedResizeHeightsRef,
    } = refs;

    useEffect(() => {
        const observer = new ResizeObserver((entries) => {
            entries.forEach((entry) => {
                const target = entry.target as HTMLElement;
                const nextHeight = Math.max(1, entry.contentRect.height);
                observedResizeHeightsRef.current.set(target, nextHeight);
            });
        });

        resizeObserverRef.current = observer;
        return () => {
            resetResizeObservers();
            observer.disconnect();
            if (resizeObserverRef.current === observer) {
                resizeObserverRef.current = null;
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const observeResizeNode = useCallback((node: HTMLElement | null) => {
        if (!node) return;
        if (observedResizeNodesRef.current.has(node)) return;
        observedResizeNodesRef.current.add(node);
        observedResizeHeightsRef.current.set(node, Math.max(1, node.getBoundingClientRect().height));
        resizeObserverRef.current?.observe(node);
    }, []);

    const unobserveResizeNode = useCallback((node: HTMLElement | null) => {
        if (!node) return;
        if (!observedResizeNodesRef.current.has(node)) return;
        observedResizeNodesRef.current.delete(node);
        resizeObserverRef.current?.unobserve(node);
    }, []);

    const observeChapterResizeNodes = useCallback((chapterEl: HTMLElement | null) => {
        if (!chapterEl) return;
        const segments = Array.from(
            chapterEl.querySelectorAll('[data-shadow-segment-index]')
        ) as HTMLElement[];
        if (segments.length > 0) {
            segments.forEach((segmentEl) => observeResizeNode(segmentEl));
            return;
        }
        observeResizeNode(chapterEl);
    }, [observeResizeNode]);

    const unobserveChapterResizeNodes = useCallback((chapterEl: HTMLElement | null) => {
        if (!chapterEl) return;
        const segments = Array.from(
            chapterEl.querySelectorAll('[data-shadow-segment-index]')
        ) as HTMLElement[];
        if (segments.length > 0) {
            segments.forEach((segmentEl) => unobserveResizeNode(segmentEl));
        }
        unobserveResizeNode(chapterEl);
    }, [unobserveResizeNode]);

    const resetResizeObservers = useCallback(() => {
        observedResizeNodesRef.current.forEach((node) => {
            resizeObserverRef.current?.unobserve(node);
        });
        observedResizeNodesRef.current.clear();
        observedResizeHeightsRef.current = new WeakMap<HTMLElement, number>();
    }, []);

    return {
        observeResizeNode,
        unobserveResizeNode,
        observeChapterResizeNodes,
        unobserveChapterResizeNodes,
        resetResizeObservers,
    };
}
