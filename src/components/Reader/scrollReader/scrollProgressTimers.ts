import type { MutableRefObject } from 'react';
import type { ScrollProgressSnapshot } from './useScrollProgressCommit';

interface ScheduleScrollProgressCommitOptions {
    progressTimerRef: MutableRefObject<number | null>;
    pendingProgressSnapshotRef: MutableRefObject<ScrollProgressSnapshot | null>;
    commitProgressSnapshot: (snapshot: ScrollProgressSnapshot | null) => void;
}

const SCROLL_PROGRESS_COMMIT_DELAY_MS = 200;

export function scheduleScrollProgressCommit(options: ScheduleScrollProgressCommitOptions): void {
    if (options.progressTimerRef.current) {
        window.clearTimeout(options.progressTimerRef.current);
    }
    options.progressTimerRef.current = window.setTimeout(() => {
        options.commitProgressSnapshot(options.pendingProgressSnapshotRef.current);
    }, SCROLL_PROGRESS_COMMIT_DELAY_MS);
}

export function clearScrollProgressCommitTimer(
    progressTimerRef: MutableRefObject<number | null>,
): void {
    if (progressTimerRef.current) {
        window.clearTimeout(progressTimerRef.current);
    }
}
