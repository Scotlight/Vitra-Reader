/**
 * 章节作用域 CSS 构建。
 *
 * - ReaderStyleConfig: 阅读器样式面板下发的完整样式契约（字体 / 颜色 /
 *   行距 / 对齐 / PDF 暗色反色标志等）。本接口是跨模块公共契约，
 *   ScrollReaderView / PaginatedReaderView / ShadowRenderer 都读。
 *
 * - buildScopedContentCss: 把 ReaderStyleConfig 转译为绑定到
 *   [data-chapter-id="..."] 的 CSS 片段，交由调用方塞进 <style>。
 *
 * - CreateWindowedVectorChapterShellOptions: windowedVectorShell.ts 的
 *   入参类型，与 CSS 构建同源（都依赖 ReaderStyleConfig），放一起方便
 *   维护一致性。
 */

import { buildReaderCssTemplate } from '@/engine/render/readerCss';
import type { SegmentMeta } from '@/engine/types/vectorRender';

export interface ReaderStyleConfig {
    textColor: string;
    bgColor: string;
    fontSize: number;
    fontFamily: string;
    lineHeight: number;
    paragraphSpacing: number;
    textIndentEm: number;
    letterSpacing: number;
    textAlign: string;
    pageWidth: number;
    /** PDF 暗色模式反色标志（ReaderView 根据 PDF + 暗色主题计算） */
    isPdfDarkMode?: boolean;
}

export interface CreateWindowedVectorChapterShellOptions {
    chapterId: string;
    externalStyles?: readonly string[];
    readerStyles: ReaderStyleConfig;
    segmentMetas: readonly SegmentMeta[];
}

export function buildScopedContentCss(chapterId: string, readerStyles: ReaderStyleConfig): string {
    const {
        textColor, bgColor, fontSize, fontFamily,
        lineHeight, paragraphSpacing, textIndentEm, letterSpacing, textAlign,
        isPdfDarkMode,
    } = readerStyles;
    const scope = `[data-chapter-id="${chapterId}"]`;

    const pdfDarkModeCss = isPdfDarkMode ? `
    ${scope} .pdf-page-layer img {
      filter: invert(0.6) brightness(1.3);
    }
  ` : '';

    return `
    ${buildReaderCssTemplate({
        textColor,
        bgColor,
        fontSize,
        fontFamily,
        lineHeight,
        paragraphSpacing,
        letterSpacing,
        textAlign,
    }, {
        scope,
        applyColumns: false,
        textIndentEm,
    })}
    ${scope} *:not(img):not(svg):not(path):not(video):not(canvas) {
      color: var(--reader-text-color, ${textColor}) !important;
    }
    ${scope} h1, ${scope} h2, ${scope} h3, ${scope} h4, ${scope} h5, ${scope} h6 {
      margin-top: 1em !important;
      margin-bottom: 0.5em !important;
    }
    ${scope} hr, ${scope} .break, ${scope} [style*="page-break"] {
      display: none !important;
    }
    ${pdfDarkModeCss}
  `;
}
