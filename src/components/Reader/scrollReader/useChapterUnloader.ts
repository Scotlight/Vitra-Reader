import { useEffect } from 'react';
import type { ContentProvider } from '@/engine/core/contentProvider';
import type { LoadedChapter } from './scrollReaderTypes';
import type { ScrollReaderRefs } from './useScrollReaderRefs';
import { markChapterAsPlaceholder, resolveChapterPlaceholderHeight } from './scrollReaderHelpers';
import { UNLOAD_ABOVE_RADIUS, UNLOAD_BELOW_RADIUS, UNLOAD_COOLDOWN_MS } from './scrollReaderConstants';
import { segmentPool } from '../ShadowRenderer';
import { releaseMediaResources } from '@/utils/mediaResourceCleanup';
import { cancelIdleTask } from '@/utils/idleScheduler';

interface UseChapterUnloaderOptions {
    provider: ContentProvider;
    currentSpineIndex: number;
    cleanupVirtualChapterRuntime: (chapterId: string) => void;
    unobserveChapterResizeNodes: (chapterEl: HTMLElement | null) => void;
    chapterVectorsRef: { current: Map<string, unknown> };
    setChapters: (updater: (prev: LoadedChapter[]) => LoadedChapter[]) => void;
}

/**
 * 周期性检查当前 spine 周围哪些章节可以回收到 placeholder 状态，释放 DOM、
 * 段池、媒体资源、章节 meta vector 和 Provider 级资源。
 *
 * 卸载策略：
 * - 上方章节保留 UNLOAD_ABOVE_RADIUS 章缓冲（避免回滚频繁重挂载）
 * - 下方章节只保留 UNLOAD_BELOW_RADIUS 章（下方消失不影响 scrollTop）
 * - 惯性滚动期间禁止卸载（防止高度真空导致坐标系崩溃）
 * - 最近挂载 UNLOAD_COOLDOWN_MS 内的章节跳过
 */
export function useChapterUnloader(
    refs: ScrollReaderRefs,
    options: UseChapterUnloaderOptions,
) {
    const {
        provider,
        currentSpineIndex,
        cleanupVirtualChapterRuntime,
        unobserveChapterResizeNodes,
        chapterVectorsRef,
        setChapters,
    } = options;
    const {
        chaptersRef,
        chapterListRef,
        isUserScrollingRef,
        highlightIdleHandlesRef,
        highlightDirtyChaptersRef,
    } = refs;

    useEffect(() => {
        const checkUnload = () => {
            const currentChapters = chaptersRef.current;
            const mountedChapters = currentChapters.filter(ch => ch.status === 'mounted');
            const now = Date.now();
            const toUnload = mountedChapters
                .filter(ch => {
                    if (isUserScrollingRef.current) return false;
                    const dist = ch.spineIndex - currentSpineIndex;
                    const radius = dist < 0 ? UNLOAD_ABOVE_RADIUS : UNLOAD_BELOW_RADIUS;
                    return Math.abs(dist) > radius
                        && (!ch.mountedAt || now - ch.mountedAt > UNLOAD_COOLDOWN_MS);
                })
                .sort((a, b) =>
                    Math.abs(b.spineIndex - currentSpineIndex) - Math.abs(a.spineIndex - currentSpineIndex)
                );

            if (toUnload.length === 0) return;

            const listEl = chapterListRef.current;
            toUnload.forEach(ch => {
                const idleHandle = highlightIdleHandlesRef.current.get(ch.spineIndex);
                if (idleHandle !== undefined) {
                    cancelIdleTask(idleHandle);
                    highlightIdleHandlesRef.current.delete(ch.spineIndex);
                }
                highlightDirtyChaptersRef.current.delete(ch.spineIndex);
                cleanupVirtualChapterRuntime(ch.id);
                if (listEl) {
                    const domEl = listEl.querySelector(`[data-chapter-id="${ch.id}"]`) as HTMLElement | null;
                    if (domEl) {
                        unobserveChapterResizeNodes(domEl);
                        domEl.querySelectorAll('section[data-shadow-segment-index]').forEach(seg => {
                            segmentPool.release(seg as HTMLElement);
                        });
                        releaseMediaResources(domEl);
                        markChapterAsPlaceholder(domEl, ch.height);
                    }
                }
                provider.unloadChapter(ch.spineIndex);
                chapterVectorsRef.current.delete(ch.id);
            });

            const unloadIds = new Set(toUnload.map(ch => ch.spineIndex));
            setChapters(prev => prev.map(ch => {
                if (!unloadIds.has(ch.spineIndex)) return ch;
                return {
                    ...ch,
                    htmlContent: '',
                    htmlFragments: [],
                    domNode: null,
                    height: resolveChapterPlaceholderHeight(ch.height),
                    status: 'placeholder',
                };
            }));

            console.log(`[ScrollReader] Collapsed to placeholders: ${toUnload.map(ch => ch.spineIndex).join(', ')}`);
        };

        const timer = setTimeout(checkUnload, UNLOAD_COOLDOWN_MS);
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cleanupVirtualChapterRuntime, currentSpineIndex, provider, unobserveChapterResizeNodes]);
}
