import { useRef, useEffect, useCallback } from 'react';
import styles from './ShadowRenderer.module.css';
import { waitForAssetLoad, getContainerHeight } from '../../utils/assetLoader';
import { generateCSSOverride, generatePaginatedCSSOverride, scopeStyles, extractStyles, removeStyleTags } from '../../utils/styleProcessor';
import { sanitizeChapterHtml, sanitizeStyleSheets } from '../../utils/contentSanitizer';
import { buildFontFamilyWithFallback } from '../../utils/fontFallback';

const LARGE_CHAPTER_HTML_THRESHOLD = 450_000;
const CHUNK_APPEND_BATCH_SIZE = 120;
const VECTOR_SEGMENT_CHAR_BUDGET = 16_000;
const VECTOR_MIN_SEGMENT_EST_HEIGHT = 96;

interface ChapterVectorSegment {
  index: number;
  nodes: ChildNode[];
  charCount: number;
  estimatedHeight: number;
}

async function yieldToBrowser(): Promise<void> {
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function estimateNodeCharWeight(node: ChildNode): number {
  if (node.nodeType === Node.TEXT_NODE) {
    return Math.max(24, (node.textContent || '').trim().length);
  }

  if (node.nodeType === Node.ELEMENT_NODE) {
    const element = node as HTMLElement;
    const textLength = (element.textContent || '').length;
    const mediaBoost = element.matches('img,svg,video,table,pre,code') ? 260 : 0;
    return Math.max(40, textLength + 32 + mediaBoost);
  }

  return 32;
}

function estimateSegmentHeight(charCount: number, readerStyles: ReaderStyleConfig): number {
  const fontSize = Math.max(11, readerStyles.fontSize || 16);
  const width = Math.max(360, Math.min(1400, readerStyles.pageWidth || 900));
  const charsPerLine = Math.max(18, Math.floor((width / fontSize) * 1.75));
  const estimatedLines = Math.max(2, Math.ceil(Math.max(1, charCount) / charsPerLine));
  const lineHeightPx = Math.max(fontSize * 1.25, fontSize * (readerStyles.lineHeight || 1.6));
  const paragraphFactor = Math.max(1.04, 1 + (readerStyles.paragraphSpacing || 0) / 220);

  return Math.max(
    VECTOR_MIN_SEGMENT_EST_HEIGHT,
    Math.ceil(estimatedLines * lineHeightPx * paragraphFactor),
  );
}

function computeInitialSegmentCount(segmentCount: number, chapterSize: number): number {
  if (segmentCount <= 1) return segmentCount;
  if (chapterSize >= 1_200_000) return Math.min(2, segmentCount);
  if (chapterSize >= 750_000) return Math.min(3, segmentCount);
  return Math.min(4, segmentCount);
}

function vectorizeChapterContent(
  html: string,
  readerStyles: ReaderStyleConfig,
  targetChars: number = VECTOR_SEGMENT_CHAR_BUDGET,
): ChapterVectorSegment[] {
  const parser = new DOMParser();
  const parsed = parser.parseFromString(`<body>${html}</body>`, 'text/html');
  const sourceBody = parsed.body;

  if (!sourceBody || sourceBody.childNodes.length === 0) {
    return [];
  }

  const segments: ChapterVectorSegment[] = [];
  let currentNodes: ChildNode[] = [];
  let currentChars = 0;

  const flush = () => {
    if (currentNodes.length === 0) return;

    segments.push({
      index: segments.length,
      nodes: currentNodes,
      charCount: Math.max(1, currentChars),
      estimatedHeight: estimateSegmentHeight(currentChars, readerStyles),
    });

    currentNodes = [];
    currentChars = 0;
  };

  Array.from(sourceBody.childNodes).forEach((node) => {
    const weight = estimateNodeCharWeight(node);
    const shouldSplit = currentNodes.length > 0 && (currentChars + weight > targetChars);
    if (shouldSplit) {
      flush();
    }

    currentNodes.push(node);
    currentChars += weight;
  });

  flush();
  return segments;
}

function materializeVectorSegment(targetEl: HTMLElement, segment: ChapterVectorSegment): void {
  const fragment = document.createDocumentFragment();
  segment.nodes.forEach((node) => {
    fragment.appendChild(node.cloneNode(true));
  });
  targetEl.replaceChildren(fragment);
}

function applyPlaceholderSizing(segmentEl: HTMLElement, height: number): void {
  const safeHeight = Math.max(VECTOR_MIN_SEGMENT_EST_HEIGHT, Math.floor(height));
  segmentEl.style.minHeight = `${safeHeight}px`;
  segmentEl.style.containIntrinsicSize = `${safeHeight}px`;
}

async function appendHtmlContentChunked(
  container: HTMLElement,
  html: string,
  batchSize: number = CHUNK_APPEND_BATCH_SIZE,
): Promise<void> {
  const parser = new DOMParser();
  const parsed = parser.parseFromString(`<body>${html}</body>`, 'text/html');
  const sourceBody = parsed.body;

  if (!sourceBody || sourceBody.childNodes.length === 0) {
    container.innerHTML = html;
    return;
  }

  const nodes = Array.from(sourceBody.childNodes);
  const limit = Math.max(40, batchSize);

  for (let offset = 0; offset < nodes.length; offset += limit) {
    const fragment = document.createDocumentFragment();
    const chunk = nodes.slice(offset, offset + limit);
    chunk.forEach((node) => {
      fragment.appendChild(node.cloneNode(true));
    });
    container.appendChild(fragment);
    if (offset + limit < nodes.length) {
      await yieldToBrowser();
    }
  }
}

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
    const resolvedFontFamily = buildFontFamilyWithFallback(fontFamily);

    const scope = `[data-chapter-id="${chapterId}"]`;

    return `
      ${scope} * { box-sizing: border-box; }
      ${scope} {
        margin: 0 !important; padding: 0 !important;
        background: var(--reader-bg-color, ${bgColor}) !important;
        color: var(--reader-text-color, ${textColor}) !important;
        font-family: var(--reader-font-family, ${resolvedFontFamily}) !important;
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

        // 2. Centralized sanitize + scope styles
        const sanitizedHtml = sanitizeChapterHtml(htmlContent).htmlContent;
        const inlineStyles = sanitizeStyleSheets(extractStyles(sanitizedHtml));
        const cleanedHtml = removeStyleTags(sanitizedHtml);
        const sanitizedExternalStyles = sanitizeStyleSheets(externalStyles);
        const isLargeChapter = cleanedHtml.length >= LARGE_CHAPTER_HTML_THRESHOLD;
        const useVectorizedFlow = mode === 'scroll' && isLargeChapter;

        // 3. Build combined scoped stylesheet
        const styleEl = document.createElement('style');
        const cssOverride = mode === 'paginated'
          ? generatePaginatedCSSOverride(chapterId)
          : generateCSSOverride(chapterId);
        const allStyles = [...sanitizedExternalStyles, ...inlineStyles];
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
        const vectorSegments = useVectorizedFlow
          ? vectorizeChapterContent(cleanedHtml, readerStyles)
          : [];

        const canUseVectorized = useVectorizedFlow && vectorSegments.length > 1;
        const segmentEls: HTMLElement[] = [];
        let initialSegmentCount = 0;

        if (canUseVectorized) {
          initialSegmentCount = computeInitialSegmentCount(vectorSegments.length, cleanedHtml.length);

          vectorSegments.forEach((segment, segmentIndex) => {
            const segmentEl = document.createElement('section');
            segmentEl.setAttribute('data-shadow-segment-index', String(segmentIndex));
            segmentEl.style.width = '100%';
            segmentEl.style.position = 'relative';
            segmentEl.style.contain = 'layout paint';
            segmentEl.style.contentVisibility = 'auto';

            if (segmentIndex < initialSegmentCount) {
              materializeVectorSegment(segmentEl, segment);
              segmentEl.setAttribute('data-shadow-segment-state', 'hydrated');
              segmentEl.style.containIntrinsicSize = `${Math.max(VECTOR_MIN_SEGMENT_EST_HEIGHT, segment.estimatedHeight)}px`;
            } else {
              segmentEl.setAttribute('data-shadow-segment-state', 'placeholder');
              applyPlaceholderSizing(segmentEl, segment.estimatedHeight);
            }

            contentDiv.appendChild(segmentEl);
            segmentEls.push(segmentEl);
          });

          if (initialSegmentCount > 0 && vectorSegments.length > initialSegmentCount) {
            void contentDiv.offsetHeight;

            const measuredSeedHeight = segmentEls
              .slice(0, initialSegmentCount)
              .reduce((sum, el) => sum + Math.max(1, getContainerHeight(el)), 0);
            const estimatedSeedHeight = vectorSegments
              .slice(0, initialSegmentCount)
              .reduce((sum, seg) => sum + seg.estimatedHeight, 0);

            const correction = estimatedSeedHeight > 0
              ? clampNumber(measuredSeedHeight / estimatedSeedHeight, 0.62, 2.4)
              : 1;

            for (let idx = initialSegmentCount; idx < vectorSegments.length; idx += 1) {
              const placeholderEl = segmentEls[idx];
              const seg = vectorSegments[idx];
              if (!placeholderEl || !seg) continue;
              applyPlaceholderSizing(placeholderEl, seg.estimatedHeight * correction);
            }
          }
        } else if (isLargeChapter) {
          await appendHtmlContentChunked(contentDiv, cleanedHtml);
        } else {
          contentDiv.innerHTML = cleanedHtml;
        }
        chapterWrapper.appendChild(contentDiv);

        // 5. Memory-conscious media hints
        chapterWrapper.querySelectorAll('img').forEach((img) => {
          if (!img.getAttribute('loading')) {
            img.setAttribute('loading', 'lazy');
          }
          if (!img.getAttribute('decoding')) {
            img.setAttribute('decoding', 'async');
          }
          if (!img.getAttribute('fetchpriority')) {
            img.setAttribute('fetchpriority', 'low');
          }
        });

        // 6. Mount into shadow container
        container.innerHTML = '';
        container.appendChild(chapterWrapper);

        if (cancelled) return;

        // 7. Wait for all images to finish loading
        await waitForAssetLoad(chapterWrapper, {
          chapterSizeHint: cleanedHtml.length,
          timeoutMs: canUseVectorized ? 9000 : (isLargeChapter ? 14000 : undefined),
          maxTrackedImages: canUseVectorized ? 10 : (isLargeChapter ? 16 : 48),
          largeChapterThreshold: LARGE_CHAPTER_HTML_THRESHOLD,
        });

        if (cancelled) return;

        // 8. Force reflow and measure precise height
        void chapterWrapper.offsetHeight;
        const height = getContainerHeight(chapterWrapper);

        console.log(`[ShadowRenderer] Chapter "${chapterId}" ready. Height: ${height}px`);

        hasReportedRef.current = true;
        onReady(chapterWrapper, height);

        if (canUseVectorized && vectorSegments.length > initialSegmentCount) {
          const hydrateRemainingSegments = async () => {
            let materializedCount = 0;

            for (let idx = initialSegmentCount; idx < vectorSegments.length; idx += 1) {
              if (cancelled || !chapterWrapper.isConnected) {
                return;
              }

              const targetEl = segmentEls[idx];
              const segment = vectorSegments[idx];
              if (!targetEl || !segment) continue;

              materializeVectorSegment(targetEl, segment);
              targetEl.setAttribute('data-shadow-segment-state', 'hydrated');
              targetEl.style.minHeight = '0px';

              const measured = Math.max(VECTOR_MIN_SEGMENT_EST_HEIGHT, getContainerHeight(targetEl));
              targetEl.style.containIntrinsicSize = `${measured}px`;

              if (idx % 3 === 0) {
                await waitForAssetLoad(targetEl, {
                  chapterSizeHint: segment.charCount,
                  timeoutMs: 4000,
                  maxTrackedImages: 4,
                  largeChapterThreshold: LARGE_CHAPTER_HTML_THRESHOLD,
                });
              }

              materializedCount += 1;
              if (materializedCount % 2 === 0) {
                await yieldToBrowser();
              }
            }

            if (!cancelled && chapterWrapper.isConnected) {
              const finalHeight = getContainerHeight(chapterWrapper);
              console.log(
                `[ShadowRenderer] Chapter "${chapterId}" vectorized hydration done. Final: ${finalHeight}px`,
              );
            }
          };

          void hydrateRemainingSegments();
        }
      } catch (error) {
        if (cancelled) return;
        const err = error instanceof Error ? error : new Error(String(error));
        console.error(`[ShadowRenderer] Render error for "${chapterId}":`, err);
        onError?.(err);
      }
    };

    renderAndMeasure();

    return () => {
      if (!hasReportedRef.current) {
        cancelled = true;
      }
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
