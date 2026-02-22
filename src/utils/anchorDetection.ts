/**
 * 锚点信息
 */
export interface AnchorInfo {
  element: HTMLElement;
  offsetTop: number;
  rect: DOMRect;
}

/**
 * 查找视口内第一个可见元素作为锚点
 * 参考 Chrome Scroll Anchoring 规范
 * @param viewport - 视口容器
 * @returns 锚点元素，如果没有则返回第一个子元素
 */
export function findFirstVisibleElement(viewport: HTMLElement): HTMLElement {
  const viewportRect = viewport.getBoundingClientRect();
  const children = Array.from(viewport.children) as HTMLElement[];
  
  // 遍历所有子元素，找到第一个可见的
  for (const child of children) {
    const rect = child.getBoundingClientRect();
    
    // 元素顶部在视口内
    if (rect.top >= viewportRect.top && rect.top < viewportRect.bottom) {
      return child;
    }
    
    // 元素跨越视口顶部（元素顶部在视口上方，底部在视口内）
    if (rect.top < viewportRect.top && rect.bottom > viewportRect.top) {
      return child;
    }
  }
  
  // 降级：返回第一个子元素
  return children[0] || viewport;
}

/**
 * 记录锚点位置信息
 * @param element - 锚点元素
 * @returns 锚点信息
 */
export function captureAnchorInfo(element: HTMLElement): AnchorInfo {
  return {
    element,
    offsetTop: element.offsetTop,
    rect: element.getBoundingClientRect()
  };
}

/**
 * 计算锚点位置变化
 * @param before - 插入前的锚点信息
 * @param after - 插入后的锚点信息
 * @returns Y 轴位置变化（px）
 */
export function calculateAnchorDelta(
  before: AnchorInfo,
  after: AnchorInfo
): number {
  return after.rect.top - before.rect.top;
}

/**
 * 查找最佳锚点元素
 * 优先选择有实际内容的元素
 */
export function findBestAnchor(viewport: HTMLElement): HTMLElement {
  const firstVisible = findFirstVisibleElement(viewport);
  
  // 如果第一个可见元素是容器，尝试找到其中的第一个内容元素
  if (firstVisible.children.length > 0) {
    const contentElements = Array.from(firstVisible.querySelectorAll('p, h1, h2, h3, h4, h5, h6, div, span'));
    if (contentElements.length > 0) {
      const viewportRect = viewport.getBoundingClientRect();
      for (const el of contentElements) {
        const rect = el.getBoundingClientRect();
        if (rect.top >= viewportRect.top && rect.top < viewportRect.bottom) {
          return el as HTMLElement;
        }
      }
    }
  }
  
  return firstVisible;
}
