import { useCallback, useEffect, useRef } from 'react';
import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from 'react';
import type { SpineItemInfo } from '@/engine/core/contentProvider';
import type { PageBoundary } from '@/engine/types/pagination';
import { shouldSkipPaginatedBlankCandidate } from './paginatedBlankDetection';
import {
    formatSlideStartTransform,
    PAGE_TURN_FADE_MS,
    type PaginatedPageTurnAnimation,
} from './paginatedPageTurnAnimation';

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
    setCurrentSpineIndex: (spineIndex: number) => void;
    hideSelectionMenu: () => void;
    loadChapter: (spineIndex: number, goToLastPage?: boolean, visited?: Set<number>) => Promise<void> | void;
    /** 页内翻页动画类型，默认瞬时（none） */
    pageTurnAnimation?: PaginatedPageTurnAnimation;
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
        pageTurnAnimation = 'none',
    } = options;

    // 翻页动画只认容器当前真实位置，避免快速连翻时起始帧错页。
    // 用 ref 存动画类型，避免每次切设置都重建 goToPage/nextPage/prevPage 链。
    const animationRef = useRef<PaginatedPageTurnAnimation>(pageTurnAnimation);
    animationRef.current = pageTurnAnimation;
    const slideFrameRef = useRef<number | null>(null);
    const fadeTimerRef = useRef<number | null>(null);
    const fadeFrameRef = useRef<number | null>(null);

    useEffect(() => () => {
        if (slideFrameRef.current !== null) window.cancelAnimationFrame(slideFrameRef.current);
        if (fadeTimerRef.current !== null) window.clearTimeout(fadeTimerRef.current);
        if (fadeFrameRef.current !== null) window.cancelAnimationFrame(fadeFrameRef.current);
    }, []);

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
            if (shouldSkipPaginatedBlankCandidate(element, style)) {
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
        const container = columnRef.current;
        const viewport = viewportRef.current;
        const animation = animationRef.current;
        const fromPage = currentPageRef.current;
        const delta = page - fromPage;

        setCurrentPage(page);
        currentPageRef.current = page;
        hideSelectionMenu();

        // none / 无方向 / 缺容器 → 瞬时跳变（原行为）。
        // 注意复位 opacity：若上一次是 fade 淡出中途被打断，容器可能停在半透明。
        if (animation === 'none' || delta === 0 || !container || !viewport) {
            if (container) {
                container.style.opacity = '1';
            }
            setDisplayPage(page);
            return;
        }

        if (animation === 'slide') {
            // slide 起手也复位 opacity，避免上一次 fade 淡出残留半透明。
            container.style.opacity = '1';
            // 起始帧钉在旧页（fromPage），禁 transition；下一帧恢复 '' 让 CSS 把
            // translateX 带到目标页——方向感来自 from→to 的位移差，前进新页自右进入、
            // 后退对称。与 usePaginatedPageLayout 重排时 "transition:'none' → rAF 恢复" 同一手法。
            const width = viewport.clientWidth;
            if (slideFrameRef.current !== null) window.cancelAnimationFrame(slideFrameRef.current);
            container.style.transition = 'none';
            container.style.transform = formatSlideStartTransform(fromPage, width);
            slideFrameRef.current = window.requestAnimationFrame(() => {
                slideFrameRef.current = null;
                container.style.transition = '';
                setDisplayPage(page);
            });
            return;
        }

        // fade：先淡出（displayPage 不动，视图停在旧页），到点后换页再淡入
        if (fadeTimerRef.current !== null) window.clearTimeout(fadeTimerRef.current);
        if (fadeFrameRef.current !== null) window.cancelAnimationFrame(fadeFrameRef.current);
        container.style.transition = `opacity ${PAGE_TURN_FADE_MS}ms ease-out`;
        container.style.opacity = '0';
        fadeTimerRef.current = window.setTimeout(() => {
            fadeTimerRef.current = null;
            container.style.transition = 'none';
            setDisplayPage(page);
            fadeFrameRef.current = window.requestAnimationFrame(() => {
                fadeFrameRef.current = null;
                container.style.transition = `opacity ${PAGE_TURN_FADE_MS}ms ease-out`;
                container.style.opacity = '1';
            });
        }, PAGE_TURN_FADE_MS);
    }, [columnRef, viewportRef, currentPageRef, hideSelectionMenu, setCurrentPage, setDisplayPage]);

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
