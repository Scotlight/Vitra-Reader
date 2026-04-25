import {
    useRef, useEffect, useState, useCallback,
    forwardRef, useImperativeHandle,
} from 'react';
import type { ContentProvider } from '@/engine/core/contentProvider';
import { useSelectionMenu } from '@/hooks/useSelectionMenu';
import { ShadowRenderer, ReaderStyleConfig } from './ShadowRenderer';
import { usePaginatedHighlights } from './paginatedReader/usePaginatedHighlights';
import { usePaginatedNavigation } from './paginatedReader/usePaginatedNavigation';
import { usePaginatedProgress } from './paginatedReader/usePaginatedProgress';
import { usePaginationMeasure } from './paginatedReader/usePaginationMeasure';
import { usePaginatedChapterLoader } from './paginatedReader/usePaginatedChapterLoader';
import { usePaginatedPageLayout } from './paginatedReader/usePaginatedPageLayout';
import styles from './PaginatedReaderView.module.css';

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
    const paginationMeasureHostRef = useRef<HTMLDivElement>(null);
    const pendingLastPageRef = useRef(false);
    const pendingSearchTextRef = useRef<string | null>(null);
    const isInitialLoadRef = useRef(true);

    const [currentSpineIndex, setCurrentSpineIndex] = useState(initialSpineIndex);
    const [currentPage, setCurrentPage] = useState(initialPage);
    const [totalPages, setTotalPages] = useState(1);
    const [isLoading, setIsLoading] = useState(true);
    const [chapterFading, setChapterFading] = useState(false);
    const [chapterLoadError, setChapterLoadError] = useState(false);
    const [displayPage, setDisplayPage] = useState(0);
    const [shadowData, setShadowData] = useState<{
        htmlContent: string; htmlFragments: string[]; externalStyles: string[]; chapterId: string;
    } | null>(null);
    const [chapterNode, setChapterNode] = useState<HTMLElement | null>(null);

    const currentSpineIndexRef = useRef(currentSpineIndex);
    const currentPageRef = useRef(currentPage);
    const totalPagesRef = useRef(totalPages);
    currentSpineIndexRef.current = currentSpineIndex;
    currentPageRef.current = currentPage;
    totalPagesRef.current = totalPages;

    const getHighlightContainer = useCallback((_spineIndex: number): HTMLElement | null => {
        return columnRef.current;
    }, []);
    const { setSelectionMenu, renderedHighlightsRef, renderSelectionUI } = useSelectionMenu({
        bookId, onSelectionSearch, getHighlightContainer,
    });
    const shadowResourceExists = useCallback((url: string) => {
        return provider.isAssetUrlAvailable?.(url) ?? true;
    }, [provider]);

    const { scheduleHighlightInjection } = usePaginatedHighlights({
        bookId, viewportRef, currentSpineIndexRef, renderedHighlightsRef, setSelectionMenu,
    });

    const { abortPaginationMeasure, measureBoundariesInShadow, pageBoundariesRef, pageMapReadyRef } =
        usePaginationMeasure(paginationMeasureHostRef);

    const { loadChapter, spineItems, spineItemsRef } = usePaginatedChapterLoader({
        provider,
        renderedHighlightsRef,
        abortPaginationMeasure,
        pendingLastPageRef,
        isInitialLoadRef,
        pageBoundariesRef,
        pageMapReadyRef,
        currentSpineIndexRef,
        setCurrentSpineIndex,
        setIsLoading,
        setChapterFading,
        setShadowData,
        onLoadError: () => setChapterLoadError(true),
    });

    const { isPageLikelyBlank } = usePaginatedNavigation({
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
        hideSelectionMenu: () => setSelectionMenu((previous) => ({ ...previous, visible: false })),
        loadChapter,
    });

    // Load initial chapter when spine is ready
    useEffect(() => {
        if (spineItems.length === 0) return;
        const safeIndex = Math.min(initialSpineIndex, spineItems.length - 1);
        setCurrentSpineIndex(safeIndex);
        loadChapter(safeIndex);
    }, [spineItems]); // eslint-disable-line react-hooks/exhaustive-deps

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
    }, [measureBoundariesInShadow, pageBoundariesRef, pageMapReadyRef]);

    const { getColumnWidth } = usePaginatedPageLayout({
        viewportRef,
        columnRef,
        chapterNode,
        pageBoundariesRef,
        pendingLastPageRef,
        pendingSearchTextRef,
        currentPageRef,
        totalPagesRef,
        isInitialLoadRef,
        currentSpineIndexRef,
        abortPaginationMeasure,
        measureBoundariesInShadow,
        scheduleHighlightInjection,
        setCurrentPage,
        setTotalPages,
        setDisplayPage,
        setChapterFading,
        isPageLikelyBlank,
    });

    usePaginatedProgress({
        bookId, currentPage, currentSpineIndex, isLoading,
        onChapterChange, onProgressChange, spineItems, totalPages,
    });

    // Reload chapter when readerStyles change
    const stylesKeyRef = useRef('');
    useEffect(() => {
        const key = JSON.stringify(readerStyles);
        if (stylesKeyRef.current === '' || stylesKeyRef.current === key) {
            stylesKeyRef.current = key;
            return;
        }
        stylesKeyRef.current = key;
        renderedHighlightsRef.current.clear();
        loadChapter(currentSpineIndexRef.current);
    }, [readerStyles, loadChapter]); // eslint-disable-line react-hooks/exhaustive-deps

    const jumpToSpine = useCallback(async (targetSpineIndex: number, searchText?: string) => {
        if (targetSpineIndex < 0 || targetSpineIndex >= spineItemsRef.current.length) return;
        pendingSearchTextRef.current = searchText || null;
        setCurrentSpineIndex(targetSpineIndex);
        setCurrentPage(0);
        currentPageRef.current = 0;
        await loadChapter(targetSpineIndex);
    }, [loadChapter, spineItemsRef]);

    // PDF internal link handler
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
        return () => { container.removeEventListener('click', handlePdfInternalLink); };
    }, [jumpToSpine, spineItemsRef]);

    useImperativeHandle(ref, () => ({ jumpToSpine }));

    const columnWidth = getColumnWidth();
    const colW = pageTurnMode === 'paginated-double' ? columnWidth / 2 : columnWidth;
    const translateX = -(displayPage * columnWidth);

    return (
        <div className={styles.viewport} ref={viewportRef}>
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
            <div
                className={`${styles.columnContainer} ${chapterFading ? styles.fading : ''}`}
                ref={columnRef}
                style={{
                    columnWidth: `${colW}px`,
                    transform: `translateX(${translateX}px)`,
                }}
            />
            {isLoading && <div className={styles.emptyState}>Loading...</div>}
            {chapterLoadError && !isLoading && (
                <div className={styles.chapterErrorPlaceholder} onClick={() => setChapterLoadError(false)}>
                    章节加载失败
                </div>
            )}
            {renderSelectionUI()}
        </div>
    );
});
