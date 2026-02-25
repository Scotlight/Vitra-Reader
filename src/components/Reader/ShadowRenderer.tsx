import { useRef, useEffect, useCallback } from 'react';
import styles from './ShadowRenderer.module.css';
import { waitForAssetLoad, getContainerHeight } from '../../utils/assetLoader';
import { generateCSSOverride, generatePaginatedCSSOverride, scopeStyles, extractStyles, removeStyleTags } from '../../utils/styleProcessor';

export interface ReaderStyleConfig {
  textColor: string;
  bgColor: string;
  fontSize: number;
  fontFamily: string;
  lineHeight: number;
  paragraphSpacing: number;
  letterSpacing: number;
  textAlign: string;
  pageWidth: number;
}

export interface ShadowRendererProps {
  /** 章节 HTML 内容 */
  htmlContent: string;
  /** 章节唯一标识 */
  chapterId: string;
  /** 章节关联的外部 CSS 数组 */
  externalStyles?: string[];
  /** 就绪回调：DOM 节点 + 精确高度 */
  onReady: (node: HTMLElement, height: number) => void;
  /** 渲染失败回调 */
  onError?: (error: Error) => void;
  /** 阅读器样式配置 */
  readerStyles: ReaderStyleConfig;
  /** 渲染模式：scroll（滚动）或 paginated（翻页），默认 scroll */
  mode?: 'scroll' | 'paginated';
}

/**
 * ShadowRenderer — 离屏渲染组件 (The Shadow Realm)
 *
 * 核心职责：
 * 1. 在 visibility:hidden 容器中渲染章节 HTML
 * 2. 注入 CSS Override（强制覆盖 EPUB multi-column 布局）
 * 3. 对章节 CSS 进行作用域隔离 (Style Scoping)
 * 4. 安全清洗（移除 script / 事件处理器）
 * 5. 等待所有 <img> 加载完成
 * 6. 通过 onReady 回调返回 DOM 节点和精确高度
 */
export function ShadowRenderer({
  htmlContent,
  chapterId,
  externalStyles = [],
  onReady,
  onError,
  readerStyles,
  mode = 'scroll',
}: ShadowRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const hasReportedRef = useRef(false);
  const currentChapterIdRef = useRef(chapterId);

  /** 构建阅读器内容样式 CSS（已作用域化到 chapterId） */
  const buildContentCss = useCallback(() => {
    const {
      textColor, bgColor, fontSize, fontFamily,
      lineHeight, paragraphSpacing, letterSpacing, textAlign,
    } = readerStyles;

    const scope = `[data-chapter-id="${chapterId}"]`;

    return `
      ${scope} * { box-sizing: border-box; }
      ${scope} {
        margin: 0 !important; padding: 0 !important;
        background: var(--reader-bg-color, ${bgColor}) !important;
        color: var(--reader-text-color, ${textColor}) !important;
        font-family: var(--reader-font-family, ${fontFamily}) !important;
        font-size: var(--reader-font-size, ${fontSize}px) !important;
        line-height: var(--reader-line-height, ${lineHeight}) !important;
        letter-spacing: var(--reader-letter-spacing, ${letterSpacing}px) !important;
        text-align: var(--reader-text-align, ${textAlign}) !important;
      }
      ${scope} *:not(img):not(svg):not(path):not(video):not(canvas) {
        color: var(--reader-text-color, ${textColor}) !important;
      }
      ${scope} p, ${scope} div, ${scope} section, ${scope} article {
        margin-top: 0 !important;
        margin-bottom: var(--reader-paragraph-spacing, ${paragraphSpacing}px) !important;
      }
      ${scope} h1, ${scope} h2, ${scope} h3, ${scope} h4, ${scope} h5, ${scope} h6 {
        margin-top: 1em !important;
        margin-bottom: 0.5em !important;
      }
      ${scope} hr, ${scope} .break, ${scope} [style*="page-break"] {
        display: none !important;
      }
      ${scope} img, ${scope} svg {
        max-width: 100% !important;
        height: auto !important;
      }
    `;
  }, [readerStyles, chapterId]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !htmlContent) return;

    // Reset on chapterId change
    if (currentChapterIdRef.current !== chapterId) {
      hasReportedRef.current = false;
      currentChapterIdRef.current = chapterId;
    }

    if (hasReportedRef.current) return;

    let cancelled = false;

    const renderAndMeasure = async () => {
      try {
        // 1. Create chapter wrapper with data attribute for CSS scoping
        const chapterWrapper = document.createElement('div');
        chapterWrapper.setAttribute('data-chapter-id', chapterId);
        chapterWrapper.className = 'chapter-content';
        chapterWrapper.style.width = '100%';
        chapterWrapper.style.position = 'relative';

        // 2. Extract and scope inline styles from HTML
        const inlineStyles = extractStyles(htmlContent);
        const cleanedHtml = removeStyleTags(htmlContent);

        // 3. Build combined scoped stylesheet
        const styleEl = document.createElement('style');
        const cssOverride = mode === 'paginated'
          ? generatePaginatedCSSOverride(chapterId)
          : generateCSSOverride(chapterId);
        const allStyles = [...externalStyles, ...inlineStyles];
        const scopedCss = allStyles
          .map(css => scopeStyles(css, chapterId))
          .join('\n');

        styleEl.textContent = [
          cssOverride,
          scopedCss,
          buildContentCss(),
        ].join('\n');

        chapterWrapper.appendChild(styleEl);

        // 4. Inject cleaned HTML
        const contentDiv = document.createElement('div');
        contentDiv.innerHTML = cleanedHtml;
        chapterWrapper.appendChild(contentDiv);

        // 5. Sanitize — remove scripts and dangerous attributes
        chapterWrapper.querySelectorAll('script').forEach(s => s.remove());
        chapterWrapper.querySelectorAll('*').forEach(el => {
          Array.from(el.attributes).forEach(attr => {
            const name = attr.name.toLowerCase();
            if (name.startsWith('on')) {
              el.removeAttribute(attr.name);
            }
            if (
              (name === 'href' || name === 'src') &&
              /^javascript:/i.test(attr.value.trim())
            ) {
              el.removeAttribute(attr.name);
            }
          });
        });

        // 6. Mount into shadow container
        container.innerHTML = '';
        container.appendChild(chapterWrapper);

        if (cancelled) return;

        // 7. Wait for all images to finish loading
        await waitForAssetLoad(chapterWrapper, 8000);

        if (cancelled) return;

        // 8. Force reflow and measure precise height
        void chapterWrapper.offsetHeight;
        const height = getContainerHeight(chapterWrapper);

        console.log(`[ShadowRenderer] Chapter "${chapterId}" ready. Height: ${height}px`);

        hasReportedRef.current = true;
        onReady(chapterWrapper, height);
      } catch (error) {
        if (cancelled) return;
        const err = error instanceof Error ? error : new Error(String(error));
        console.error(`[ShadowRenderer] Render error for "${chapterId}":`, err);
        onError?.(err);
      }
    };

    renderAndMeasure();

    return () => {
      cancelled = true;
    };
  }, [htmlContent, chapterId, externalStyles, onReady, onError, buildContentCss]);

  return (
    <div
      ref={containerRef}
      className={styles.shadowContainer}
      aria-hidden="true"
    />
  );
}
