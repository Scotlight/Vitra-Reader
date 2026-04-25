import { useCallback } from 'react';
import type { MutableRefObject } from 'react';
import type { SpineItemInfo } from '../../../engine/core/contentProvider';
import { db } from '../../../services/storageService';
import { PROGRESS_REPORT_EPSILON } from './scrollReaderConstants';

export interface ScrollProgressSnapshot {
    spineIndex: number;
    progress: number;
    scrollTop: number;
}

interface UseScrollProgressCommitOptions {
    bookId: string;
    spineItems: SpineItemInfo[];
    lastReportedProgressRef: MutableRefObject<{ spineIndex: number; progress: number } | null>;
    onProgressChange?: (progress: number) => void;
}

export function useScrollProgressCommit({
    bookId,
    spineItems,
    lastReportedProgressRef,
    onProgressChange,
}: UseScrollProgressCommitOptions) {
    return useCallback((snapshot: ScrollProgressSnapshot | null) => {
        if (!snapshot || spineItems.length === 0) return;

        const previous = lastReportedProgressRef.current;
        const progressChanged = !previous
            || previous.spineIndex !== snapshot.spineIndex
            || Math.abs(previous.progress - snapshot.progress) >= PROGRESS_REPORT_EPSILON;

        if (!progressChanged) return;

        lastReportedProgressRef.current = {
            spineIndex: snapshot.spineIndex,
            progress: snapshot.progress,
        };
        onProgressChange?.(snapshot.progress);
        db.progress.put({
            bookId,
            location: `vitra:${snapshot.spineIndex}:${snapshot.scrollTop}`,
            percentage: snapshot.progress,
            currentChapter: spineItems[snapshot.spineIndex]?.href || '',
            updatedAt: Date.now(),
        }).catch(err => console.warn('[ScrollReader] Progress save failed:', err));
    }, [bookId, lastReportedProgressRef, onProgressChange, spineItems]);
}
