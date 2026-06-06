import { useCallback, useEffect } from 'react';
import {
    getChapterResizeTargets,
    handleResizeObserverEntries,
    observeResizeNode as observeResizeTarget,
    resetResizeObserverTargets,
    unobserveResizeNode as unobserveResizeTarget,
} from './chapterResizeObserverTargets';
import type { ScrollReaderRefs } from './useScrollReaderRefs';

export function useChapterResizeObserver(refs: ScrollReaderRefs) {
    const {
        resizeObserverRef,
        observedResizeNodesRef,
        observedResizeHeightsRef,
        segmentResizeCallbackRef,
    } = refs;

    const observeResizeNode = useCallback((node: HTMLElement | null) => {
        observeResizeTarget({
            node,
            resizeObserver: resizeObserverRef.current,
            observedResizeNodesRef,
            observedResizeHeightsRef,
        });
    }, [observedResizeHeightsRef, observedResizeNodesRef, resizeObserverRef]);

    const unobserveResizeNode = useCallback((node: HTMLElement | null) => {
        unobserveResizeTarget({
            node,
            resizeObserver: resizeObserverRef.current,
            observedResizeNodesRef,
        });
    }, [observedResizeNodesRef, resizeObserverRef]);

    const observeChapterResizeNodes = useCallback((chapterEl: HTMLElement | null) => {
        if (!chapterEl) return;
        const segments = getChapterResizeTargets(chapterEl);
        if (segments.length > 0) {
            segments.forEach((segmentEl) => observeResizeNode(segmentEl));
            return;
        }
        observeResizeNode(chapterEl);
    }, [observeResizeNode]);

    const unobserveChapterResizeNodes = useCallback((chapterEl: HTMLElement | null) => {
        if (!chapterEl) return;
        const segments = getChapterResizeTargets(chapterEl);
        if (segments.length > 0) {
            segments.forEach((segmentEl) => unobserveResizeNode(segmentEl));
        }
        unobserveResizeNode(chapterEl);
    }, [unobserveResizeNode]);

    const resetResizeObservers = useCallback(() => {
        resetResizeObserverTargets({
            resizeObserver: resizeObserverRef.current,
            observedResizeNodesRef,
            observedResizeHeightsRef,
        });
    }, [observedResizeHeightsRef, observedResizeNodesRef, resizeObserverRef]);

    useEffect(() => {
        const observer = new ResizeObserver((entries) => {
            handleResizeObserverEntries({
                entries,
                observedResizeHeightsRef,
                segmentResizeCallbackRef,
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
    }, [
        observedResizeHeightsRef,
        resizeObserverRef,
        resetResizeObservers,
        segmentResizeCallbackRef,
    ]);

    return {
        observeResizeNode,
        unobserveResizeNode,
        observeChapterResizeNodes,
        unobserveChapterResizeNodes,
        resetResizeObservers,
    };
}
