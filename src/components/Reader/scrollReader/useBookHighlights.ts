import { useState, useEffect } from 'react';
import type { MutableRefObject } from 'react';
import { db, type Highlight } from '../../../services/storageService';

interface UseBookHighlightsOptions {
    bookId: string;
    highlightDirtyChaptersRef: MutableRefObject<Set<number>>;
    lastReportedProgressRef: MutableRefObject<{ spineIndex: number; progress: number } | null>;
    pendingProgressSnapshotRef: MutableRefObject<{ spineIndex: number; progress: number; scrollTop: number } | null>;
}

export function useBookHighlights({
    bookId,
    highlightDirtyChaptersRef,
    lastReportedProgressRef,
    pendingProgressSnapshotRef,
}: UseBookHighlightsOptions) {
    const [highlights, setHighlights] = useState<Highlight[]>([]);

    const handleHighlightCreated = (highlight: Highlight) => {
        setHighlights((prev) =>
            prev.some((item) => item.id === highlight.id) ? prev : [...prev, highlight]
        );
    };

    useEffect(() => {
        let disposed = false;
        highlightDirtyChaptersRef.current.clear();
        lastReportedProgressRef.current = null;
        pendingProgressSnapshotRef.current = null;
        setHighlights([]);

        db.highlights.where('bookId').equals(bookId).toArray()
            .then((loaded) => {
                if (disposed) return;
                setHighlights(loaded);
            })
            .catch((error) => {
                if (!disposed) {
                    console.warn('[ScrollReader] Highlight preload failed:', error);
                }
            });

        return () => {
            disposed = true;
        };
    }, [bookId]);

    return { highlights, handleHighlightCreated };
}
