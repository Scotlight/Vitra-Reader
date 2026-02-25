import {
    useRef, useEffect, useState, useCallback, useLayoutEffect,
    forwardRef, useImperativeHandle, useMemo
} from 'react';
import type { ContentProvider, SpineItemInfo } from '../../services/contentProvider';
import { ShadowRenderer, ReaderStyleConfig } from './ShadowRenderer';
import {
    shouldPreloadChapter,
    detectScrollDirection,
    ScrollDirection,
} from '../../utils/scrollDetection';
import {
    findBestAnchor,
    captureAnchorInfo,
    calculateAnchorDelta,
} from '../../utils/anchorDetection';
import { useScrollInertia } from '../../hooks/useScrollInertia';
import { useScrollEvents } from '../../hooks/useScrollEvents';
import { db } from '../../services/storageService';
import { findTextInDOM, highlightRange } from '../../utils/textFinder';
import { SelectionMenu } from './SelectionMenu';
import { NoteDialog } from './NoteDialog';
import styles from './ScrollReaderView.module.css';

// ── Types ──

interface LoadedChapter {
    spineIndex: number;
    id: string;
    htmlContent: string;
    externalStyles: string[];
    domNode: HTMLElement | null;
    height: number;
    status: 'loading' | 'shadow-rendering' | 'ready' | 'mounted';
}

type PipelineState =
    | 'idle'
    | 'pre-fetching'
    | 'rendering-offscreen'
    | 'anchoring-locked'
    | 'committing';

interface ScrollReaderViewProps {
    provider: ContentProvider;
    bookId: string;
    initialSpineIndex?: number;
    initialScrollOffset?: number;
    readerStyles: ReaderStyleConfig;
    onProgressChange?: (progress: number) => void;
    onChapterChange?: (label: string, href: string) => void;
    onSelectionSearch?: (keyword: string) => void;
}

export interface ScrollReaderHandle {
    jumpToSpine: (spineIndex: number, searchText?: string) => Promise<void>;
}

// ── Constants ──

const MAX_MOUNTED_CHAPTERS = 5;
const PRELOAD_THRESHOLD_PX = 600;
const UNLOAD_DISTANCE = 3;

// ── Component ──

export const ScrollReaderView = forwardRef<ScrollReaderHandle, ScrollReaderViewProps>(({
    provider,
    bookId,
    initialSpineIndex = 0,
    initialScrollOffset = 0,
    readerStyles,
    onProgressChange,
    onChapterChange,
    onSelectionSearch,
}: ScrollReaderViewProps, ref) => {
    const viewportRef = useRef<HTMLDivElement>(null);
    const chapterListRef = useRef<HTMLDivElement>(null);
    const lastScrollTopRef = useRef(0);
    const pipelineRef = useRef<PipelineState>('idle');
    const loadingLockRef = useRef<Set<number>>(new Set());
    const progressTimerRef = useRef<number | null>(null);
    const initialScrollDone = useRef(false);
    const pendingSearchTextRef = useRef<string | null>(null);

    const [chapters, setChapters] = useState<LoadedChapter[]>([]);
    const chaptersRef = useRef<LoadedChapter[]>([]);
    const [spineItems, setSpineItems] = useState<SpineItemInfo[]>([]);
    const spineItemsRef = useRef<SpineItemInfo[]>([]);
    const [currentSpineIndex, setCurrentSpineIndex] = useState(initialSpineIndex);

    const [isInitialized, setIsInitialized] = useState(false);

    // ── Selection Menu State ──
    const [selectionMenu, setSelectionMenu] = useState<{
        visible: boolean; x: number; y: number; text: string; spineIndex: number;
    }>({ visible: false, x: 0, y: 0, text: '', spineIndex: -1 });
    const [noteDialog, setNoteDialog] = useState<{
        visible: boolean; text: string; spineIndex: number;
    }>({ visible: false, text: '', spineIndex: -1 });
    const renderedHighlightsRef = useRef<Set<string>>(new Set());

    // Keep refs in sync with state
    chaptersRef.current = chapters;

    // ── Physics Engine Integration ──

    const inertiaCallbacks = useMemo(() => ({
        onStart: () => {
            viewportRef.current?.classList.add(styles.flinging);
        },
        onStop: () => {
            viewportRef.current?.classList.remove(styles.flinging);
        }
    }), []);

    const { addImpulse, fling, stop, setDragging } = useScrollInertia(viewportRef, undefined, inertiaCallbacks);

    const scrollCallbacks = useMemo(() => ({
        onWheelImpulse: (deltaY: number) => {
            addImpulse(deltaY);
        },
        onDragStart: () => {
            stop();
            setDragging(true);
        },
        onTouchFling: (velocity: number) => {
            setDragging(false);
            fling(velocity);
        },
        onDragEnd: () => {
            setDragging(false);
        }
    }), [addImpulse, fling, stop, setDragging]);

    useScrollEvents(viewportRef, scrollCallbacks);

    // Pending shadow renders queue
    const [shadowQueue, setShadowQueue] = useState<LoadedChapter[]>([]);

    // ── Spine Initialization ──

    useEffect(() => {
        const items = provider.getSpineItems();
        spineItemsRef.current = items;
        setSpineItems(items);
    }, [provider]);

    // Load initial chapter once spineItems are available
    useEffect(() => {
        if (spineItems.length === 0 || isInitialized) return;
        if (loadingLockRef.current.size > 0) return; // already loading
        const safeIndex = Math.min(initialSpineIndex, spineItems.length - 1);
        setCurrentSpineIndex(safeIndex);
        loadChapter(safeIndex, 'initial');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [spineItems]);

    // ── Chapter Loading ──

    const loadChapter = useCallback(async (
        spineIndex: number,
        direction: 'prev' | 'next' | 'initial',
    ) => {
        if (loadingLockRef.current.has(spineIndex)) return;
        const currentSpineItems = spineItemsRef.current;
        if (spineIndex < 0 || spineIndex >= currentSpineItems.length) return;

        // Check if already loaded
        if (chaptersRef.current.some(ch => ch.spineIndex === spineIndex)) return;

        loadingLockRef.current.add(spineIndex);
        pipelineRef.current = 'pre-fetching';

        const chapterId = `ch-${spineIndex}`;

        // Add placeholder to chapters list
        const placeholder: LoadedChapter = {
            spineIndex,
            id: chapterId,
            htmlContent: '',
            externalStyles: [],
            domNode: null,
            height: 0,
            status: 'loading',
        };

        setChapters(prev => {
            if (direction === 'prev') return [placeholder, ...prev];
            return [...prev, placeholder];
        });

        try {
            const html = await provider.extractChapterHtml(spineIndex);
            let chapterStyles: string[] = [];
            try {
                chapterStyles = await provider.extractChapterStyles(spineIndex);
            } catch {
                // Styles are optional
            }

            const loaded: LoadedChapter = {
                ...placeholder,
                htmlContent: html,
                externalStyles: chapterStyles,
                status: 'shadow-rendering',
            };

            // Update in list and add to shadow queue
            setChapters(prev =>
                prev.map(ch => ch.spineIndex === spineIndex ? loaded : ch)
            );
            setShadowQueue(prev => [...prev, loaded]);

            pipelineRef.current = 'rendering-offscreen';
        } catch (error) {
            console.error(`[ScrollReader] Failed to load chapter ${spineIndex}:`, error);
            setChapters(prev => prev.filter(ch => ch.spineIndex !== spineIndex));
            pipelineRef.current = 'idle';
        } finally {
            loadingLockRef.current.delete(spineIndex);
        }
    }, [provider]);

    // ── Shadow Render Complete Handler ──

    const handleShadowReady = useCallback((
        spineIndex: number,
        node: HTMLElement,
        height: number,
    ) => {
        console.log(`[ScrollReader] Shadow ready: spine ${spineIndex}, height ${height}px`);

        // Remove from shadow queue
        setShadowQueue(prev => prev.filter(ch => ch.spineIndex !== spineIndex));

        // Determine if this is a prepend (previous chapter) or append
        setChapters(prev => {
            const index = prev.findIndex(ch => ch.spineIndex === spineIndex);
            if (index < 0) return prev;

            const updated = [...prev];
            updated[index] = {
                ...updated[index],
                domNode: node,
                height,
                status: 'ready',
            };
            return updated;
        });
    }, []);

    // ── Atomic DOM Commit (useLayoutEffect for prepend compensation) ──

    useLayoutEffect(() => {
        const viewport = viewportRef.current;
        const listEl = chapterListRef.current;
        if (!viewport || !listEl) return;

        const readyChapters = chapters.filter(ch => ch.status === 'ready');
        if (readyChapters.length === 0) return;

        readyChapters.forEach(ch => {
            // Check if this chapter needs prepend compensation
            const existingDomNodes = listEl.querySelectorAll('[data-chapter-id]');
            const isFirstInList = chapters.indexOf(ch) === 0;
            const needsCompensation = isFirstInList && existingDomNodes.length > 0;

            let anchorBefore: ReturnType<typeof captureAnchorInfo> | null = null;
            let oldScrollTop = 0;

            if (needsCompensation) {
                // Snapshot phase — capture anchor before DOM mutation
                pipelineRef.current = 'anchoring-locked';
                const anchor = findBestAnchor(viewport);
                anchorBefore = captureAnchorInfo(anchor);
                oldScrollTop = viewport.scrollTop;
            }

            // Mutation phase — mount DOM
            const chapterEl = document.createElement('div');
            chapterEl.setAttribute('data-chapter-id', ch.id);
            chapterEl.className = styles.chapterBlock;
            chapterEl.style.contain = 'layout paint';

            // Move the shadow-rendered node into the chapter element
            if (ch.domNode) {
                chapterEl.appendChild(ch.domNode);
            }

            // Insert at the correct position
            const targetIndex = chapters.indexOf(ch);
            const existingNodes = Array.from(listEl.children);

            if (targetIndex === 0 && existingNodes.length > 0) {
                listEl.prepend(chapterEl);
            } else if (targetIndex >= existingNodes.length) {
                listEl.appendChild(chapterEl);
            } else {
                listEl.insertBefore(chapterEl, existingNodes[targetIndex] || null);
            }

            // Compensation phase — fix scroll position after prepend
            if (needsCompensation && anchorBefore) {
                const anchorAfter = captureAnchorInfo(anchorBefore.element);
                const deltaY = calculateAnchorDelta(anchorBefore, anchorAfter);
                viewport.scrollTop = oldScrollTop + deltaY;

                console.log(`[ScrollReader] Scroll compensated: ${deltaY}px`);
            }

            pipelineRef.current = 'idle';
        });

        // Mark as mounted
        setChapters(prev =>
            prev.map(ch =>
                ch.status === 'ready' ? { ...ch, status: 'mounted' } : ch
            )
        );

        // Handle initial scroll
        if (!initialScrollDone.current && initialScrollOffset > 0) {
            viewport.scrollTop = initialScrollOffset;
            initialScrollDone.current = true;
        }

        // Handle pending search text after chapter mount
        const searchText = pendingSearchTextRef.current;
        if (searchText) {
            pendingSearchTextRef.current = null;
            const mountedChapters = chapters.filter(ch => ch.status === 'ready' || ch.status === 'mounted');
            for (const ch of mountedChapters) {
                const el = listEl.querySelector(`[data-chapter-id="${ch.id}"]`) as HTMLElement | null;
                if (el) {
                    const range = findTextInDOM(el, searchText);
                    if (range) {
                        const rect = range.getBoundingClientRect();
                        const vpRect = viewport.getBoundingClientRect();
                        viewport.scrollTop += rect.top - vpRect.top;
                        break;
                    }
                }
            }
        }

        if (!isInitialized && chapters.some(ch => ch.status === 'ready' || ch.status === 'mounted')) {
            setIsInitialized(true);
        }
    }, [chapters, initialScrollOffset, isInitialized]);

    // ── Scroll Event Handler ──

    useEffect(() => {
        const viewport = viewportRef.current;
        if (!viewport) return;

        const handleScroll = () => {
            const scrollTop = viewport.scrollTop;
            const viewportHeight = viewport.clientHeight;
            const contentHeight = viewport.scrollHeight;
            const direction: ScrollDirection = detectScrollDirection(scrollTop, lastScrollTopRef.current);
            lastScrollTopRef.current = scrollTop;

            if (pipelineRef.current === 'anchoring-locked') return;

            // Check if we need to preload
            const needsPreload = shouldPreloadChapter(
                scrollTop, viewportHeight, contentHeight, direction,
                { threshold: PRELOAD_THRESHOLD_PX }
            );

            if (needsPreload && pipelineRef.current === 'idle') {
                const sortedChapters = [...chapters].sort((a, b) => a.spineIndex - b.spineIndex);
                const mountedChapters = sortedChapters.filter(ch => ch.status === 'mounted');

                if (direction === 'up' && mountedChapters.length > 0) {
                    const earliest = mountedChapters[0].spineIndex;
                    if (earliest > 0) {
                        loadChapter(earliest - 1, 'prev');
                    }
                } else if (direction === 'down' && mountedChapters.length > 0) {
                    const latest = mountedChapters[mountedChapters.length - 1].spineIndex;
                    if (latest < spineItems.length - 1) {
                        loadChapter(latest + 1, 'next');
                    }
                }
            }

            // Update current chapter based on scroll position
            updateCurrentChapter(scrollTop, viewportHeight);

            // Debounced progress update
            if (progressTimerRef.current) {
                window.clearTimeout(progressTimerRef.current);
            }
            progressTimerRef.current = window.setTimeout(() => {
                updateProgress(scrollTop, viewportHeight);
            }, 200);
        };

        viewport.addEventListener('scroll', handleScroll, { passive: true });
        return () => {
            viewport.removeEventListener('scroll', handleScroll);
            if (progressTimerRef.current) {
                window.clearTimeout(progressTimerRef.current);
            }
        };
    }, [
        chapters,
        spineItems,
        loadChapter,
        currentSpineIndex,
        onChapterChange,
        onProgressChange,
        bookId,
    ]);

    // ── Chapter Unloading ──

    useEffect(() => {
        const mountedChapters = chapters.filter(ch => ch.status === 'mounted');
        if (mountedChapters.length <= MAX_MOUNTED_CHAPTERS) return;

        const toUnload = mountedChapters
            .filter(ch => Math.abs(ch.spineIndex - currentSpineIndex) > UNLOAD_DISTANCE)
            .sort((a, b) =>
                Math.abs(b.spineIndex - currentSpineIndex) - Math.abs(a.spineIndex - currentSpineIndex)
            );

        if (toUnload.length === 0) return;

        const listEl = chapterListRef.current;
        toUnload.forEach(ch => {
            // Remove DOM
            if (listEl) {
                const domEl = listEl.querySelector(`[data-chapter-id="${ch.id}"]`);
                domEl?.remove();
            }
            // Free resources
            provider.unloadChapter(ch.spineIndex);
        });

        const unloadIds = new Set(toUnload.map(ch => ch.spineIndex));
        setChapters(prev => prev.filter(ch => !unloadIds.has(ch.spineIndex)));

        console.log(`[ScrollReader] Unloaded chapters: ${toUnload.map(ch => ch.spineIndex).join(', ')}`);
    }, [currentSpineIndex, chapters, provider]);

    // ── Current Chapter Detection ──

    const updateCurrentChapter = useCallback((scrollTop: number, viewportHeight: number) => {
        const listEl = chapterListRef.current;
        if (!listEl) return;

        const viewportMid = scrollTop + viewportHeight / 2;
        const chapterEls = Array.from(listEl.querySelectorAll('[data-chapter-id]')) as HTMLElement[];

        for (const el of chapterEls) {
            const top = el.offsetTop;
            const bottom = top + el.offsetHeight;

            if (viewportMid >= top && viewportMid < bottom) {
                const chapterIdAttr = el.getAttribute('data-chapter-id') || '';
                const match = chapterIdAttr.match(/^ch-(\d+)$/);
                if (match) {
                    const spineIdx = parseInt(match[1], 10);
                    if (spineIdx !== currentSpineIndex) {
                        setCurrentSpineIndex(spineIdx);
                        // Report chapter change
                        if (onChapterChange && spineItems[spineIdx]) {
                            onChapterChange(spineItems[spineIdx].id, spineItems[spineIdx].href);
                        }
                    }
                }
                break;
            }
        }
    }, [currentSpineIndex, spineItems, onChapterChange]);

    // ── Progress Calculation ──

    const updateProgress = useCallback((
        scrollTop: number,
        viewportHeight: number,
    ) => {
        if (spineItems.length === 0) return;

        // Find which chapter is in view
        const listEl = chapterListRef.current;
        if (!listEl) return;

        const viewportMid = scrollTop + viewportHeight / 2;
        const chapterEls = Array.from(listEl.querySelectorAll('[data-chapter-id]')) as HTMLElement[];

        let chapterProgress = 0;
        let resolvedSpineIndex = currentSpineIndex;
        let hasMatchedChapter = false;

        for (const el of chapterEls) {
            const top = el.offsetTop;
            const bottom = top + el.offsetHeight;
            const chapterIdAttr = el.getAttribute('data-chapter-id') || '';
            const match = chapterIdAttr.match(/^ch-(\d+)$/);

            if (match && viewportMid >= top && viewportMid < bottom) {
                const spineIdx = parseInt(match[1], 10);
                const localProgress = el.offsetHeight > 0
                    ? Math.max(0, Math.min(1, (viewportMid - top) / el.offsetHeight))
                    : 0;

                resolvedSpineIndex = spineIdx;
                chapterProgress = (spineIdx + localProgress) / spineItems.length;
                hasMatchedChapter = true;
                break;
            }
        }

        if (!hasMatchedChapter) return;

        const progress = Math.max(0, Math.min(1, chapterProgress));
        onProgressChange?.(progress);

        // Persist progress
        db.progress.put({
            bookId,
            location: `bdise:${resolvedSpineIndex}:${scrollTop}`,
            percentage: progress,
            currentChapter: spineItems[resolvedSpineIndex]?.href || '',
            updatedAt: Date.now(),
        }).catch(err => console.warn('[ScrollReader] Progress save failed:', err));
    }, [spineItems, bookId, currentSpineIndex, onProgressChange]);

    // ── TOC Jump ──

    const jumpToSpine = useCallback(async (targetSpineIndex: number, searchText?: string) => {
        if (targetSpineIndex < 0 || targetSpineIndex >= spineItemsRef.current.length) return;
        pendingSearchTextRef.current = searchText || null;

        // Check if already mounted
        const existing = chaptersRef.current.find(ch =>
            ch.spineIndex === targetSpineIndex && ch.status === 'mounted'
        );

        if (existing) {
            // Scroll to it
            const listEl = chapterListRef.current;
            const viewport = viewportRef.current;
            if (listEl && viewport) {
                const domEl = listEl.querySelector(`[data-chapter-id="ch-${targetSpineIndex}"]`) as HTMLElement | null;
                if (domEl) {
                    viewport.scrollTop = domEl.offsetTop;
                    // If searchText, find and scroll to it
                    if (searchText) {
                        pendingSearchTextRef.current = null;
                        const range = findTextInDOM(domEl, searchText);
                        if (range) {
                            const rect = range.getBoundingClientRect();
                            const vpRect = viewport.getBoundingClientRect();
                            viewport.scrollTop += rect.top - vpRect.top;
                        }
                    }
                }
            }
            return;
        }

        // Clear all chapters and load from the target
        const listEl = chapterListRef.current;
        if (listEl) listEl.innerHTML = '';

        chaptersRef.current = [];
        setChapters([]);
        setShadowQueue([]);
        loadingLockRef.current.clear();
        pipelineRef.current = 'idle';
        setCurrentSpineIndex(targetSpineIndex);

        // loadChapter uses chaptersRef (always current), so no stale closure issue
        loadChapter(targetSpineIndex, 'initial');
    }, [loadChapter]);

    // Expose jumpToSpine via ref for parent component
    useImperativeHandle(ref, () => ({
        jumpToSpine
    }));

    // ── Selection Detection ──

    useEffect(() => {
        const viewport = viewportRef.current;
        if (!viewport) return;

        const handleMouseUp = () => {
            const sel = window.getSelection();
            const text = sel?.toString().trim();
            if (!text || !sel?.rangeCount) {
                return;
            }

            const range = sel.getRangeAt(0);
            const rect = range.getBoundingClientRect();

            // Find which chapter this selection belongs to
            let node: Node | null = range.startContainer;
            let spineIdx = -1;
            while (node && node !== viewport) {
                if (node instanceof HTMLElement) {
                    const chId = node.getAttribute('data-chapter-id');
                    if (chId) {
                        const match = chId.match(/^ch-(\d+)$/);
                        if (match) spineIdx = parseInt(match[1], 10);
                        break;
                    }
                }
                node = node.parentNode;
            }

            setSelectionMenu({
                visible: true,
                x: rect.left + rect.width / 2,
                y: rect.top - 10,
                text,
                spineIndex: spineIdx,
            });
        };

        const handleContextMenu = (e: MouseEvent) => {
            const sel = window.getSelection();
            const text = sel?.toString().trim();
            if (!text) return;
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

    // Dismiss menu on scroll
    useEffect(() => {
        const viewport = viewportRef.current;
        if (!viewport || !selectionMenu.visible) return;

        const dismiss = () => setSelectionMenu(prev => ({ ...prev, visible: false }));
        viewport.addEventListener('scroll', dismiss, { passive: true, once: true });
        return () => viewport.removeEventListener('scroll', dismiss);
    }, [selectionMenu.visible]);

    // ── Highlight Rendering ──

    const applyHighlightsToChapter = useCallback((
        chapterEl: HTMLElement,
        spineIndex: number,
    ) => {
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
                const range = findTextInDOM(chapterEl, h.text);
                if (range) {
                    highlightRange(range, h.id, h.color);
                    renderedHighlightsRef.current.add(h.id);
                }
            }
        }).catch(err => console.warn('[ScrollReader] Highlight load failed:', err));
    }, [bookId]);

    // Apply highlights when chapters become mounted
    useLayoutEffect(() => {
        const listEl = chapterListRef.current;
        if (!listEl) return;

        const mountedChapters = chapters.filter(ch => ch.status === 'mounted');
        for (const ch of mountedChapters) {
            const el = listEl.querySelector(`[data-chapter-id="${ch.id}"]`) as HTMLElement | null;
            if (el) {
                applyHighlightsToChapter(el, ch.spineIndex);
            }
        }
    }, [chapters, applyHighlightsToChapter]);

    // ── Selection Menu Handlers ──

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
        const cfiRange = `bdise:${spineIndex}`;

        await db.highlights.add({
            id,
            bookId,
            cfiRange,
            color,
            text,
            createdAt: Date.now(),
        });

        // Immediately render the highlight in DOM
        const listEl = chapterListRef.current;
        if (listEl) {
            const chapterEl = listEl.querySelector(`[data-chapter-id="ch-${spineIndex}"]`) as HTMLElement | null;
            if (chapterEl) {
                const range = findTextInDOM(chapterEl, text);
                if (range) {
                    highlightRange(range, id, color);
                    renderedHighlightsRef.current.add(id);
                }
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
        if (!keyword) return;
        onSelectionSearch?.(keyword);
        dismissMenu();
    }, [selectionMenu.text, onSelectionSearch, dismissMenu]);

    const handleWebSearch = useCallback(() => {
        const q = encodeURIComponent(selectionMenu.text.trim());
        if (!q) return;
        window.electronAPI.openExternal(`https://www.google.com/search?q=${q}`);
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

    // ── Render ──

    return (
        <div
            className={styles.bdiseViewport}
            ref={viewportRef}
            style={{ overflow: 'hidden' }} // Override to disable native scrolling
        >
            {/* Shadow rendering area */}
            <div className={styles.shadowArea}>
                {shadowQueue.map(ch => (
                    <ShadowRenderer
                        key={ch.id}
                        htmlContent={ch.htmlContent}
                        chapterId={ch.id}
                        externalStyles={ch.externalStyles}
                        readerStyles={readerStyles}
                        onReady={(node, height) => handleShadowReady(ch.spineIndex, node, height)}
                        onError={(err) => {
                            console.error(`[ScrollReader] Shadow error for ${ch.id}:`, err);
                            setShadowQueue(prev => prev.filter(q => q.spineIndex !== ch.spineIndex));
                        }}
                    />
                ))}
            </div>

            {/* Chapter list — DOM nodes are mounted here by useLayoutEffect */}
            <div className={styles.chapterList} ref={chapterListRef}>
                {/* Loading indicator at top */}
                {chapters.length > 0 &&
                    chapters[0].spineIndex > 0 &&
                    (chapters[0].status === 'loading' || chapters[0].status === 'shadow-rendering') && (
                        <div className={styles.loadingIndicator}>
                            <span className={styles.loadingDot} />
                            <span className={styles.loadingDot} />
                            <span className={styles.loadingDot} />
                        </div>
                    )}
            </div>

            {/* Loading indicator at bottom */}
            {chapters.length > 0 && (
                chapters[chapters.length - 1].status === 'loading' ||
                chapters[chapters.length - 1].status === 'shadow-rendering'
            ) && (
                    <div className={styles.loadingIndicator}>
                        <span className={styles.loadingDot} />
                        <span className={styles.loadingDot} />
                        <span className={styles.loadingDot} />
                    </div>
                )}

            {/* Empty state */}
            {!isInitialized && chapters.length === 0 && (
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

ScrollReaderView.displayName = 'ScrollReaderView';
