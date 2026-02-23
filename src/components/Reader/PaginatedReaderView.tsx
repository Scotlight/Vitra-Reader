import {
    useRef, useEffect, useState, useCallback,
    forwardRef, useImperativeHandle,
} from 'react';
import { Book } from 'epubjs';
import {
    extractChapterHtml,
    extractChapterStyles,
    getSpineItems,
    SpineItemInfo,
} from '../../services/epubContentExtractor';
import { ShadowRenderer, ReaderStyleConfig } from './ShadowRenderer';
import { db } from '../../services/storageService';
import { findTextInDOM, highlightRange } from '../../utils/textFinder';
import { SelectionMenu } from './SelectionMenu';
import { NoteDialog } from './NoteDialog';
import styles from './PaginatedReaderView.module.css';

interface PaginatedReaderViewProps {
    book: Book;
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
    book,
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
    const renderedHighlightsRef = useRef<Set<string>>(new Set());
    const pendingLastPageRef = useRef(false);
    const pendingSearchTextRef = useRef<string | null>(null);
    const isInitialLoadRef = useRef(true); // 初始加载标记

    const [spineItems, setSpineItems] = useState<SpineItemInfo[]>([]);
    const [currentSpineIndex, setCurrentSpineIndex] = useState(initialSpineIndex);
    const [currentPage, setCurrentPage] = useState(initialPage);
    const [totalPages, setTotalPages] = useState(1);
    const [isLoading, setIsLoading] = useState(true);
    const [chapterFading, setChapterFading] = useState(false);
    const [displayPage, setDisplayPage] = useState(0); // 用于显示的页码（过渡时保持旧值）

    // Shadow render state
    const [shadowData, setShadowData] = useState<{
        htmlContent: string; externalStyles: string[]; chapterId: string;
    } | null>(null);
    const [chapterNode, setChapterNode] = useState<HTMLElement | null>(null);

    // Selection menu
    const [selectionMenu, setSelectionMenu] = useState<{
        visible: boolean; x: number; y: number; text: string; spineIndex: number;
    }>({ visible: false, x: 0, y: 0, text: '', spineIndex: -1 });

    // Note dialog
    const [noteDialog, setNoteDialog] = useState<{
        visible: boolean; text: string; spineIndex: number;
    }>({ visible: false, text: '', spineIndex: -1 });

    const spineItemsRef = useRef<SpineItemInfo[]>([]);
    const currentSpineIndexRef = useRef(currentSpineIndex);
    const currentPageRef = useRef(currentPage);
    const totalPagesRef = useRef(totalPages);
    currentSpineIndexRef.current = currentSpineIndex;
    currentPageRef.current = currentPage;
    totalPagesRef.current = totalPages;

    // ── Init spine ──
    useEffect(() => {
        const items = getSpineItems(book);
        spineItemsRef.current = items;
        setSpineItems(items);
    }, [book]);

    // ── Load chapter into shadow queue ──
    const loadChapter = useCallback(async (spineIndex: number, goToLastPage = false) => {
        if (spineIndex < 0 || spineIndex >= spineItemsRef.current.length) return;
        pendingLastPageRef.current = goToLastPage;

        // 非初始加载：先淡出，等淡出完成后再加载
        if (!isInitialLoadRef.current) {
            setChapterFading(true);
            // 等待淡出动画完成（150ms）
            await new Promise(resolve => setTimeout(resolve, 160));
        }

        setIsLoading(true);
        renderedHighlightsRef.current.clear();
        try {
            const html = await extractChapterHtml(book, spineIndex);
            let chapterStyles: string[] = [];
            try { chapterStyles = await extractChapterStyles(book, spineIndex); } catch { /* optional */ }
            setShadowData({
                htmlContent: html,
                externalStyles: chapterStyles,
                chapterId: `pch-${spineIndex}`,
            });
        } catch (err) {
            console.error(`[PaginatedReader] Failed to load chapter ${spineIndex}:`, err);
            setIsLoading(false);
            setChapterFading(false);
        }
    }, [book]);

    // ── Load initial chapter ──
    useEffect(() => {
        if (spineItems.length === 0) return;
        const safeIndex = Math.min(initialSpineIndex, spineItems.length - 1);
        setCurrentSpineIndex(safeIndex);
        loadChapter(safeIndex);
    }, [spineItems]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Shadow ready → mount + paginate ──
    const handleShadowReady = useCallback((node: HTMLElement, _height: number) => {
        setChapterNode(node);
        setShadowData(null);
        setIsLoading(false);
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
        container.innerHTML = '';
        container.appendChild(chapterNode);

        // 强制重排，确保上面的样式生效
        void container.offsetHeight;

        // Calculate pagination after DOM settles
        requestAnimationFrame(() => {
            if (w <= 0) return;
            const pages = Math.max(1, Math.ceil(container.scrollWidth / w));
            setTotalPages(pages);
            totalPagesRef.current = pages;

            // 如果需要跳转到最后一页
            let targetPage = 0;
            if (pendingLastPageRef.current) {
                targetPage = pages - 1;
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

            applyHighlights(chapterNode, currentSpineIndexRef.current);
        });
    }, [chapterNode]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Recalculate on resize ──
    useEffect(() => {
        const viewport = viewportRef.current;
        const container = columnRef.current;
        if (!viewport || !container || !chapterNode) return;

        let resizeTimer: number | null = null;
        const recalc = () => {
            // 防抖
            if (resizeTimer) window.clearTimeout(resizeTimer);
            resizeTimer = window.setTimeout(() => {
                const w = viewport.clientWidth;
                const h = viewport.clientHeight;
                if (w <= 0 || h <= 0) return;
                container.style.height = `${h}px`;
                const pages = Math.max(1, Math.ceil(container.scrollWidth / w));
                setTotalPages(pages);
                totalPagesRef.current = pages;
                setCurrentPage(p => Math.min(p, pages - 1));
            }, 100);
        };

        const ro = new ResizeObserver(recalc);
        ro.observe(viewport);
        return () => {
            ro.disconnect();
            if (resizeTimer) window.clearTimeout(resizeTimer);
        };
    }, [chapterNode]);

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

    // ── Page turning ──
    const goToPage = useCallback((page: number) => {
        setCurrentPage(page);
        currentPageRef.current = page;
        setDisplayPage(page); // 同步显示页码
        setSelectionMenu(prev => ({ ...prev, visible: false }));
    }, []);

    const nextPage = useCallback(() => {
        if (currentPageRef.current < totalPagesRef.current - 1) {
            goToPage(currentPageRef.current + 1);
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
    }, [goToPage, loadChapter]);

    const prevPage = useCallback(() => {
        if (currentPageRef.current > 0) {
            goToPage(currentPageRef.current - 1);
        } else {
            // Previous chapter, go to last page
            const prevIdx = currentSpineIndexRef.current - 1;
            if (prevIdx >= 0) {
                setCurrentSpineIndex(prevIdx);
                loadChapter(prevIdx, true); // 去最后一页
            }
        }
    }, [goToPage, loadChapter]);

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
            location: `bdise:${currentSpineIndex}:${currentPage}`,
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

    // ── Highlights ──
    const applyHighlights = useCallback((el: HTMLElement, spineIndex: number) => {
        db.highlights.where('bookId').equals(bookId).toArray().then(highlights => {
            const matching = highlights.filter(h => {
                if (h.cfiRange.startsWith('bdise:')) {
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

    // ── Selection menu handlers ──
    const dismissMenu = useCallback(() => {
        setSelectionMenu(prev => ({ ...prev, visible: false }));
        window.getSelection()?.removeAllRanges();
    }, []);

    const handleCopy = useCallback(() => {
        navigator.clipboard.writeText(selectionMenu.text);
        dismissMenu();
    }, [selectionMenu.text, dismissMenu]);

    const handleHighlight = useCallback(async (color: string) => {
        const { text, spineIndex } = selectionMenu;
        const id = crypto.randomUUID();
        await db.highlights.add({
            id, bookId, cfiRange: `bdise:${spineIndex}`, color, text, createdAt: Date.now(),
        });
        const container = columnRef.current;
        if (container) {
            const range = findTextInDOM(container, text);
            if (range) {
                highlightRange(range, id, color);
                renderedHighlightsRef.current.add(id);
            }
        }
        dismissMenu();
    }, [selectionMenu, bookId, dismissMenu]);

    const handleAddNote = useCallback(async () => {
        setNoteDialog({
            visible: true,
            text: selectionMenu.text,
            spineIndex: selectionMenu.spineIndex,
        });
        dismissMenu();
    }, [selectionMenu, dismissMenu]);

    const handleNoteSave = useCallback(async (note: string) => {
        await db.bookmarks.add({
            id: crypto.randomUUID(), bookId,
            location: `bdise:${noteDialog.spineIndex}`,
            title: noteDialog.text.slice(0, 80),
            note,
            createdAt: Date.now(),
        });
        setNoteDialog({ visible: false, text: '', spineIndex: -1 });
    }, [noteDialog, bookId]);

    const handleSearch = useCallback(() => {
        const keyword = selectionMenu.text.trim();
        if (keyword) onSelectionSearch?.(keyword);
        dismissMenu();
    }, [selectionMenu.text, onSelectionSearch, dismissMenu]);

    const handleWebSearch = useCallback(() => {
        const q = encodeURIComponent(selectionMenu.text.trim());
        if (q) window.electronAPI.openExternal(`https://www.google.com/search?q=${q}`);
        dismissMenu();
    }, [selectionMenu.text, dismissMenu]);

    const handleReadAloud = useCallback(() => {
        const text = selectionMenu.text.trim();
        if (!text) return;
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(text);
        utter.lang = 'zh-CN';
        utter.rate = 1;
        window.speechSynthesis.speak(utter);
        dismissMenu();
    }, [selectionMenu.text, dismissMenu]);

    const handleTranslate = useCallback(() => {
        const url = `https://translate.google.com/?sl=auto&tl=zh-CN&text=${encodeURIComponent(selectionMenu.text)}`;
        window.electronAPI.openExternal(url);
        dismissMenu();
    }, [selectionMenu.text, dismissMenu]);

    // ── jumpToSpine (exposed via ref) ──
    const jumpToSpine = useCallback(async (targetSpineIndex: number, searchText?: string) => {
        if (targetSpineIndex < 0 || targetSpineIndex >= spineItemsRef.current.length) return;
        pendingSearchTextRef.current = searchText || null;
        setCurrentSpineIndex(targetSpineIndex);
        setCurrentPage(0);
        currentPageRef.current = 0;
        await loadChapter(targetSpineIndex);
    }, [loadChapter]);

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
                        chapterId={shadowData.chapterId}
                        externalStyles={shadowData.externalStyles}
                        readerStyles={readerStyles}
                        mode="paginated"
                        onReady={handleShadowReady}
                        onError={(err) => {
                            console.error('[PaginatedReader] Shadow error:', err);
                            setShadowData(null);
                            setIsLoading(false);
                            setChapterFading(false);
                        }}
                    />
                )}
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

            {/* Page turn zones — click only, no drag interference */}
            <div
                className={styles.prevZone}
                onMouseDown={(e) => { (e.currentTarget as HTMLElement).dataset.downX = String(e.clientX); (e.currentTarget as HTMLElement).dataset.downY = String(e.clientY); }}
                onMouseUp={(e) => {
                    const dx = Math.abs(e.clientX - Number((e.currentTarget as HTMLElement).dataset.downX || 0));
                    const dy = Math.abs(e.clientY - Number((e.currentTarget as HTMLElement).dataset.downY || 0));
                    if (dx < 5 && dy < 5 && !window.getSelection()?.toString()) prevPage();
                }}
            />
            <div
                className={styles.nextZone}
                onMouseDown={(e) => { (e.currentTarget as HTMLElement).dataset.downX = String(e.clientX); (e.currentTarget as HTMLElement).dataset.downY = String(e.clientY); }}
                onMouseUp={(e) => {
                    const dx = Math.abs(e.clientX - Number((e.currentTarget as HTMLElement).dataset.downX || 0));
                    const dy = Math.abs(e.clientY - Number((e.currentTarget as HTMLElement).dataset.downY || 0));
                    if (dx < 5 && dy < 5 && !window.getSelection()?.toString()) nextPage();
                }}
            />

            {/* Loading */}
            {isLoading && (
                <div className={styles.emptyState}>Loading...</div>
            )}

            {/* Selection Menu */}
            <SelectionMenu
                visible={selectionMenu.visible}
                x={selectionMenu.x}
                y={selectionMenu.y}
                onCopy={handleCopy}
                onHighlight={handleHighlight}
                onNote={handleAddNote}
                onSearch={handleSearch}
                onWebSearch={handleWebSearch}
                onReadAloud={handleReadAloud}
                onTranslate={handleTranslate}
                onDismiss={dismissMenu}
            />

            <NoteDialog
                visible={noteDialog.visible}
                selectedText={noteDialog.text}
                onSave={handleNoteSave}
                onCancel={() => setNoteDialog({ visible: false, text: '', spineIndex: -1 })}
            />
        </div>
    );
});

PaginatedReaderView.displayName = 'PaginatedReaderView';
