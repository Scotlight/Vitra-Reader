import { useCallback, useEffect, useMemo } from 'react';
import type { MutableRefObject } from 'react';
import type { ContentProvider } from '@/engine/core/contentProvider';
import { buildChapterMetaVector } from '@/engine/render/metaVectorManager';
import type { ChapterMetaVector } from '@/engine/types/vectorRender';
import { createWindowedVectorChapterShell, type ReaderStyleConfig } from '../ShadowRenderer';
import {
    canRestoreWindowedVectorPlaceholder,
    partitionStyleChangeTargets,
    shouldBypassShadowQueueForSegmentMetas,
} from '../scrollVectorStrategy';
import { loadPreprocessedChapterContent } from './chapterContentLoader';
import type { LoadedChapter } from './scrollReaderTypes';
import {
    beginChapterLoad,
    getPredictivePrefetchCandidates,
    hasActiveChapterLoad,
    markScrollPipelineIdle,
    markScrollPipelineRenderingOffscreen,
    releaseChapterLoadLock,
    resolveChapterLoadDirection,
} from './scrollPipelineRuntime';
import type { ScrollReaderRefs } from './useScrollReaderRefs';

interface UseChapterLoaderOptions {
    provider: ContentProvider;
    readerStyles: ReaderStyleConfig;
    currentSpineIndex: number;
    isInitialized: boolean;
    chapterVectorsRef: MutableRefObject<Map<string, ChapterMetaVector>>;
    renderedHighlightsRef: MutableRefObject<Set<string>>;
    setChapters: (updater: (prev: LoadedChapter[]) => LoadedChapter[]) => void;
    setShadowQueue: (updater: (prev: LoadedChapter[]) => LoadedChapter[]) => void;
    scheduleIdlePrefetch: (task: () => void) => void;
    cancelIdlePrefetch: () => void;
}

function buildReaderStyleKey(readerStyles: ReaderStyleConfig): string {
    return [
        `fontSize=${readerStyles.fontSize}`,
        `pageWidth=${readerStyles.pageWidth}`,
        `lineHeight=${readerStyles.lineHeight}`,
        `paragraphSpacing=${readerStyles.paragraphSpacing}`,
        `textIndentEm=${readerStyles.textIndentEm}`,
        `letterSpacing=${readerStyles.letterSpacing}`,
        `textAlign=${readerStyles.textAlign}`,
        `fontFamily=${encodeURIComponent(readerStyles.fontFamily)}`,
        `textColor=${readerStyles.textColor}`,
        `bgColor=${readerStyles.bgColor}`,
        `isPdfDarkMode=${readerStyles.isPdfDarkMode ? '1' : '0'}`,
    ].join('|');
}

function buildLoadingChapter(
    spineIndex: number,
    chapterId: string,
    existingChapter: LoadedChapter | undefined,
    currentReaderStyleKey: string,
): LoadedChapter {
    return {
        spineIndex,
        id: chapterId,
        htmlContent: '',
        htmlFragments: [],
        externalStyles: existingChapter?.externalStyles || [],
        segmentMetas: existingChapter?.segmentMetas,
        vectorStyleKey: existingChapter?.vectorStyleKey ?? currentReaderStyleKey,
        domNode: null,
        height: existingChapter?.height || 0,
        status: 'loading',
    };
}

function updateChapterBySpineIndex(
    prev: LoadedChapter[],
    spineIndex: number,
    updater: (chapter: LoadedChapter) => LoadedChapter,
): LoadedChapter[] {
    return prev.map(ch => ch.spineIndex === spineIndex ? updater(ch) : ch);
}

function applyLoadingChapter(
    prev: LoadedChapter[],
    loadingChapter: LoadedChapter,
    spineIndex: number,
    direction: 'prev' | 'next' | 'initial',
    existingChapter: LoadedChapter | undefined,
): LoadedChapter[] {
    if (existingChapter) {
        return updateChapterBySpineIndex(prev, spineIndex, () => loadingChapter);
    }
    if (direction === 'prev') return [loadingChapter, ...prev];
    return [...prev, loadingChapter];
}

function buildReadyWindowedVectorChapter(options: {
    chapterId: string;
    spineIndex: number;
    baseChapter: LoadedChapter;
    externalStyles: string[];
    readerStyles: ReaderStyleConfig;
    segmentMetas: NonNullable<LoadedChapter['segmentMetas']>;
}): { chapter: LoadedChapter; vector: ChapterMetaVector } {
    const { node, height } = createWindowedVectorChapterShell({
        chapterId: options.chapterId,
        externalStyles: options.externalStyles,
        readerStyles: options.readerStyles,
        segmentMetas: options.segmentMetas,
    });
    return {
        chapter: {
            ...options.baseChapter,
            domNode: node,
            height,
            status: 'ready',
        },
        vector: buildChapterMetaVector(options.chapterId, options.spineIndex, options.segmentMetas),
    };
}

/**
 * 章节加载编排：
 * - loadChapter: 单章节按需加载 (支持 prev/next/initial 方向、forceReload)
 *   * placeholder 快速恢复通路（windowed vector shell 直接复用旧 segmentMetas）
 *   * worker 预处理 + 向量化
 *   * 分流 shadow 渲染队列 / 直接 ready（取决于 segmentMetas 可否 bypass）
 * - readerStyles 变化：区分 shadow 重渲染与 vector 重载
 * - runPredictivePrefetch: 当前 spine 前后各一章的惰性预取
 * - 初始化后触发一次 idle 预取
 */
export function useChapterLoader(
    refs: ScrollReaderRefs,
    options: UseChapterLoaderOptions,
) {
    const {
        provider,
        readerStyles,
        currentSpineIndex,
        isInitialized,
        chapterVectorsRef,
        renderedHighlightsRef,
        setChapters,
        setShadowQueue,
        scheduleIdlePrefetch,
        cancelIdlePrefetch,
    } = options;
    const {
        spineItemsRef,
        chaptersRef,
        readerStylesKeyRef,
        pendingReadyRef,
        isUserScrollingRef,
    } = refs;
    const readerStyleKey = useMemo(() => buildReaderStyleKey(readerStyles), [readerStyles]);

    const loadChapter = useCallback(async (
        spineIndex: number,
        direction: 'prev' | 'next' | 'initial',
        forceReload = false,
    ) => {
        if (hasActiveChapterLoad(refs, spineIndex)) return;
        const currentSpineItems = spineItemsRef.current;
        if (spineIndex < 0 || spineIndex >= currentSpineItems.length) return;

        const existingChapter = chaptersRef.current.find(ch => ch.spineIndex === spineIndex);
        if (existingChapter && existingChapter.status !== 'placeholder' && !forceReload) return;
        const currentReaderStyleKey = readerStyleKey;
        beginChapterLoad(refs, spineIndex);

        const chapterId = `ch-${spineIndex}`;

        const loadingChapter = buildLoadingChapter(
            spineIndex,
            chapterId,
            existingChapter,
            currentReaderStyleKey,
        );

        setChapters(prev => applyLoadingChapter(prev, loadingChapter, spineIndex, direction, existingChapter));

        try {
            if (!forceReload && canRestoreWindowedVectorPlaceholder(existingChapter, currentReaderStyleKey)) {
                const restoredMetas = existingChapter?.segmentMetas;
                if (restoredMetas && restoredMetas.length > 0) {
                    const ready = buildReadyWindowedVectorChapter({
                        chapterId,
                        spineIndex,
                        baseChapter: loadingChapter,
                        externalStyles: existingChapter.externalStyles,
                        readerStyles,
                        segmentMetas: restoredMetas,
                    });
                    chapterVectorsRef.current.set(chapterId, ready.vector);
                    setChapters(prev => updateChapterBySpineIndex(prev, spineIndex, () => ready.chapter));
                    markScrollPipelineIdle(refs);
                    return;
                }
            }

            const preprocessed = await loadPreprocessedChapterContent({
                provider,
                chapterId,
                spineIndex,
                chapterHref: currentSpineItems[spineIndex]?.href,
                readerStyles,
            });

            const loaded: LoadedChapter = {
                ...loadingChapter,
                htmlContent: preprocessed.htmlContent,
                htmlFragments: preprocessed.htmlFragments,
                externalStyles: preprocessed.externalStyles,
                segmentMetas: preprocessed.segmentMetas,
                vectorStyleKey: currentReaderStyleKey,
                status: 'shadow-rendering',
            };

            if (shouldBypassShadowQueueForSegmentMetas(preprocessed.segmentMetas)) {
                const vectorMetas = preprocessed.segmentMetas || [];
                const ready = buildReadyWindowedVectorChapter({
                    chapterId,
                    spineIndex,
                    baseChapter: loaded,
                    externalStyles: preprocessed.externalStyles,
                    readerStyles,
                    segmentMetas: vectorMetas,
                });
                chapterVectorsRef.current.set(chapterId, ready.vector);
                setChapters(prev =>
                    updateChapterBySpineIndex(prev, spineIndex, () => ready.chapter)
                );
                setShadowQueue(prev => prev.filter(ch => ch.spineIndex !== spineIndex));
                markScrollPipelineIdle(refs);
            } else {
                setChapters(prev =>
                    updateChapterBySpineIndex(prev, spineIndex, () => loaded)
                );
                setShadowQueue(prev => [...prev.filter(ch => ch.spineIndex !== spineIndex), loaded]);

                markScrollPipelineRenderingOffscreen(refs);
            }
        } catch (error) {
            console.error(`[ScrollReader] Failed to load chapter ${spineIndex}:`, error);
            // 将章节标记为 error 状态，渲染层显示错误占位，避免用户看到空白页
            setChapters(prev =>
                updateChapterBySpineIndex(prev, spineIndex, ch =>
                    ({ ...ch, status: 'error' as const })
                )
            );
            markScrollPipelineIdle(refs);
        } finally {
            releaseChapterLoadLock(refs, spineIndex);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [provider, readerStyles, readerStyleKey]);

    useEffect(() => {
        const nextKey = readerStyleKey;
        if (readerStylesKeyRef.current === '' || readerStylesKeyRef.current === nextKey) {
            readerStylesKeyRef.current = nextKey;
            return;
        }
        readerStylesKeyRef.current = nextKey;

        const rerenderTargets = chaptersRef.current.filter((chapter) =>
            chapter.status === 'mounted' || chapter.status === 'ready'
        );
        if (rerenderTargets.length === 0) return;

        const partition = partitionStyleChangeTargets(rerenderTargets);
        const shadowTargets = partition.shadowRerenderTargets;
        const vectorTargets = partition.vectorReloadTargets;

        const rerenderIndexes = new Set(shadowTargets.map((chapter) => chapter.spineIndex));
        const rerenderQueue = shadowTargets.map((chapter) => ({
            ...chapter,
            domNode: null,
            vectorStyleKey: nextKey,
            status: 'shadow-rendering' as const,
        }));

        renderedHighlightsRef.current.clear();
        if (rerenderIndexes.size > 0) {
            pendingReadyRef.current = pendingReadyRef.current.filter((item) => !rerenderIndexes.has(item.spineIndex));
            setShadowQueue((prev) => [
                ...prev.filter((chapter) => !rerenderIndexes.has(chapter.spineIndex)),
                ...rerenderQueue,
            ]);
            setChapters((prev) => prev.map((chapter) =>
                rerenderIndexes.has(chapter.spineIndex)
                    ? { ...chapter, domNode: null, vectorStyleKey: nextKey, status: 'shadow-rendering' as const }
                    : chapter
            ));
        }

        vectorTargets.forEach((chapter) => {
            const direction = resolveChapterLoadDirection(chapter.spineIndex, currentSpineIndex);
            void loadChapter(chapter.spineIndex, direction, true);
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentSpineIndex, loadChapter, readerStyleKey, renderedHighlightsRef]);

    const runPredictivePrefetch = useCallback(() => {
        if (isUserScrollingRef.current) return;

        const candidateIndexes = getPredictivePrefetchCandidates(currentSpineIndex, spineItemsRef.current.length);
        if (candidateIndexes.length === 0) return;

        candidateIndexes.forEach((index) => {
            if (hasActiveChapterLoad(refs, index)) return;
            const existing = chaptersRef.current.find((chapter) => chapter.spineIndex === index);
            if (existing && existing.status !== 'placeholder') return;
            void loadChapter(index, resolveChapterLoadDirection(index, currentSpineIndex));
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentSpineIndex, loadChapter]);

    useEffect(() => {
        if (!isInitialized) return;
        scheduleIdlePrefetch(() => {
            runPredictivePrefetch();
        });
        return () => {
            cancelIdlePrefetch();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isInitialized, currentSpineIndex, runPredictivePrefetch, scheduleIdlePrefetch, cancelIdlePrefetch]);

    return { loadChapter, runPredictivePrefetch };
}
