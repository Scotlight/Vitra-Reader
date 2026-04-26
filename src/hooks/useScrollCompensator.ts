import { RefObject, useCallback } from 'react';
import {
  findBestAnchor,
  captureAnchorInfo,
  calculateAnchorDelta
} from '@/utils/anchorDetection';

/**
 * useScrollCompensator Hook
 * 职责：处理 DOM 插入时的滚动位置修正
 */
export function useScrollCompensator(viewportRef: RefObject<HTMLElement>) {
  /**
   * 原子化前置插入章节
   * 核心逻辑：将 Shadow Realm 中渲染好的节点移动到主视图，同时冻结视觉位置
   * 必须在 useLayoutEffect 中调用
   */
  const prependChapterAtomic = useCallback(
    (shadowNode: HTMLElement): void => {
      const viewport = viewportRef.current;
      if (!viewport) {
        console.error('[ScrollCompensator] Viewport not found');
        return;
      }

      try {
        // Phase 1: Snapshot - 记录插入前的锚点位置
        const anchorElement = findBestAnchor(viewport);
        const anchorBefore = captureAnchorInfo(anchorElement);
        const oldScrollTop = viewport.scrollTop;

        // Phase 2: Measurement - 从 Shadow Realm 获取精确高度
        const chapterHeight = shadowNode.offsetHeight;

        // Phase 3: Mutation - 将节点从 Shadow DOM 移动到主列表顶部
        const listContainer = viewport.querySelector('.chapter-list');
        if (!listContainer) {
          console.error('[ScrollCompensator] Chapter list container not found');
          return;
        }

        // prepend 操作
        listContainer.prepend(shadowNode);

        // Phase 4: Compensation - 立即修正 scrollTop
        // 使用锚点差值算法（Virtuoso 策略）
        const anchorAfter = captureAnchorInfo(anchorElement);
        const deltaY = calculateAnchorDelta(anchorBefore, anchorAfter);

        // 强制修正，抵消 DOM 插入带来的布局偏移
        // 这一步必须同步执行，不能用 requestAnimationFrame
        viewport.scrollTop = oldScrollTop + deltaY;

        console.log(
          `[ScrollCompensator] Prepended chapter. Height: ${chapterHeight}px. Compensated: ${deltaY}px`
        );
      } catch (error) {
        console.error('[ScrollCompensator] Error in prependChapterAtomic:', error);
      }
    },
    [viewportRef]
  );

  /**
   * 原子化追加章节
   * 向下滚动时追加章节，通常不需要补偿
   */
  const appendChapterAtomic = useCallback(
    (shadowNode: HTMLElement): void => {
      const viewport = viewportRef.current;
      if (!viewport) {
        console.error('[ScrollCompensator] Viewport not found');
        return;
      }

      try {
        const listContainer = viewport.querySelector('.chapter-list');
        if (!listContainer) {
          console.error('[ScrollCompensator] Chapter list container not found');
          return;
        }

        // append 操作（通常不需要滚动补偿）
        listContainer.appendChild(shadowNode);

        const chapterHeight = shadowNode.offsetHeight;
        console.log(
          `[ScrollCompensator] Appended chapter. Height: ${chapterHeight}px`
        );
      } catch (error) {
        console.error('[ScrollCompensator] Error in appendChapterAtomic:', error);
      }
    },
    [viewportRef]
  );

  return {
    prependChapterAtomic,
    appendChapterAtomic
  };
}
