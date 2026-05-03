import type { MutableRefObject } from 'react';
import type { SpineItemInfo } from '@/engine/core/contentProvider';
import type { LoadedChapter } from './scrollReaderTypes';

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

interface CommitTocJumpTargetOptions {
    targetSpineIndex: number;
    spineItemsRef: MutableRefObject<SpineItemInfo[]>;
    lastKnownAnchorIndexRef: MutableRefObject<number>;
    setCurrentSpineIndex: (value: number) => void;
    onChapterChange?: (label: string, href: string) => void;
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

export function findMountedTocJumpChapter(
    chapters: LoadedChapter[],
    targetSpineIndex: number,
): LoadedChapter | undefined {
    return chapters.find(ch =>
        ch.spineIndex === targetSpineIndex && ch.status === 'mounted'
    );
}
