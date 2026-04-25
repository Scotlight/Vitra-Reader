import { useCallback, useEffect, useRef } from 'react';
import type { MutableRefObject, RefObject } from 'react';
import { db, type Highlight } from '@/services/storageService';
import { findTextInDOM, highlightRange } from '@/utils/textFinder';
import { cancelIdleTask, scheduleIdleTask, type IdleTaskHandle } from '@/utils/idleScheduler';

const HIGHLIGHT_IDLE_TIMEOUT_MS = 600;

interface HighlightCacheEntry {
    bookId: string;
    count: number;
    groupedBySpine: Map<number, Highlight[]>;
}

function resolveHighlightSpineIndex(cfiRange: string): number | null {
    if (cfiRange.startsWith('vitra:') || cfiRange.startsWith('bdise:')) {
        const parsed = parseInt(cfiRange.split(':')[1], 10);
        return Number.isFinite(parsed) ? parsed : null;
    }
    if (cfiRange.startsWith('epubcfi(')) {
        const match = cfiRange.match(/^epubcfi\(\/\d+\/(\d+)/);
        if (!match) return null;
        const chapterToken = parseInt(match[1], 10);
        if (!Number.isFinite(chapterToken)) return null;
        return Math.max(0, Math.floor(chapterToken / 2) - 1);
    }
    return null;
}

function groupHighlightsBySpine(highlights: Highlight[]): Map<number, Highlight[]> {
    const groupedBySpine = new Map<number, Highlight[]>();
    for (const highlight of highlights) {
        const spineIndex = resolveHighlightSpineIndex(highlight.cfiRange);
        if (spineIndex === null) continue;
        const existing = groupedBySpine.get(spineIndex);
        if (existing) {
            existing.push(highlight);
            continue;
        }
        groupedBySpine.set(spineIndex, [highlight]);
    }
    return groupedBySpine;
}

interface SelectionMenuState {
    visible: boolean;
    x: number;
    y: number;
    text: string;
    spineIndex: number;
}

interface UsePaginatedHighlightsOptions {
    bookId: string;
    viewportRef: RefObject<HTMLDivElement | null>;
    currentSpineIndexRef: MutableRefObject<number>;
    renderedHighlightsRef: MutableRefObject<Set<string>>;
    setSelectionMenu: React.Dispatch<React.SetStateAction<SelectionMenuState>>;
}

export function usePaginatedHighlights(options: UsePaginatedHighlightsOptions) {
    const {
        bookId,
        viewportRef,
        currentSpineIndexRef,
        renderedHighlightsRef,
        setSelectionMenu,
    } = options;

    const highlightIdleHandleRef = useRef<IdleTaskHandle | null>(null);
    const highlightCacheRef = useRef<HighlightCacheEntry | null>(null);

    const getHighlightsForSpine = useCallback(async (spineIndex: number): Promise<Highlight[]> => {
        const total = await db.highlights.where('bookId').equals(bookId).count();
        const cached = highlightCacheRef.current;

        if (cached && cached.bookId === bookId && cached.count === total) {
            return cached.groupedBySpine.get(spineIndex) ?? [];
        }

        if (total === 0) {
            highlightCacheRef.current = {
                bookId,
                count: 0,
                groupedBySpine: new Map<number, Highlight[]>(),
            };
            return [];
        }

        const highlights = await db.highlights.where('bookId').equals(bookId).toArray();
        const groupedBySpine = groupHighlightsBySpine(highlights);
        highlightCacheRef.current = {
            bookId,
            count: total,
            groupedBySpine,
        };
        return groupedBySpine.get(spineIndex) ?? [];
    }, [bookId]);

    const applyHighlights = useCallback((el: HTMLElement, spineIndex: number) => {
        void getHighlightsForSpine(spineIndex).then(matching => {
            for (const h of matching) {
                if (renderedHighlightsRef.current.has(h.id)) continue;
                const range = findTextInDOM(el, h.text);
                if (range) {
                    highlightRange(range, h.id, h.color);
                    renderedHighlightsRef.current.add(h.id);
                }
            }
        }).catch(err => console.warn('[PaginatedReader] Highlight load failed:', err));
    }, [getHighlightsForSpine, renderedHighlightsRef]);

    const scheduleHighlightInjection = useCallback((el: HTMLElement, spineIndex: number) => {
        if (highlightIdleHandleRef.current !== null) {
            cancelIdleTask(highlightIdleHandleRef.current);
            highlightIdleHandleRef.current = null;
        }
        highlightIdleHandleRef.current = scheduleIdleTask(() => {
            highlightIdleHandleRef.current = null;
            applyHighlights(el, spineIndex);
        }, { timeoutMs: HIGHLIGHT_IDLE_TIMEOUT_MS });
    }, [applyHighlights]);

    useEffect(() => {
        return () => {
            if (highlightIdleHandleRef.current !== null) {
                cancelIdleTask(highlightIdleHandleRef.current);
                highlightIdleHandleRef.current = null;
            }
        };
    }, []);

    useEffect(() => {
        highlightCacheRef.current = null;
    }, [bookId]);

    // ── Selection detection ──
    useEffect(() => {
        const viewport = viewportRef.current;
        if (!viewport) return;

        const handleMouseUp = () => {
            const sel = window.getSelection();
            const text = sel?.toString().trim();
            if (!text || !sel?.rangeCount) return;
            const range = sel.getRangeAt(0);
            const rect = range.getBoundingClientRect();
            setSelectionMenu({
                visible: true,
                x: rect.left + rect.width / 2,
                y: rect.top - 10,
                text,
                spineIndex: currentSpineIndexRef.current,
            });
        };

        const handleContextMenu = (e: MouseEvent) => {
            const sel = window.getSelection();
            if (!sel?.toString().trim()) return;
            e.preventDefault();
            handleMouseUp();
        };

        viewport.addEventListener('mouseup', handleMouseUp);
        viewport.addEventListener('contextmenu', handleContextMenu);
        return () => {
            viewport.removeEventListener('mouseup', handleMouseUp);
            viewport.removeEventListener('contextmenu', handleContextMenu);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return { applyHighlights, scheduleHighlightInjection };
}
