import type { MutableRefObject } from 'react';

interface PrepareTocJumpRuntimeOptions {
    searchText?: string;
    cancelIdlePrefetch: () => void;
    stop: () => void;
    isUserScrollingRef: MutableRefObject<boolean>;
    scrollIdleTimerRef: MutableRefObject<number | null>;
    pendingSearchTextRef: MutableRefObject<string | null>;
    initialScrollDone: MutableRefObject<boolean>;
    progressTimerRef: MutableRefObject<number | null>;
}

export function prepareTocJumpRuntime({
    searchText,
    cancelIdlePrefetch,
    stop,
    isUserScrollingRef,
    scrollIdleTimerRef,
    pendingSearchTextRef,
    initialScrollDone,
    progressTimerRef,
}: PrepareTocJumpRuntimeOptions): void {
    cancelIdlePrefetch();
    isUserScrollingRef.current = false;
    if (scrollIdleTimerRef.current !== null) {
        window.clearTimeout(scrollIdleTimerRef.current);
        scrollIdleTimerRef.current = null;
    }
    pendingSearchTextRef.current = searchText || null;
    initialScrollDone.current = true;
    stop();
    if (progressTimerRef.current) {
        window.clearTimeout(progressTimerRef.current);
        progressTimerRef.current = null;
    }
}
