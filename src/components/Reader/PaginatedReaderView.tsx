import {
    useRef, useEffect, useState, useCallback,
    forwardRef, useImperativeHandle,
} from 'react';
import type { ContentProvider, SpineItemInfo } from '../../engine/core/contentProvider';
import { releaseMediaResources } from '../../utils/mediaResourceCleanup';
import { useSelectionMenu } from '../../hooks/useSelectionMenu';
import { ShadowRenderer, ReaderStyleConfig } from './ShadowRenderer';
import { db } from '../../services/storageService';
import { findTextInDOM, highlightRange } from '../../utils/textFinder';
import { preprocessChapterContent } from '../../engine/render/chapterPreprocessService';
import { startMeasure, type VitraMeasureHandle, type PageBoundary } from '../../engine';
import { cancelIdleTask, scheduleIdleTask, type IdleTaskHandle } from '../../utils/idleScheduler';
import styles from './PaginatedReaderView.module.css';

const HIGHLIGHT_IDLE_TIMEOUT_MS = 600;

interface PaginatedReaderViewProps {
    provider: ContentProvider;
    bookId: string;
    initialSpineIndex?: number;
    initialPage?: number;
    pageTurnMode: 'paginated-single' | 'paginated-double';
    readerStyles: ReaderStyleConfig;
    onProgressChange?: (progress: number) => void;
    onChapterChange?: (label: string, href: string) => void;
    onSelectionSearch?: (keyword: string) => void;
}

export interface PaginatedReaderHandle {
    jumpToSpine: (spineIndex: number, searchText?: string) => Promise<void>;
}

export const PaginatedReaderView = forwardRef<PaginatedReaderHandle, PaginatedReaderViewProps>(({
    provider,
    bookId,
    initialSpineIndex = 0,
    initialPage = 0,
    pageTurnMode,
    readerStyles,
    onProgressChange,
    onChapterChange,
    onSelectionSearch,
}, ref) => {
    const viewportRef = useRef<HTMLDivElement>(null);
    const columnRef = useRef<HTMLDivElement>(null);
    const pendingLastPageRef = useRef(false);
    const pendingSearchTextRef = useRef<string | null>(null);
    const isInitialLoadRef = useRef(true); // 初始加载标记
    const pageBoundariesRef = useRef<readonly PageBoundary[]>([]);
    const pageMapReadyRef = useRef(false);
    const paginationMeasureSeqRef = useRef(0);
    const paginationMeasureHandleRef = useRef<VitraMeasureHandle | null>(null);
    const paginationMeasureHostRef = useRef<HTMLDivElement>(null);
    const highlightIdleHandleRef = useRef<IdleTaskHandle | null>(null);

    const [spineItems, setSpineItems] = useState<SpineItemInfo[]>([]);
    const [currentSpineIndex, setCurrentSpineIndex] = useState(initialSpineIndex);
    const [currentPage, setCurrentPage] = useState(initialPage);
    const [totalPages, setTotalPages] = useState(1);
    const [isLoading, setIsLoading] = useState(true);
    const [chapterFading, setChapterFading] = useState(false);
    const [displayPage, setDisplayPage] = useState(0); // 用于显示的页码（过渡时保持旧值）

    // Shadow render state
    const [shadowData, setShadowData] = useState<{
        htmlContent: string; htmlFragments: string[]; externalStyles: string[]; chapterId: string;
    } | null>(null);
    const [chapterNode, setChapterNode] = useState<HTMLElement | null>(null);

    // Selection menu
    const getHighlightContainer = useCallback((_spineIndex: number): HTMLElement | null => {
        return columnRef.current;
    }, []);
    const {
        setSelectionMenu,
        renderedHighlightsRef,
        renderSelectionUI,
    } = useSelectionMenu({ bookId, onSelectionSearch, getHighlightContainer });
    const shadowResourceExists = useCallback((url: string) => {
        return provider.isAssetUrlAvailable?.(url) ?? true;
    }, [provider]);

    const spineItemsRef = useRef<SpineItemInfo[]>([]);
    const currentSpineIndexRef = useRef(currentSpineIndex);
    const currentPageRef = useRef(currentPage);
    const totalPagesRef = useRef(totalPages);
    currentSpineIndexRef.current = currentSpineIndex;
    currentPageRef.current = currentPage;
    totalPagesRef.current = totalPages;

    const abortPaginationMeasure = useCallback(() => {
        if (paginationMeasureHandleRef.current) {
            paginationMeasureHandleRef.current.abort()
            paginationMeasureHandleRef.current = null
        }
    }, [])

    const measureBoundariesInShadow = useCallback(async (
        sourceNode: HTMLElement,
        viewportHeight: number,
    ): Promise<readonly PageBoundary[]> => {
        const host = paginationMeasureHostRef.current
        if (!host || viewportHeight <= 0) return []

        abortPaginationMeasure()
        const measureSeq = ++paginationMeasureSeqRef.current

        const handle = startMeasure({
            sourceNode,
            viewportHeight,
            host,
            onProgress: (progress) => {
                if (measureSeq !== paginationMeasureSeqRef.current) return
                pageBoundariesRef.current = progress.boundaries
                pageMapReadyRef.current = progress.done
            },
        })
        paginationMeasureHandleRef.current = handle

        const boundaries = await handle.result
        if (measureSeq !== paginationMeasureSeqRef.current) return []
        paginationMeasureHandleRef.current = null
        pageMapReadyRef.current = true
        return boundaries
    }, [abortPaginationMeasure])

    useEffect(() => {
        return () => {
            abortPaginationMeasure()
        }
    }, [abortPaginationMeasure])

    // ── Init spine ──
    useEffect(() => {
        const items = provider.getSpineItems();
        spineItemsRef.current = items;
        setSpineItems(items);
    }, [provider]);

    // ── Load chapter into shadow queue ──
    const loadChapter = useCallback(async (
        spineIndex: number,
        goToLastPage = false,
        visited = new Set<number>(),
    ) => {
        if (spineIndex < 0 || spineIndex >= spineItemsRef.current.length) return;
        if (visited.has(spineIndex)) return;
        visited.add(spineIndex);
        abortPaginationMeasure();
        pendingLastPageRef.current = goToLastPage;

        // 非初始加载：先淡出，等淡出完成后再加载
        if (!isInitialLoadRef.current) {
            setChapterFading(true);
            // 等待淡出动画完成（150ms）
            await new Promise(resolve => setTimeout(resolve, 160));
        }

        setIsLoading(true);
        pageBoundariesRef.current = [];
        pageMapReadyRef.current = false;
        renderedHighlightsRef.current.clear();
        try {
            const rawHtml = await provider.extractChapterHtml(spineIndex);

            let chapterStyles: string[] = [];
            try { chapterStyles = await provider.extractChapterStyles(spineIndex); } catch { /* optional */ }

            const preprocessed = await preprocessChapterContent({
                chapterId: `pch-${spineIndex}`,
                spineIndex,
                chapterHref: spineItemsRef.current[spineIndex]?.href,
                htmlContent: rawHtml,
                externalStyles: chapterStyles,
            });

            const html = preprocessed.htmlContent;

            const plainText = html
                .replace(/<script[\s\S]*?<\/script>/gi, '')
                .replace(/<style[\s\S]*?<\/style>/gi, '')
                .replace(/<[^>]+>/g, ' ')
                .replace(/&nbsp;/gi, ' ')
                .trim();
            const hasMedia = /<(img|svg|video|audio|canvas|table|math|object|embed)\b/i.test(html);
            const hasRenderableContent = plainText.length > 0 || hasMedia;

            if (!hasRenderableContent) {
                const fallbackIndex = goToLastPage ? spineIndex - 1 : spineIndex + 1;
                if (fallbackIndex >= 0 && fallbackIndex < spineItemsRef.current.length) {
                    setCurrentSpineIndex(fallbackIndex);
                    currentSpineIndexRef.current = fallbackIndex;
                    await loadChapter(fallbackIndex, goToLastPage, visited);
                    return;
                }
            }

            setShadowData({
                htmlContent: html,
                htmlFragments: preprocessed.htmlFragments,
                externalStyles: preprocessed.externalStyles,
                chapterId: `pch-${spineIndex}`,
            });
        } catch (err) {
            console.error(`[PaginatedReader] Failed to load chapter ${spineIndex}:`, err);
            pageBoundariesRef.current = [];
            pageMapReadyRef.current = false;
            setIsLoading(false);
            setChapterFading(false);
        }
    }, [provider, abortPaginationMeasure]);

    // ── Load initial chapter ──
    useEffect(() => {
        if (spineItems.length === 0) return;
        const safeIndex = Math.min(initialSpineIndex, spineItems.length - 1);
        setCurrentSpineIndex(safeIndex);
        loadChapter(safeIndex);
    }, [spineItems]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Shadow ready → mount + paginate ──
    const handleShadowReady = useCallback((node: HTMLElement, _height: number) => {
        const viewport = viewportRef.current;
        const viewportHeight = Math.max(1, Math.floor(viewport?.clientHeight || 0));
        pageBoundariesRef.current = [];
        pageMapReadyRef.current = false;
        setChapterNode(node);
        setShadowData(null);
        setIsLoading(false);

        if (viewportHeight <= 0) return;
        void measureBoundariesInShadow(node, viewportHeight).catch((error) => {
            console.warn('[PaginatedReader] Background block measurement failed:', error);
        });
    }, [measureBoundariesInShadow]);

    // ── Highlights ──
    const applyHighlights = useCallback((el: HTMLElement, spineIndex: number) => {
        db.highlights.where('bookId').equals(bookId).toArray().then(highlights => {
            const matching = highlights.filter(h => {
                if (h.cfiRange.startsWith('vitra:') || h.cfiRange.startsWith('bdise:')) {
                    return parseInt(h.cfiRange.split(':')[1], 10) === spineIndex;
                }
                if (h.cfiRange.startsWith('epubcfi(')) {
                    const m = h.cfiRange.match(/^epubcfi\(\/\d+\/(\d+)/);
                    return m ? Math.max(0, Math.floor(parseInt(m[1], 10) / 2) - 1) === spineIndex : false;
                }
                return false;
            });
            for (const h of matching) {
                if (renderedHighlightsRef.current.has(h.id)) continue;
                const range = findTextInDOM(el, h.text);
                if (range) {
                    highlightRange(range, h.id, h.color);
                    renderedHighlightsRef.current.add(h.id);
                }
            }
        }).catch(err => console.warn('[PaginatedReader] Highlight load failed:', err));
    }, [bookId]);

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

    // ── Mount chapter node + calculate pagination ──
    useEffect(() => {
        const container = columnRef.current;
        const viewport = viewportRef.current;
        if (!container || !viewport || !chapterNode) return;

        const h = viewport.clientHeight;
        const w = viewport.clientWidth;
        container.style.height = `${h}px`;

        // 替换内容前：禁用过渡，重置位置到 0
        container.style.transition = 'none';
        container.style.transform = 'translateX(0)';

        // 替换内容
        releaseMediaResources(container);
        container.appendChild(chapterNode);

        // 强制重排，确保上面的样式生效
        void container.offsetHeight;

        // Calculate pagination after DOM settles
        requestAnimationFrame(() => {
            if (w <= 0) return;
            const boundaries = pageBoundariesRef.current;
            const rawPages = container.scrollWidth / w;
            const pages = Math.max(1, Math.ceil(rawPages - 0.001));
            const logicalPages = Math.max(1, boundaries.length || pages);
            if (Math.abs(logicalPages - pages) >= 3) {
                console.warn(
                    `[PaginatedReader] Visual pages (${pages}) diverge from logical map (${logicalPages})`,
                );
            }
            setTotalPages(pages);
            totalPagesRef.current = pages;

            // 如果需要跳转到最后一页
            let targetPage = 0;
            let shouldJumpToLastPage = false;
            if (pendingLastPageRef.current) {
                targetPage = pages - 1;
                shouldJumpToLastPage = true;
                pendingLastPageRef.current = false;
            }

            // 如果有 searchText，定位到对应页
            const searchText = pendingSearchTextRef.current;
            if (searchText && container) {
                pendingSearchTextRef.current = null;
                const range = findTextInDOM(container, searchText);
                if (range) {
                    const rect = range.getBoundingClientRect();
                    const containerRect = container.getBoundingClientRect();
                    targetPage = Math.floor((rect.left - containerRect.left + container.scrollLeft) / w);
                    targetPage = Math.max(0, Math.min(targetPage, pages - 1));
                }
            }

            if (shouldJumpToLastPage) {
                while (targetPage > 0 && isPageLikelyBlank(targetPage)) {
                    targetPage -= 1;
                }
            }

            setCurrentPage(targetPage);
            currentPageRef.current = targetPage;
            setDisplayPage(targetPage);

            // 设置正确的位置（仍然无过渡）
            container.style.transform = `translateX(${-targetPage * w}px)`;

            // 下一帧：恢复过渡，触发淡入
            requestAnimationFrame(() => {
                container.style.transition = '';
                setChapterFading(false);
                isInitialLoadRef.current = false;
            });

            scheduleHighlightInjection(chapterNode, currentSpineIndexRef.current);
        });
    }, [chapterNode, scheduleHighlightInjection]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Recalculate on resize ──
    useEffect(() => {
        const viewport = viewportRef.current;
        const container = columnRef.current;
        if (!viewport || !container || !chapterNode) return;

        let resizeTimer: number | null = null;
        let disposed = false;

        const recalc = () => {
            const oldWidth = Math.max(1, viewport.clientWidth);
            const fallbackAnchorX = currentPageRef.current * oldWidth + oldWidth * 0.35;

            const viewportRect = viewport.getBoundingClientRect();
            const probeX = viewportRect.left + viewportRect.width * 0.5;
            const probeY = viewportRect.top + Math.min(viewportRect.height * 0.32, 220);
            const probeElement = document.elementFromPoint(probeX, probeY) as HTMLElement | null;
            const containerRect = container.getBoundingClientRect();

            let anchorX = fallbackAnchorX;
            if (probeElement && container.contains(probeElement)) {
                const probeRect = probeElement.getBoundingClientRect();
                const probeOffsetX = probeRect.left - containerRect.left + container.scrollLeft;
                if (Number.isFinite(probeOffsetX) && probeOffsetX >= 0) {
                    anchorX = probeOffsetX;
                }
            }

            // 防抖
            if (resizeTimer) window.clearTimeout(resizeTimer);
            resizeTimer = window.setTimeout(() => {
                const w = viewport.clientWidth;
                const h = viewport.clientHeight;
                if (disposed || w <= 0 || h <= 0) return;

                container.style.height = `${h}px`;
                const pages = Math.max(1, Math.ceil(container.scrollWidth / w));
                const anchorBasedPage = Math.floor(anchorX / w);
                const nextPage = Math.max(0, Math.min(anchorBasedPage, pages - 1));

                setTotalPages(pages);
                totalPagesRef.current = pages;

                setCurrentPage(nextPage);
                currentPageRef.current = nextPage;
                setDisplayPage(nextPage);

                container.style.transition = 'none';
                container.style.transform = `translateX(${-nextPage * w}px)`;
                requestAnimationFrame(() => {
                    container.style.transition = '';
                });

                void measureBoundariesInShadow(chapterNode, h).catch((error) => {
                    if (disposed) return;
                    console.warn('[PaginatedReader] Resize pagination measure failed:', error);
                });
            }, 100);
        };

        const ro = new ResizeObserver(recalc);
        ro.observe(viewport);
        return () => {
            disposed = true;
            ro.disconnect();
            if (resizeTimer) window.clearTimeout(resizeTimer);
            abortPaginationMeasure();
        };
    }, [chapterNode, abortPaginationMeasure, measureBoundariesInShadow]);

    // ── Reload chapter when readerStyles change (ShadowRenderer re-render) ──
    const stylesKeyRef = useRef('');
    useEffect(() => {
        const key = JSON.stringify(readerStyles);
        if (stylesKeyRef.current === '' || stylesKeyRef.current === key) {
            stylesKeyRef.current = key;
            return;
        }
        stylesKeyRef.current = key;
        // Reload current chapter with new styles
        renderedHighlightsRef.current.clear();
        loadChapter(currentSpineIndexRef.current);
    }, [readerStyles, loadChapter]);

    // ── Column width based on mode ──
    const getColumnWidth = useCallback(() => {
        const viewport = viewportRef.current;
        if (!viewport) return 600;
        return viewport.clientWidth;
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
    }, []);

    // ── Page turning ──
    const goToPage = useCallback((page: number) => {
        setCurrentPage(page);
        currentPageRef.current = page;
        setDisplayPage(page); // 同步显示页码
        setSelectionMenu(prev => ({ ...prev, visible: false }));
    }, []);

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

            const nextIdx = currentSpineIndexRef.current + 1;
            if (nextIdx < spineItemsRef.current.length) {
                setCurrentSpineIndex(nextIdx);
                setCurrentPage(0);
                currentPageRef.current = 0;
                loadChapter(nextIdx, false);
            }
        } else {
            // Next chapter
            const nextIdx = currentSpineIndexRef.current + 1;
            if (nextIdx < spineItemsRef.current.length) {
                setCurrentSpineIndex(nextIdx);
                setCurrentPage(0);
                currentPageRef.current = 0;
                loadChapter(nextIdx, false); // 去第一页
            }
        }
    }, [goToPage, loadChapter, isPageLikelyBlank]);

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

            const prevIdx = currentSpineIndexRef.current - 1;
            if (prevIdx >= 0) {
                setCurrentSpineIndex(prevIdx);
                loadChapter(prevIdx, true);
            }
        } else {
            // Previous chapter, go to last page
            const prevIdx = currentSpineIndexRef.current - 1;
            if (prevIdx >= 0) {
                setCurrentSpineIndex(prevIdx);
                loadChapter(prevIdx, true); // 去最后一页
            }
        }
    }, [goToPage, loadChapter, isPageLikelyBlank]);

    // ── Report chapter change ──
    useEffect(() => {
        if (spineItems.length === 0) return;
        const item = spineItems[currentSpineIndex];
        if (item) onChapterChange?.(item.id, item.href);
    }, [currentSpineIndex, spineItems, onChapterChange]);

    // ── Report progress + persist ──
    useEffect(() => {
        if (spineItems.length === 0 || isLoading) return;
        const chapterProgress = totalPages > 1 ? currentPage / (totalPages - 1) : 0;
        const progress = (currentSpineIndex + Math.min(1, chapterProgress)) / spineItems.length;
        const clamped = Math.max(0, Math.min(1, progress));
        onProgressChange?.(clamped);

        db.progress.put({
            bookId,
            location: `vitra:${currentSpineIndex}:${currentPage}`,
            percentage: clamped,
            currentChapter: spineItems[currentSpineIndex]?.href || '',
            updatedAt: Date.now(),
        }).catch(err => console.warn('[PaginatedReader] Progress save failed:', err));
    }, [currentSpineIndex, currentPage, totalPages, spineItems, isLoading, bookId, onProgressChange]);

    // ── Keyboard navigation ──
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
                e.preventDefault();
                prevPage();
            } else if (e.key === 'ArrowRight' || e.key === 'PageDown') {
                e.preventDefault();
                nextPage();
            }
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [prevPage, nextPage]);

    // ── Click-to-turn on viewport edges ──
    useEffect(() => {
        const viewport = viewportRef.current;
        if (!viewport) return;
        let downX = 0, downY = 0;
        const onDown = (e: MouseEvent) => { downX = e.clientX; downY = e.clientY; };
        const onUp = (e: MouseEvent) => {
            if (Math.abs(e.clientX - downX) > 5 || Math.abs(e.clientY - downY) > 5) return;
            if (window.getSelection()?.toString()) return;
            const rect = viewport.getBoundingClientRect();
            const x = e.clientX - rect.left;
            if (x < rect.width * 0.15) prevPage();
            else if (x > rect.width * 0.85) nextPage();
        };
        viewport.addEventListener('mousedown', onDown);
        viewport.addEventListener('mouseup', onUp);
        return () => { viewport.removeEventListener('mousedown', onDown); viewport.removeEventListener('mouseup', onUp); };
    }, [prevPage, nextPage]);

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
    }, []);

    // ── jumpToSpine (exposed via ref) ──
    const jumpToSpine = useCallback(async (targetSpineIndex: number, searchText?: string) => {
        if (targetSpineIndex < 0 || targetSpineIndex >= spineItemsRef.current.length) return;
        pendingSearchTextRef.current = searchText || null;
        setCurrentSpineIndex(targetSpineIndex);
        setCurrentPage(0);
        currentPageRef.current = 0;
        await loadChapter(targetSpineIndex);
    }, [loadChapter]);

    useEffect(() => {
        const container = columnRef.current;
        if (!container) return;

        const handlePdfInternalLink = (event: MouseEvent) => {
            const target = event.target;
            if (!(target instanceof Element)) return;

            const anchor = target.closest('a[data-pdf-page]');
            if (!(anchor instanceof HTMLAnchorElement)) return;

            const rawPage = anchor.getAttribute('data-pdf-page');
            if (!rawPage) return;
            const targetSpine = Number.parseInt(rawPage, 10);
            if (!Number.isFinite(targetSpine)) return;
            if (targetSpine < 0 || targetSpine >= spineItemsRef.current.length) return;

            event.preventDefault();
            event.stopPropagation();
            void jumpToSpine(targetSpine);
        };

        container.addEventListener('click', handlePdfInternalLink);
        return () => {
            container.removeEventListener('click', handlePdfInternalLink);
        };
    }, [jumpToSpine]);

    useImperativeHandle(ref, () => ({ jumpToSpine }));

    // ── Compute translateX ──
    const columnWidth = getColumnWidth();
    const colW = pageTurnMode === 'paginated-double' ? columnWidth / 2 : columnWidth;
    // 使用 displayPage 而不是 currentPage，章节切换时保持在 page 0 位置
    const translateX = -(displayPage * columnWidth);

    return (
        <div className={styles.viewport} ref={viewportRef}>
            {/* Shadow rendering area */}
            <div className={styles.shadowArea}>
                {shadowData && (
                    <ShadowRenderer
                        key={shadowData.chapterId}
                        htmlContent={shadowData.htmlContent}
                        htmlFragments={shadowData.htmlFragments}
                        chapterId={shadowData.chapterId}
                        externalStyles={shadowData.externalStyles}
                        preprocessed
                        readerStyles={readerStyles}
                        resourceExists={shadowResourceExists}
                        mode="paginated"
                        onReady={handleShadowReady}
                        onError={(err) => {
                            console.error('[PaginatedReader] Shadow error:', err);
                            setShadowData(null);
                            pageBoundariesRef.current = [];
                            pageMapReadyRef.current = false;
                            setIsLoading(false);
                            setChapterFading(false);
                        }}
                    />
                )}
                <div
                    ref={paginationMeasureHostRef}
                    className={styles.paginationMeasureHost}
                    aria-hidden="true"
                />
            </div>

            {/* Paginated content */}
            <div
                className={`${styles.columnContainer} ${chapterFading ? styles.fading : ''}`}
                ref={columnRef}
                style={{
                    columnWidth: `${colW}px`,
                    transform: `translateX(${translateX}px)`,
                }}
            />

            {/* Loading */}
            {isLoading && (
                <div className={styles.emptyState}>Loading...</div>
            )}

            {renderSelectionUI()}
        </div>
    );
});

PaginatedReaderView.displayName = 'PaginatedReaderView';
