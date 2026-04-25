import { useEffect } from 'react';
import type { MutableRefObject } from 'react';
import { cancelIdleTask } from '@/utils/idleScheduler';
import type { ScrollReaderRefs } from './useScrollReaderRefs';
import type { VirtualChapterRuntime } from './useVirtualChapterRuntime';

export function useReaderUnmountCleanup(
    refs: ScrollReaderRefs,
    deps: {
        cancelIdlePrefetch: () => void;
        virtualChaptersRef: MutableRefObject<Map<string, VirtualChapterRuntime>>;
        cleanupVirtualChapterRuntime: (chapterId: string) => void;
    },
) {
    const { scrollIdleTimerRef, highlightIdleHandlesRef, virtualSyncRafRef } = refs;
    const { cancelIdlePrefetch, virtualChaptersRef, cleanupVirtualChapterRuntime } = deps;

    useEffect(() => {
        return () => {
            cancelIdlePrefetch();
            if (scrollIdleTimerRef.current !== null) {
                window.clearTimeout(scrollIdleTimerRef.current);
                scrollIdleTimerRef.current = null;
            }
            highlightIdleHandlesRef.current.forEach((handle) => {
                cancelIdleTask(handle);
            });
            highlightIdleHandlesRef.current.clear();
            Array.from(virtualChaptersRef.current.keys()).forEach((chapterId) => {
                cleanupVirtualChapterRuntime(chapterId);
            });
            virtualChaptersRef.current.clear();
            if (virtualSyncRafRef.current !== null) {
                cancelAnimationFrame(virtualSyncRafRef.current);
                virtualSyncRafRef.current = null;
            }
        };
    }, [cancelIdlePrefetch, cleanupVirtualChapterRuntime, virtualChaptersRef]);
}
