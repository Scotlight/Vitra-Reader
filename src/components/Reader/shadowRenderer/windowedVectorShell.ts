/**
 * 窗口向量化章节壳创建。
 *
 * 给定章节 id + 外部 CSS + readerStyles + segmentMetas，生成一个已经
 * 注入样式、尺寸已预留的章节 wrapper DOM，但**不**挂载任何段内容（段
 * 由运行时按可视区域逐个 mount）。
 *
 * 产物：
 * - wrapper: 待追加到列表的 <div.chapter-content data-vitra-vectorized>
 * - contentDiv: 占位高度 = Σ segment.estimatedHeight 的内容容器
 * - height: 上述预留总高
 *
 * 被 useChapterLoader 在两种场景使用：
 * 1. 章节从 placeholder 快速恢复（可复用历史 segmentMetas 跳过 Worker）
 * 2. Worker 返回 segmentMetas 且可 bypass shadow 渲染队列时
 */

import { generateCSSOverride } from '../../../utils/styleProcessor';
import { buildScopedContentCss, type CreateWindowedVectorChapterShellOptions } from './contentCss';

export function createWindowedVectorChapterShell(
    options: CreateWindowedVectorChapterShellOptions,
): { node: HTMLElement; height: number } {
    const {
        chapterId,
        externalStyles = [],
        readerStyles,
        segmentMetas,
    } = options;

    const chapterWrapper = document.createElement('div');
    chapterWrapper.className = 'chapter-content';
    chapterWrapper.setAttribute('data-vitra-vectorized', 'true');
    chapterWrapper.style.width = '100%';
    chapterWrapper.style.position = 'relative';
    chapterWrapper.style.display = 'flow-root';

    const styleEl = document.createElement('style');
    styleEl.textContent = [
        generateCSSOverride(chapterId),
        externalStyles.join('\n'),
        buildScopedContentCss(chapterId, readerStyles),
    ].join('\n');
    chapterWrapper.appendChild(styleEl);

    const contentDiv = document.createElement('div');
    contentDiv.style.display = 'flow-root';
    contentDiv.setAttribute('data-vitra-vector-content', 'true');
    const totalHeight = Math.max(1, segmentMetas.reduce((total, segment) => total + segment.estimatedHeight, 0));
    contentDiv.style.position = 'relative';
    contentDiv.style.height = `${totalHeight}px`;
    contentDiv.style.minHeight = `${totalHeight}px`;
    contentDiv.setAttribute('data-vitra-vector-total-height', String(totalHeight));

    chapterWrapper.appendChild(contentDiv);

    return {
        node: chapterWrapper,
        height: totalHeight,
    };
}
