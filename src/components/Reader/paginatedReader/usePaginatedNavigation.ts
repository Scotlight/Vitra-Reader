import { useCallback, useEffect } from 'react';
import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from 'react';
import type { SpineItemInfo } from '@/engine/core/contentProvider';
import type { PageBoundary } from '@/engine';

interface UsePaginatedNavigationOptions {
    viewportRef: RefObject<HTMLDivElement | null>;
    columnRef: RefObject<HTMLDivElement | null>;
    pageBoundariesRef: MutableRefObject<readonly PageBoundary[]>;
    pageMapReadyRef: MutableRefObject<boolean>;
    currentPageRef: MutableRefObject<number>;
    totalPagesRef: MutableRefObject<number>;
    currentSpineIndexRef: MutableRefObject<number>;
    spineItemsRef: MutableRefObject<SpineItemInfo[]>;
    setCurrentPage: Dispatch<SetStateAction<number>>;
    setDisplayPage: Dispatch<SetStateAction<number>>;
    setCurrentSpineIndex: Dispatch<SetStateAction<number>>;
    hideSelectionMenu: () => void;
    loadChapter: (spineIndex: number, goToLastPage?: boolean, visited?: Set<number>) => Promise<void> | void;
}

export function usePaginatedNavigation(options: UsePaginatedNavigationOptions) {
    const {
        viewportRef,
        columnRef,
        pageBoundariesRef,
        pageMapReadyRef,
        currentPageRef,
        totalPagesRef,
        currentSpineIndexRef,
        spineItemsRef,
        setCurrentPage,
        setDisplayPage,
        setCurrentSpineIndex,
        hideSelectionMenu,
        loadChapter,
    } = options;

    const isPageLikelyBlank = useCallback((pageIndex: number): boolean => {
        const container = columnRef.current;
        const viewport = viewportRef.current;
        if (!container || !viewport) return false;

        const pageWidth = viewport.clientWidth;
        if (pageWidth <= 0) return false;
        const logicalPages = pageBoundariesRef.current.length;
        if (pageMapReadyRef.current && logicalPages > 0 && pageIndex >= logicalPages + 1) return true;

        const pageLeft = pageIndex * pageWidth;
        const pageRight = pageLeft + pageWidth;
        const containerRect = container.getBoundingClientRect();
        const candidates = container.querySelectorAll(
            'p, h1, h2, h3, h4, h5, h6, li, blockquote, pre, table, figure, img, svg, video, canvas'
        );

        for (const node of Array.from(candidates)) {
            const element = node as HTMLElement;
            const style = window.getComputedStyle(element);
            if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity || 1) === 0) {
                continue;
            }

            const rect = element.getBoundingClientRect();
            if (rect.width < 2 || rect.height < 2) continue;

            const left = rect.left - containerRect.left + container.scrollLeft;
            const right = rect.right - containerRect.left + container.scrollLeft;
            if (right > pageLeft + 6 && left < pageRight - 6) {
                return false;
            }
        }

        return true;
    }, [columnRef, pageBoundariesRef, pageMapReadyRef, viewportRef]);

    const goToPage = useCallback((page: number) => {
        setCurrentPage(page);
        currentPageRef.current = page;
        setDisplayPage(page);
        hideSelectionMenu();
    }, [currentPageRef, hideSelectionMenu, setCurrentPage, setDisplayPage]);

    const nextPage = useCallback(() => {
        if (currentPageRef.current < totalPagesRef.current - 1) {
            let next = currentPageRef.current + 1;
            while (next < totalPagesRef.current && isPageLikelyBlank(next)) {
                next += 1;
            }
            if (next < totalPagesRef.current) {
                goToPage(next);
                return;
            }
        }

        const nextIdx = currentSpineIndexRef.current + 1;
        if (nextIdx < spineItemsRef.current.length) {
            setCurrentSpineIndex(nextIdx);
            setCurrentPage(0);
            currentPageRef.current = 0;
            void loadChapter(nextIdx, false);
        }
    }, [currentPageRef, currentSpineIndexRef, goToPage, isPageLikelyBlank, loadChapter, setCurrentPage, setCurrentSpineIndex, spineItemsRef, totalPagesRef]);

    const prevPage = useCallback(() => {
        if (currentPageRef.current > 0) {
            let prev = currentPageRef.current - 1;
            while (prev >= 0 && isPageLikelyBlank(prev)) {
                prev -= 1;
            }
            if (prev >= 0) {
                goToPage(prev);
                return;
            }
        }

        const prevIdx = currentSpineIndexRef.current - 1;
        if (prevIdx >= 0) {
            setCurrentSpineIndex(prevIdx);
            void loadChapter(prevIdx, true);
        }
    }, [currentPageRef, currentSpineIndexRef, goToPage, isPageLikelyBlank, loadChapter, setCurrentSpineIndex]);

    useEffect(() => {
        const handler = (event: KeyboardEvent) => {
            if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
                event.preventDefault();
                prevPage();
            } else if (event.key === 'ArrowRight' || event.key === 'PageDown') {
                event.preventDefault();
                nextPage();
            }
        };

        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [nextPage, prevPage]);

    useEffect(() => {
        const viewport = viewportRef.current;
        if (!viewport) return;

        let downX = 0;
        let downY = 0;

        const handleMouseDown = (event: MouseEvent) => {
            downX = event.clientX;
            downY = event.clientY;
        };

        const handleMouseUp = (event: MouseEvent) => {
            if (Math.abs(event.clientX - downX) > 5 || Math.abs(event.clientY - downY) > 5) return;
            if (window.getSelection()?.toString()) return;

            const rect = viewport.getBoundingClientRect();
            const x = event.clientX - rect.left;
            if (x < rect.width * 0.15) {
                prevPage();
            } else if (x > rect.width * 0.85) {
                nextPage();
            }
        };

        viewport.addEventListener('mousedown', handleMouseDown);
        viewport.addEventListener('mouseup', handleMouseUp);
        return () => {
            viewport.removeEventListener('mousedown', handleMouseDown);
            viewport.removeEventListener('mouseup', handleMouseUp);
        };
    }, [nextPage, prevPage, viewportRef]);

    return {
        isPageLikelyBlank,
    };
}
