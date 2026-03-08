import { useEffect, useRef, useState } from 'react';
import { Book } from 'epubjs';
import { useChapterManager } from '../../hooks/useChapterManager';
import { useScrollCompensator } from '../../hooks/useScrollCompensator';
import { useScrollInertia } from '../../hooks/useScrollInertia';
import { useScrollEvents } from '../../hooks/useScrollEvents';
import { useRenderPipeline } from '../../hooks/useRenderPipeline';
import { ShadowRenderer } from './ShadowRenderer';
import { ChapterStatus } from '../../types/chapter';
import { RenderPipelineState } from '../../engine/types/renderPipeline';
import { shouldPreloadChapter, detectScrollDirection } from '../../utils/scrollDetection';
import { injectCSSOverride, removeCSSOverride } from '../../utils/styleProcessor';
import styles from './ScrolledContinuousReader.module.css';

interface ScrolledContinuousReaderProps {
  book: Book;
  initialChapterIndex: number;
  onProgressChange?: (progress: number) => void;
  onChapterChange?: (chapterIndex: number) => void;
  textColor: string;
  bgColor: string;
  fontSize: number;
  fontFamily: string;
  lineHeight: number;
  letterSpacing: number;
  paragraphSpacing: number;
  textIndentEm?: number;
  pageWidth: number;
  textAlign: string;
}

/**
 * ScrolledContinuousReader - 双向无限滚动阅读器
 * 实现 Shadow Realm Pattern 和原子化章节插入
 */
export function ScrolledContinuousReader({
  book,
  initialChapterIndex,
  onProgressChange,
  onChapterChange,
  textColor,
  bgColor,
  fontSize,
  fontFamily,
  lineHeight,
  letterSpacing,
  paragraphSpacing,
  textIndentEm = 0,
  pageWidth,
  textAlign
}: ScrolledContinuousReaderProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const previousScrollTop = useRef(0);
  const [currentChapterIndex, setCurrentChapterIndex] = useState(initialChapterIndex);
  const [isInitialized, setIsInitialized] = useState(false);

  // 初始化核心 Hooks
  const chapterManager = useChapterManager(book, currentChapterIndex);
  const scrollCompensator = useScrollCompensator(viewportRef);
  const scrollInertia = useScrollInertia(viewportRef);
  const renderPipeline = useRenderPipeline();

  // 事件处理
  useScrollEvents(viewportRef, {
    onWheelImpulse: (deltaY) => {
      scrollInertia.addImpulse(deltaY);
    },
    onTouchFling: (velocity) => {
      if (Math.abs(velocity) > 0.5 && renderPipeline.canInteract()) {
        scrollInertia.fling(velocity);
        renderPipeline.transition(RenderPipelineState.FLINGING);
      }
    },
    onDragStart: () => {
      scrollInertia.setDragging(true);
    },
    onDragEnd: () => {
      scrollInertia.setDragging(false);
      if (renderPipeline.state === RenderPipelineState.FLINGING) {
        renderPipeline.transition(RenderPipelineState.IDLE);
      }
    }
  });

  // 初始化：加载初始章节
  useEffect(() => {
    if (!book || isInitialized) return;

    const initializeReader = async () => {
      try {
        // 加载当前章节
        await chapterManager.loadNextChapter();
        setIsInitialized(true);
      } catch (error) {
        console.error('[ScrolledContinuousReader] Initialization failed:', error);
      }
    };

    initializeReader();
  }, [book, isInitialized, chapterManager]);

  // 滚动监听 - 触发预加载
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !isInitialized) return;

    const handleScroll = () => {
      const scrollTop = viewport.scrollTop;
      const viewportHeight = viewport.clientHeight;
      const contentHeight = viewport.scrollHeight;
      
      const direction = detectScrollDirection(scrollTop, previousScrollTop.current);
      previousScrollTop.current = scrollTop;

      // 检查是否需要预加载
      if (shouldPreloadChapter(scrollTop, viewportHeight, contentHeight, direction)) {
        if (direction === 'up' && !renderPipeline.isLoading()) {
          renderPipeline.transition(RenderPipelineState.PRE_FETCHING);
          chapterManager.loadPreviousChapter();
        } else if (direction === 'down' && !renderPipeline.isLoading()) {
          renderPipeline.transition(RenderPipelineState.PRE_FETCHING);
          chapterManager.loadNextChapter();
        }
      }

      // 卸载远离的章节
      chapterManager.unloadDistantChapters();

      // 计算进度
      if (onProgressChange) {
        const progress = scrollTop / (contentHeight - viewportHeight);
        onProgressChange(Math.max(0, Math.min(1, progress)));
      }
    };

    viewport.addEventListener('scroll', handleScroll, { passive: true });
    return () => viewport.removeEventListener('scroll', handleScroll);
  }, [isInitialized, chapterManager, renderPipeline, onProgressChange]);

  // 监听章节变化
  useEffect(() => {
    const mountedChapters = chapterManager.chapters.filter(
      ch => ch.status === ChapterStatus.MOUNTED
    );

    if (mountedChapters.length > 0) {
      // 找到视口中心的章节
      const viewport = viewportRef.current;
      if (viewport) {
        const centerY = viewport.scrollTop + viewport.clientHeight / 2;
        let currentChapter = mountedChapters[0];
        let minDistance = Infinity;

        mountedChapters.forEach(ch => {
          if (ch.domNode) {
            const rect = ch.domNode.getBoundingClientRect();
            const chapterCenterY = rect.top + rect.height / 2;
            const distance = Math.abs(chapterCenterY - centerY);

            if (distance < minDistance) {
              minDistance = distance;
              currentChapter = ch;
            }
          }
        });

        if (currentChapter.index !== currentChapterIndex) {
          setCurrentChapterIndex(currentChapter.index);
          if (onChapterChange) {
            onChapterChange(currentChapter.index);
          }
        }
      }
    }
  }, [chapterManager.chapters, currentChapterIndex, onChapterChange]);

  // Cleanup: 移除所有注入的样式
  useEffect(() => {
    return () => {
      chapterManager.chapters.forEach(ch => {
        removeCSSOverride(ch.id);
      });
    };
  }, [chapterManager.chapters]);

  const handleChapterReady = (chapterIndex: number, node: HTMLElement, height: number) => {
    // 更新章节状态为 READY
    chapterManager.updateChapterStatus(
      chapterIndex,
      ChapterStatus.READY,
      { domNode: node, height }
    );

    // 注入 CSS Override
    const chapter = chapterManager.chapters.find(ch => ch.index === chapterIndex);
    if (chapter) {
      injectCSSOverride(chapter.id);
    }

    // 执行 DOM 插入 + 滚动补偿
    renderPipeline.transition(RenderPipelineState.ANCHORING_LOCKED);
    
    // 使用 requestAnimationFrame 确保在下一帧执行
    requestAnimationFrame(() => {
      try {
        if (chapterIndex < currentChapterIndex) {
          // 向上滚动：前置插入
          scrollCompensator.prependChapterAtomic(node);
        } else {
          // 向下滚动：追加
          scrollCompensator.appendChapterAtomic(node);
        }

        // 更新状态为 MOUNTED
        chapterManager.updateChapterStatus(
          chapterIndex,
          ChapterStatus.MOUNTED
        );

        // 解锁渲染管道
        renderPipeline.transition(RenderPipelineState.IDLE);
      } catch (error) {
        console.error('[ScrolledContinuousReader] Chapter insertion failed:', error);
        renderPipeline.reset();
      }
    });
  };

  const handleChapterError = (chapterIndex: number, error: Error) => {
    console.error(`[ScrolledContinuousReader] Chapter ${chapterIndex} render failed:`, error);
    renderPipeline.reset();
  };

  // 构建内容样式
  const contentStyle = {
    '--text-color': textColor,
    '--bg-color': bgColor,
    '--font-size': `${fontSize}px`,
    '--font-family': fontFamily,
    '--line-height': lineHeight,
    '--letter-spacing': `${letterSpacing}px`,
    '--paragraph-spacing': `${paragraphSpacing}px`,
    '--page-width': `${Math.round((pageWidth / 3) * 100)}%`,
    '--text-align': textAlign
  } as React.CSSProperties;

  return (
    <div
      ref={viewportRef}
      className={styles.viewport}
      style={contentStyle}
      data-locked={!renderPipeline.canInteract()}
    >
      <div className="chapter-list">
        {chapterManager.chapters
          .filter(ch => ch.status === ChapterStatus.MOUNTED)
          .sort((a, b) => a.index - b.index)
          .map(chapter => (
            <div
              key={chapter.id}
              data-chapter-id={chapter.id}
              className={styles.chapterContent}
              dangerouslySetInnerHTML={{ __html: chapter.htmlContent }}
            />
          ))}
      </div>

      {/* Shadow Realm 渲染器 */}
      {chapterManager.chapters
        .filter(ch => ch.status === ChapterStatus.RENDERING_OFFSCREEN)
        .map(chapter => (
          <ShadowRenderer
            key={chapter.id}
            htmlContent={chapter.htmlContent}
            chapterId={chapter.id}
            readerStyles={{
              textColor,
              bgColor,
              fontSize,
              fontFamily,
              lineHeight,
              paragraphSpacing,
              textIndentEm,
              letterSpacing,
              textAlign,
              pageWidth,
            }}
            onReady={(node, height) => handleChapterReady(chapter.index, node, height)}
            onError={(error) => handleChapterError(chapter.index, error)}
          />
        ))}

      {/* 加载指示器 */}
      {renderPipeline.isLoading() && (
        <div className={styles.loadingIndicator}>
          Loading...
        </div>
      )}
    </div>
  );
}
