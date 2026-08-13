import { useCallback, useEffect, useRef } from 'react';
import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from 'react';
import type { SpineItemInfo } from '@/engine/core/contentProvider';
import type { PageBoundary } from '@/engine/types/pagination';
import { shouldSkipPaginatedBlankCandidate } from './paginatedBlankDetection';
import {
    formatRealisticFlipTransform,
    formatSlideStartTransform,
    PAGE_TURN_FADE_MS,
    PAGE_TURN_REALISTIC_MS,
    resolveRealisticFlipOrigin,
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
    const realisticTimerRef = useRef<number | null>(null);
    const realisticFrameRef = useRef<number | null>(null);

    useEffect(() => () => {
        if (slideFrameRef.current !== null) window.cancelAnimationFrame(slideFrameRef.current);
        if (fadeTimerRef.current !== null) window.clearTimeout(fadeTimerRef.current);
        if (fadeFrameRef.current !== null) window.cancelAnimationFrame(fadeFrameRef.current);
        if (realisticTimerRef.current !== null) window.clearTimeout(realisticTimerRef.current);
        if (realisticFrameRef.current !== null) window.cancelAnimationFrame(realisticFrameRef.current);
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

        if (animation === 'realistic') {
            // 仿真半翻提交（详见 PAGE_TURN_REALISTIC_MS 注释）：
            // 前进 = 旧页绕视口左缘掀到 -88° → 提交新页平铺（掀过背面的瞬间换页）；
            // 后退 = 先提交新页 → 预置 -88° → 盖回 0°。
            // -88° 封顶：越过 -90° 会露出内容镜像背面。
            if (realisticTimerRef.current !== null) window.clearTimeout(realisticTimerRef.current);
            if (realisticFrameRef.current !== null) window.cancelAnimationFrame(realisticFrameRef.current);
            container.style.opacity = '1';
            const width = viewport.clientWidth;

            if (delta > 0) {
                container.style.transformOrigin = resolveRealisticFlipOrigin(fromPage, width);
                container.style.transition = 'none';
                container.style.transform = formatRealisticFlipTransform(fromPage, width, 0);
                realisticFrameRef.current = window.requestAnimationFrame(() => {
                    realisticFrameRef.current = null;
                    container.style.transition = `transform ${PAGE_TURN_REALISTIC_MS}ms cubic-bezier(0.3, 0.9, 0.25, 1)`;
                    container.style.transform = formatRealisticFlipTransform(fromPage, width, -88);
                });
                realisticTimerRef.current = window.setTimeout(() => {
                    realisticTimerRef.current = null;
                    // 提交换页：React 渲染的 inline transform（纯 translateX）会覆盖掉旋转，
                    // 新页自然平铺，无需手动回正
                    container.style.transition = 'none';
                    container.style.transformOrigin = '';
                    setDisplayPage(page);
                }, PAGE_TURN_REALISTIC_MS);
                return;
            }

            // 后退：setDisplayPage 的提交发生在本轮任务的 React flush，首个 rAF 在
            // 提交后、绘制前执行——预置 -88° 不会闪一帧平铺新页
            setDisplayPage(page);
            realisticFrameRef.current = window.requestAnimationFrame(() => {
                realisticFrameRef.current = null;
                container.style.transformOrigin = resolveRealisticFlipOrigin(page, width);
                container.style.transition = 'none';
                container.style.transform = formatRealisticFlipTransform(page, width, -88);
                realisticFrameRef.current = window.requestAnimationFrame(() => {
                    realisticFrameRef.current = null;
                    container.style.transition = `transform ${PAGE_TURN_REALISTIC_MS}ms cubic-bezier(0.3, 0.9, 0.25, 1)`;
                    container.style.transform = formatRealisticFlipTransform(page, width, 0);
                });
            });
            realisticTimerRef.current = window.setTimeout(() => {
                realisticTimerRef.current = null;
                container.style.transition = '';
                container.style.transformOrigin = '';
            }, PAGE_TURN_REALISTIC_MS + 50);
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

        // 用 click 而不是 mouseup 做点击翻页：翻页命中时要 stopPropagation，
        // 否则冒泡到 ImmersiveReaderShell 的整区点击会同时切 chrome 显隐（移动端一点两动）。
        // 中央区域不拦，继续冒泡给 Shell 切 chrome——这就是"左右翻页 / 中央切 chrome"的划界。
        const handleClick = (event: MouseEvent) => {
            if (Math.abs(event.clientX - downX) > 5 || Math.abs(event.clientY - downY) > 5) return;
            if (window.getSelection()?.toString()) return;

            const rect = viewport.getBoundingClientRect();
            const x = event.clientX - rect.left;
            if (x < rect.width * 0.15) {
                event.stopPropagation();
                prevPage();
            } else if (x > rect.width * 0.85) {
                event.stopPropagation();
                nextPage();
            }
        };

        viewport.addEventListener('mousedown', handleMouseDown);
        viewport.addEventListener('click', handleClick);
        return () => {
            viewport.removeEventListener('mousedown', handleMouseDown);
            viewport.removeEventListener('click', handleClick);
        };
    }, [nextPage, prevPage, viewportRef]);

    return {
        isPageLikelyBlank,
        nextPage,
        prevPage,
    };
}
