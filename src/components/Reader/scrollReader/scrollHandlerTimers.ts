import type { MutableRefObject } from 'react';
import { SCROLL_IDLE_RESUME_MS } from './scrollReaderConstants';

interface ScheduleScrollIdleResumeOptions {
    isUserScrollingRef: MutableRefObject<boolean>;
    scrollIdleTimerRef: MutableRefObject<number | null>;
    scheduleIdlePrefetch: (task: () => void) => void;
    runPredictivePrefetch: () => void;
}

export function scheduleScrollIdleResume({
    isUserScrollingRef,
    scrollIdleTimerRef,
    scheduleIdlePrefetch,
    runPredictivePrefetch,
}: ScheduleScrollIdleResumeOptions): void {
    if (scrollIdleTimerRef.current !== null) {
        window.clearTimeout(scrollIdleTimerRef.current);
    }
    scrollIdleTimerRef.current = window.setTimeout(() => {
        isUserScrollingRef.current = false;
        scheduleIdlePrefetch(() => {
            runPredictivePrefetch();
        });
    }, SCROLL_IDLE_RESUME_MS);
}
