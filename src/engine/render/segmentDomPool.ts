const POOL_MAX_SIZE = 80;

/**
 * 段级 DOM 节点池 — 复用 <section> 元素，减少 GC 和 DOM 创建开销。
 *
 * acquire() 从池中取出一个已清空的 section，池空时新建。
 * release() 回收段元素（暴力清空所有属性和内容后放回池中）。
 * drain()   清空整个池。
 *
 * 池大小 80：覆盖大章节（50段）+ 章节交界双缓冲 + 离屏测量并发。
 * <section> 空壳 ~0.3KB/个，80 个 ≈ 24KB，可忽略。
 */
export class SegmentDomPool {
  private pool: HTMLElement[] = [];
  private maxSize: number;
  private acquireCount = 0;
  private createCount = 0;

  constructor(maxSize: number = POOL_MAX_SIZE) {
    this.maxSize = maxSize;
  }

  /** 获取一个可用的 section 元素 */
  acquire(): HTMLElement {
    this.acquireCount++;
    const el = this.pool.pop();
    if (el) return el;
    this.createCount++;
    return document.createElement('section');
  }

  /** 回收段元素到池中 — 暴力清空所有状态，杜绝属性残留 */
  release(el: HTMLElement): void {
    if (this.pool.length >= this.maxSize) return;
    // 1. 清空子节点
    el.replaceChildren();
    // 2. 暴力移除所有属性（id / data-* / aria-* / lang / dir / 任何注入属性）
    const attrNames = el.getAttributeNames();
    for (let i = 0; i < attrNames.length; i++) {
      el.removeAttribute(attrNames[i]);
    }
    // 3. 清空 inline style 和 className（removeAttribute 已覆盖，双保险）
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

  /** 池命中率统计（调试用） */
  get stats(): { acquires: number; creates: number; hitRate: string } {
    const hits = this.acquireCount - this.createCount;
    const rate = this.acquireCount > 0 ? (hits / this.acquireCount * 100).toFixed(1) + '%' : '0%';
    return { acquires: this.acquireCount, creates: this.createCount, hitRate: rate };
  }
}
