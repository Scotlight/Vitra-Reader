import type { MutableRefObject } from 'react';
import type { SpineItemInfo } from '@/engine/core/contentProvider';

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

interface CommitTocJumpTargetOptions {
    targetSpineIndex: number;
    spineItemsRef: MutableRefObject<SpineItemInfo[]>;
    lastKnownAnchorIndexRef: MutableRefObject<number>;
    setCurrentSpineIndex: (value: number) => void;
    onChapterChange?: (label: string, href: string) => void;
}

export function commitTocJumpTarget({
    targetSpineIndex,
    spineItemsRef,
    lastKnownAnchorIndexRef,
    setCurrentSpineIndex,
    onChapterChange,
}: CommitTocJumpTargetOptions): void {
    setCurrentSpineIndex(targetSpineIndex);
    lastKnownAnchorIndexRef.current = targetSpineIndex;
    const spineItem = spineItemsRef.current[targetSpineIndex];
    if (onChapterChange && spineItem) {
        onChapterChange(spineItem.id, spineItem.href);
    }
}
