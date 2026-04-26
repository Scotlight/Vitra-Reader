import { useState, useCallback, useRef } from 'react';
import { db, type Highlight } from '@/services/storageService';
import { findTextInDOM, highlightRange } from '@/utils/textFinder';
import { getProviderLabel, translateText } from '@/services/translateService';
import { SelectionMenu } from '@/components/Reader/SelectionMenu';
import { NoteDialog } from '@/components/Reader/NoteDialog';
import { TranslationDialog } from '@/components/Reader/TranslationDialog';

// ── 类型定义 ──

export interface SelectionMenuState {
    visible: boolean;
    x: number;
    y: number;
    text: string;
    spineIndex: number;
}

export interface NoteDialogState {
    visible: boolean;
    text: string;
    spineIndex: number;
}

export interface TranslateDialogState {
    visible: boolean;
    sourceText: string;
    translatedText: string;
    loading: boolean;
    error: string;
    providerLabel: string;
    fromCache: boolean;
}

export interface UseSelectionMenuOptions {
    bookId: string;
    onSelectionSearch?: (keyword: string) => void;
    /** 根据 spineIndex 获取高亮渲染的 DOM 容器 */
    getHighlightContainer: (spineIndex: number) => HTMLElement | null;
    onHighlightCreated?: (highlight: Highlight, spineIndex: number) => void;
}

const INITIAL_SELECTION: SelectionMenuState = { visible: false, x: 0, y: 0, text: '', spineIndex: -1 };
const INITIAL_NOTE: NoteDialogState = { visible: false, text: '', spineIndex: -1 };
const INITIAL_TRANSLATE: TranslateDialogState = {
    visible: false, sourceText: '', translatedText: '',
    loading: false, error: '', providerLabel: '-', fromCache: false,
};

export function useSelectionMenu({ bookId, onSelectionSearch, getHighlightContainer, onHighlightCreated }: UseSelectionMenuOptions) {
    const [selectionMenu, setSelectionMenu] = useState<SelectionMenuState>(INITIAL_SELECTION);
    const [noteDialog, setNoteDialog] = useState<NoteDialogState>(INITIAL_NOTE);
    const [translateDialog, setTranslateDialog] = useState<TranslateDialogState>(INITIAL_TRANSLATE);
    const renderedHighlightsRef = useRef<Set<string>>(new Set());

    // ── Handlers ──

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
        const cfiRange = `vitra:${spineIndex}`;
        const createdAt = Date.now();

        await db.highlights.add({
            id, bookId, cfiRange, color, text, createdAt,
        });
        onHighlightCreated?.({
            id,
            bookId,
            cfiRange,
            color,
            text,
            createdAt,
        }, spineIndex);

        const container = getHighlightContainer(spineIndex);
        if (container) {
            const range = findTextInDOM(container, text);
            if (range) {
                highlightRange(range, id, color);
                renderedHighlightsRef.current.add(id);
            }
        }
        dismissMenu();
    }, [selectionMenu, bookId, getHighlightContainer, dismissMenu, onHighlightCreated]);

    const handleAddNote = useCallback(() => {
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
            location: `vitra:${noteDialog.spineIndex}`,
            title: noteDialog.text.slice(0, 80),
            note,
            createdAt: Date.now(),
        });
        setNoteDialog(INITIAL_NOTE);
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

    const runTranslate = useCallback(async (text: string) => {
        const sourceText = text.trim();
        if (!sourceText) return;

        setTranslateDialog({
            visible: true, sourceText, translatedText: '',
            loading: true, error: '', providerLabel: '-', fromCache: false,
        });

        try {
            const result = await translateText(sourceText);
            if (!result.ok) {
                setTranslateDialog((prev) => ({
                    ...prev,
                    loading: false,
                    error: result.error || '翻译失败',
                    providerLabel: getProviderLabel(result.provider),
                    fromCache: false,
                }));
                return;
            }
            setTranslateDialog((prev) => ({
                ...prev,
                loading: false,
                error: '',
                translatedText: result.translatedText,
                providerLabel: getProviderLabel(result.provider),
                fromCache: result.fromCache,
            }));
        } catch (error: unknown) {
            setTranslateDialog((prev) => ({
                ...prev,
                loading: false,
                error: error instanceof Error ? error.message : '翻译请求异常',
            }));
        }
    }, []);

    const handleTranslate = useCallback(() => {
        const text = selectionMenu.text.trim();
        if (!text) return;
        void runTranslate(text);
        dismissMenu();
    }, [selectionMenu.text, dismissMenu, runTranslate]);

    // ── JSX 渲染 ──

    const renderSelectionUI = () => (
        <>
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
                onCancel={() => setNoteDialog(INITIAL_NOTE)}
            />
            <TranslationDialog
                visible={translateDialog.visible}
                sourceText={translateDialog.sourceText}
                translatedText={translateDialog.translatedText}
                providerLabel={translateDialog.providerLabel}
                fromCache={translateDialog.fromCache}
                loading={translateDialog.loading}
                error={translateDialog.error}
                onRetry={() => void runTranslate(translateDialog.sourceText)}
                onClose={() => setTranslateDialog((prev) => ({ ...prev, visible: false }))}
            />
        </>
    );

    return {
        selectionMenu,
        setSelectionMenu,
        noteDialog,
        translateDialog,
        renderedHighlightsRef,
        dismissMenu,
        runTranslate,
        renderSelectionUI,
    };
}
