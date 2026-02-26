const POOL_MAX_SIZE = 30;

/**
 * 段级 DOM 节点池 — 复用 <section> 元素，减少 GC 和 DOM 创建开销。
 *
 * acquire() 从池中取出一个已清空的 section，池空时新建。
 * release() 回收段元素（清空内容后放回池中）。
 * drain()   清空整个池。
 */
export class SegmentDomPool {
  private pool: HTMLElement[] = [];
  private maxSize: number;

  constructor(maxSize: number = POOL_MAX_SIZE) {
    this.maxSize = maxSize;
  }

  /** 获取一个可用的 section 元素 */
  acquire(): HTMLElement {
    const el = this.pool.pop();
    if (el) {
      // 重置关键属性
      el.removeAttribute('data-shadow-segment-index');
      el.removeAttribute('data-shadow-segment-state');
      el.style.cssText = '';
      return el;
    }
    return document.createElement('section');
  }

  /** 回收段元素到池中 */
  release(el: HTMLElement): void {
    if (this.pool.length >= this.maxSize) return;
    el.replaceChildren();
    el.removeAttribute('data-shadow-segment-index');
    el.removeAttribute('data-shadow-segment-state');
    el.style.cssText = '';
    el.className = '';
    this.pool.push(el);
  }

  /** 清空整个池 */
  drain(): void {
    this.pool.length = 0;
  }

  /** 池中当前可用元素数量 */
  get size(): number {
    return this.pool.length;
  }
}
