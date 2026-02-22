import { useState, useCallback, useRef } from 'react';
import { ChapterState, ChapterStatus } from '../types/chapter';

/**
 * 章节管理器配置
 */
interface ChapterManagerConfig {
  maxChapters: number;  // 最多同时渲染的章节数
  unloadDistance: number;  // 距离视口多少个章节后卸载
}

const DEFAULT_CONFIG: ChapterManagerConfig = {
  maxChapters: 5,
  unloadDistance: 3
};

/**
 * useChapterManager Hook
 * 职责：管理章节队列，触发预加载，维护章节生命周期
 */
export function useChapterManager(
  epubBook: any,  // epub.js Book 实例
  currentChapterIndex: number,
  config: ChapterManagerConfig = DEFAULT_CONFIG
) {
  const [chapters, setChapters] = useState<ChapterState[]>([]);
  const loadingChapters = useRef<Set<number>>(new Set());

  /**
   * 加载上一章
   */
  const loadPreviousChapter = useCallback(async () => {
    if (!epubBook) {
      console.warn('[ChapterManager] No epub book instance');
      return;
    }

    // 找到当前最早的章节
    const earliestChapter = chapters.reduce((min, ch) => 
      ch.index < min.index ? ch : min, 
      chapters[0] || { index: currentChapterIndex }
    );

    const prevIndex = earliestChapter.index - 1;

    // 检查是否已经是第一章
    if (prevIndex < 0) {
      console.log('[ChapterManager] Already at first chapter');
      return;
    }

    // 检查是否正在加载
    if (loadingChapters.current.has(prevIndex)) {
      console.log('[ChapterManager] Chapter already loading:', prevIndex);
      return;
    }

    // 检查是否已经加载
    if (chapters.some(ch => ch.index === prevIndex)) {
      console.log('[ChapterManager] Chapter already loaded:', prevIndex);
      return;
    }

    try {
      loadingChapters.current.add(prevIndex);

      // 更新状态为 PRE_FETCHING
      const newChapter: ChapterState = {
        id: `chapter-${prevIndex}`,
        index: prevIndex,
        status: ChapterStatus.PRE_FETCHING,
        htmlContent: '',
        height: 0,
        domNode: null,
        loadedAt: Date.now()
      };

      setChapters(prev => [newChapter, ...prev]);

      // 从 epub.js 获取章节内容
      // 注意：这里需要根据实际的 epub.js API 调整
      const spine = epubBook.spine;
      const spineItem = spine.get(prevIndex);
      
      if (!spineItem) {
        throw new Error(`Chapter ${prevIndex} not found in spine`);
      }

      // 加载章节内容
      const section = epubBook.section(spineItem.href);
      await section.load();
      const htmlContent = await section.render();

      // 更新章节状态
      setChapters(prev => prev.map(ch => 
        ch.index === prevIndex
          ? { ...ch, htmlContent, status: ChapterStatus.RENDERING_OFFSCREEN }
          : ch
      ));

      console.log('[ChapterManager] Loaded previous chapter:', prevIndex);
    } catch (error) {
      console.error('[ChapterManager] Error loading previous chapter:', error);
      
      // 移除失败的章节
      setChapters(prev => prev.filter(ch => ch.index !== prevIndex));
    } finally {
      loadingChapters.current.delete(prevIndex);
    }
  }, [epubBook, chapters, currentChapterIndex]);

  /**
   * 加载下一章
   */
  const loadNextChapter = useCallback(async () => {
    if (!epubBook) {
      console.warn('[ChapterManager] No epub book instance');
      return;
    }

    // 找到当前最晚的章节
    const latestChapter = chapters.reduce((max, ch) => 
      ch.index > max.index ? ch : max, 
      chapters[0] || { index: currentChapterIndex }
    );

    const nextIndex = latestChapter.index + 1;

    // 检查是否已经是最后一章
    const totalChapters = epubBook.spine?.length || 0;
    if (nextIndex >= totalChapters) {
      console.log('[ChapterManager] Already at last chapter');
      return;
    }

    // 检查是否正在加载
    if (loadingChapters.current.has(nextIndex)) {
      console.log('[ChapterManager] Chapter already loading:', nextIndex);
      return;
    }

    // 检查是否已经加载
    if (chapters.some(ch => ch.index === nextIndex)) {
      console.log('[ChapterManager] Chapter already loaded:', nextIndex);
      return;
    }

    try {
      loadingChapters.current.add(nextIndex);

      // 更新状态为 PRE_FETCHING
      const newChapter: ChapterState = {
        id: `chapter-${nextIndex}`,
        index: nextIndex,
        status: ChapterStatus.PRE_FETCHING,
        htmlContent: '',
        height: 0,
        domNode: null,
        loadedAt: Date.now()
      };

      setChapters(prev => [...prev, newChapter]);

      // 从 epub.js 获取章节内容
      const spine = epubBook.spine;
      const spineItem = spine.get(nextIndex);
      
      if (!spineItem) {
        throw new Error(`Chapter ${nextIndex} not found in spine`);
      }

      // 加载章节内容
      const section = epubBook.section(spineItem.href);
      await section.load();
      const htmlContent = await section.render();

      // 更新章节状态
      setChapters(prev => prev.map(ch => 
        ch.index === nextIndex
          ? { ...ch, htmlContent, status: ChapterStatus.RENDERING_OFFSCREEN }
          : ch
      ));

      console.log('[ChapterManager] Loaded next chapter:', nextIndex);
    } catch (error) {
      console.error('[ChapterManager] Error loading next chapter:', error);
      
      // 移除失败的章节
      setChapters(prev => prev.filter(ch => ch.index !== nextIndex));
    } finally {
      loadingChapters.current.delete(nextIndex);
    }
  }, [epubBook, chapters, currentChapterIndex]);

  /**
   * 卸载距离视口较远的章节
   */
  const unloadDistantChapters = useCallback(() => {
    const { maxChapters, unloadDistance } = config;

    // 如果章节数未超过限制，不卸载
    if (chapters.length <= maxChapters) {
      return;
    }

    // 找到距离当前章节最远的章节
    const sortedByDistance = [...chapters].sort((a, b) => {
      const distA = Math.abs(a.index - currentChapterIndex);
      const distB = Math.abs(b.index - currentChapterIndex);
      return distB - distA;
    });

    // 卸载距离超过阈值的章节
    const toUnload = sortedByDistance.filter(ch => 
      Math.abs(ch.index - currentChapterIndex) > unloadDistance
    );

    if (toUnload.length > 0) {
      console.log('[ChapterManager] Unloading chapters:', toUnload.map(ch => ch.index));

      setChapters(prev => prev.filter(ch => 
        !toUnload.some(unload => unload.index === ch.index)
      ));

      // 清理 DOM 引用
      toUnload.forEach(ch => {
        if (ch.domNode) {
          ch.domNode.remove();
        }
      });
    }
  }, [chapters, currentChapterIndex, config]);

  /**
   * 更新章节状态
   */
  const updateChapterStatus = useCallback((
    chapterIndex: number,
    status: ChapterStatus,
    updates?: Partial<ChapterState>
  ) => {
    setChapters(prev => prev.map(ch => 
      ch.index === chapterIndex
        ? { ...ch, status, ...updates }
        : ch
    ));
  }, []);

  return {
    chapters,
    loadPreviousChapter,
    loadNextChapter,
    unloadDistantChapters,
    updateChapterStatus
  };
}
