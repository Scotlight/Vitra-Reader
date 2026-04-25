import { useCallback, useEffect, useLayoutEffect } from 'react';
import type { MutableRefObject } from 'react';
import { findTextInDOM, highlightRange } from '@/utils/textFinder';
import { scheduleIdleTask } from '@/utils/idleScheduler';
import { HIGHLIGHT_IDLE_TIMEOUT_MS } from './scrollReaderConstants';
import type { Highlight } from '@/services/storageService';
import type { LoadedChapter } from './scrollReaderTypes';
import type { ScrollReaderRefs } from './useScrollReaderRefs';

interface SelectionMenuState {
    visible: boolean;
    x: number;
    y: number;
    text: string;
    spineIndex: number;
}

interface UseHighlightAndSelectionOptions {
    chapters: LoadedChapter[];
    highlightsBySpineIndex: Map<number, Highlight[]>;
    renderedHighlightsRef: MutableRefObject<Set<string>>;
    selectionMenu: SelectionMenuState;
    setSelectionMenu: React.Dispatch<React.SetStateAction<SelectionMenuState>>;
}

/**
 * 滚动阅读下的选区检测 + 高亮注入协议：
 * - mouseup / contextmenu：从文本选区回溯 spineIndex，填充 selectionMenu
 * - scroll 触发时关闭选区菜单
 * - applyHighlightsToChapter: 对单章 DOM 扫描未渲染高亮并 highlightRange
 * - scheduleHighlightInjection: idle 任务节流高亮注入，给外部（虚拟段同步）
 *   在段集合变化时调用
 * - 章节状态变为 mounted 时自动标脏并安排注入
 */
export function useHighlightAndSelection(
    refs: ScrollReaderRefs,
    options: UseHighlightAndSelectionOptions,
) {
    const {
        chapters,
        highlightsBySpineIndex,
        renderedHighlightsRef,
        selectionMenu,
        setSelectionMenu,
    } = options;
    const {
        viewportRef,
        chapterListRef,
        highlightDirtyChaptersRef,
        highlightIdleHandlesRef,
    } = refs;

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
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        const viewport = viewportRef.current;
        if (!viewport || !selectionMenu.visible) return;

        const dismiss = () => setSelectionMenu(prev => ({ ...prev, visible: false }));
        viewport.addEventListener('scroll', dismiss, { passive: true, once: true });
        return () => viewport.removeEventListener('scroll', dismiss);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectionMenu.visible]);

    const applyHighlightsToChapter = useCallback((
        chapterEl: HTMLElement,
        spineIndex: number,
    ) => {
        const matching = highlightsBySpineIndex.get(spineIndex) ?? [];
        if (matching.length === 0) return;

        for (const highlight of matching) {
            if (renderedHighlightsRef.current.has(highlight.id)) continue;
            const range = findTextInDOM(chapterEl, highlight.text);
            if (!range) continue;
            highlightRange(range, highlight.id, highlight.color);
            renderedHighlightsRef.current.add(highlight.id);
        }
    }, [highlightsBySpineIndex, renderedHighlightsRef]);

    const scheduleHighlightInjection = useCallback((chapterEl: HTMLElement, spineIndex: number) => {
        if (!highlightDirtyChaptersRef.current.has(spineIndex)) return;
        if ((highlightsBySpineIndex.get(spineIndex)?.length ?? 0) === 0) return;
        if (highlightIdleHandlesRef.current.has(spineIndex)) return;

        const handle = scheduleIdleTask(() => {
            highlightIdleHandlesRef.current.delete(spineIndex);
            if (!highlightDirtyChaptersRef.current.has(spineIndex)) return;
            highlightDirtyChaptersRef.current.delete(spineIndex);
            applyHighlightsToChapter(chapterEl, spineIndex);
        }, { timeoutMs: HIGHLIGHT_IDLE_TIMEOUT_MS });
        highlightIdleHandlesRef.current.set(spineIndex, handle);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [applyHighlightsToChapter, highlightsBySpineIndex]);

    useLayoutEffect(() => {
        const listEl = chapterListRef.current;
        if (!listEl) return;

        const mountedChapters = chapters.filter(ch => ch.status === 'mounted');
        for (const ch of mountedChapters) {
            if ((highlightsBySpineIndex.get(ch.spineIndex)?.length ?? 0) === 0) continue;
            const el = listEl.querySelector(`[data-chapter-id="${ch.id}"]`) as HTMLElement | null;
            if (el) {
                highlightDirtyChaptersRef.current.add(ch.spineIndex);
                scheduleHighlightInjection(el, ch.spineIndex);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [chapters, highlightsBySpineIndex, scheduleHighlightInjection]);

    return { scheduleHighlightInjection };
}
