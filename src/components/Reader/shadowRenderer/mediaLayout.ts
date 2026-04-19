/**
 * 媒体布局确定性协议。
 *
 * 章节挂载后，对图 / 视频 / 表格等媒体节点强制补齐布局约束，消除
 * "加载前后尺寸抖动"导致的重排。
 *
 * 两个入口：
 * - hasLayoutSensitiveMedia(html): 字符串级快速嗅探是否包含媒体标签
 * - enforceDeterministicMediaLayout(wrapper): 对已挂 DOM 执行强制布局修复
 *
 * 核心策略：
 * - 所有媒体节点强制 maxWidth: 100%
 * - 图片：eager load + async decode + 若标签有 width/height 就算出
 *   aspect-ratio；否则给个 16/9 的默认 + 最小高度
 * - 显式写 width 防止图片解码完成后的 reflow 偏移分页
 */

import { MEDIA_LAYOUT_SELECTOR } from './shadowRendererConstants';

export function hasLayoutSensitiveMedia(html: string): boolean {
    return /<(img|video|picture|svg|canvas|figure|table|math)\b/i.test(html);
}

export function enforceDeterministicMediaLayout(chapterWrapper: HTMLElement): void {
    const mediaNodes = chapterWrapper.querySelectorAll(MEDIA_LAYOUT_SELECTOR);
    if (mediaNodes.length === 0) return;

    mediaNodes.forEach((node) => {
        if (!(node instanceof HTMLElement)) return;
        node.style.maxWidth ||= '100%';
    });

    chapterWrapper.querySelectorAll('img').forEach((img) => {
        // In shadow measurement phase we force eager load to avoid late expansion.
        img.setAttribute('loading', 'eager');
        img.setAttribute('decoding', 'async');
        img.setAttribute('fetchpriority', 'low');
        img.style.display ||= 'block';
        img.style.maxWidth ||= '100%';
        img.style.height ||= 'auto';

        const width = Number(img.getAttribute('width') || '');
        const height = Number(img.getAttribute('height') || '');
        if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
            img.style.aspectRatio ||= `${width} / ${height}`;
            // 显式设置 CSS 尺寸，防止图片加载完成后 reflow 导致分页偏移
            if (!img.style.width || img.style.width === 'auto') {
                img.style.width = `min(${width}px, 100%)`;
            }
        } else {
            // 无已知尺寸的图片：设置合理默认 aspect-ratio 减少加载后 reflow 幅度
            img.style.aspectRatio ||= '16 / 9';
            img.style.minHeight ||= '120px';
        }
    });
}
