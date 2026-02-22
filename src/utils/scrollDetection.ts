/**
 * 滚动方向
 */
export type ScrollDirection = 'up' | 'down' | 'none';

/**
 * 预加载配置
 */
export interface PreloadConfig {
  threshold: number;  // 阈值（px），默认 500
}

export const DEFAULT_PRELOAD_CONFIG: PreloadConfig = {
  threshold: 500
};

/**
 * 检测是否需要预加载章节
 * @param scrollTop - 当前滚动位置
 * @param viewportHeight - 视口高度
 * @param contentHeight - 内容总高度
 * @param direction - 滚动方向
 * @param config - 预加载配置
 * @returns 是否需要预加载
 */
export function shouldPreloadChapter(
  scrollTop: number,
  viewportHeight: number,
  contentHeight: number,
  direction: ScrollDirection,
  config: PreloadConfig = DEFAULT_PRELOAD_CONFIG
): boolean {
  const { threshold } = config;
  
  if (direction === 'up') {
    // 向上滚动：距离顶部小于阈值时预加载上一章
    return scrollTop < threshold;
  } else if (direction === 'down') {
    // 向下滚动：距离底部小于阈值时预加载下一章
    const distanceToBottom = contentHeight - scrollTop - viewportHeight;
    return distanceToBottom < threshold;
  }
  
  return false;
}

/**
 * 检测滚动方向
 * @param currentScrollTop - 当前滚动位置
 * @param previousScrollTop - 之前的滚动位置
 * @returns 滚动方向
 */
export function detectScrollDirection(
  currentScrollTop: number,
  previousScrollTop: number
): ScrollDirection {
  if (currentScrollTop > previousScrollTop) {
    return 'down';
  } else if (currentScrollTop < previousScrollTop) {
    return 'up';
  }
  return 'none';
}

/**
 * 计算距离边缘的距离
 */
export function getDistanceToEdge(
  scrollTop: number,
  viewportHeight: number,
  contentHeight: number,
  direction: ScrollDirection
): number {
  if (direction === 'up') {
    return scrollTop;
  } else if (direction === 'down') {
    return contentHeight - scrollTop - viewportHeight;
  }
  return Infinity;
}
