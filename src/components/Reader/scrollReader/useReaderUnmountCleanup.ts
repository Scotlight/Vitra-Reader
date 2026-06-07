import { useEffect } from 'react';
import type { MutableRefObject } from 'react';
import { cancelIdleTask } from '@/utils/idleScheduler';
import type { ScrollReaderRefs } from './useScrollReaderRefs';
import type { VirtualChapterRuntime } from './useVirtualChapterRuntime';

interface ReaderUnmountCleanupDeps {
    cancelIdlePrefetch: () => void;
    virtualChaptersRef: MutableRefObject<Map<string, VirtualChapterRuntime>>;
    cleanupVirtualChapterRuntime: (chapterId: string) => void;
}

export function useReaderUnmountCleanup(
    refs: ScrollReaderRefs,
    deps: ReaderUnmountCleanupDeps,
) {
    const { scrollIdleTimerRef, highlightIdleHandlesRef, virtualSyncRafRef } = refs;
    const { cancelIdlePrefetch, virtualChaptersRef, cleanupVirtualChapterRuntime } = deps;

    useEffect(() => {
        const highlightIdleHandles = highlightIdleHandlesRef.current;
        const virtualChapters = virtualChaptersRef.current;

        return () => {
            cancelIdlePrefetch();
            if (scrollIdleTimerRef.current !== null) {
                window.clearTimeout(scrollIdleTimerRef.current);
                scrollIdleTimerRef.current = null;
            }
            highlightIdleHandles.forEach((handle) => {
                cancelIdleTask(handle);
            });
            highlightIdleHandles.clear();
            Array.from(virtualChapters.keys()).forEach((chapterId) => {
                cleanupVirtualChapterRuntime(chapterId);
            });
            virtualChapters.clear();
            if (virtualSyncRafRef.current !== null) {
                cancelAnimationFrame(virtualSyncRafRef.current);
                virtualSyncRafRef.current = null;
            }
        };
    }, [
        cancelIdlePrefetch,
        cleanupVirtualChapterRuntime,
        highlightIdleHandlesRef,
        scrollIdleTimerRef,
        virtualChaptersRef,
        virtualSyncRafRef,
    ]);
}
