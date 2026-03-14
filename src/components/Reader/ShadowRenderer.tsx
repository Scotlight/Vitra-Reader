import { useRef, useEffect, useCallback } from 'react';
import { clampNumber } from '../../utils/mathUtils';
import styles from './ShadowRenderer.module.css';
import { waitForAssetLoad, getContainerHeight } from '../../utils/assetLoader';
import { generateCSSOverride, generatePaginatedCSSOverride, extractStyles, removeStyleTags, scopeStyles } from '../../utils/styleProcessor';
import { sanitizeChapterHtml, sanitizeStyleSheets } from '../../engine/core/contentSanitizer';
import {
  buildReaderCssTemplate,
  buildVitraVectorRenderPlan,
  DEFAULT_VITRA_VECTOR_CONFIG,
  createVitraRenderTrace,
  finalizeVitraRenderTrace,
  formatVitraRenderTrace,
  runVitraRenderStage,
  SegmentDomPool,
  type SegmentMeta,
} from '../../engine';

const LARGE_CHAPTER_HTML_THRESHOLD = DEFAULT_VITRA_VECTOR_CONFIG.largeChapterThreshold;
const CHUNK_APPEND_BATCH_SIZE = 120;
const VECTOR_SEGMENT_CHAR_BUDGET = 16_000;
const VECTOR_MIN_SEGMENT_EST_HEIGHT = 96;
const VECTOR_HYDRATE_YIELD_EVERY_SEGMENTS = 1;
const VECTOR_HYDRATE_MEASURE_BATCH_SIZE = 4;
const VECTOR_IDLE_TIMEOUT_MS = 120;
const SEGMENT_ASSET_SELECTOR = 'img,video,audio,source,svg,image';
const MEDIA_LAYOUT_SELECTOR = 'img,video,picture,svg,canvas,figure,table,math';
const MEDIA_SENSITIVE_LOAD_TIMEOUT_MS = 4_500;
const MEDIA_SENSITIVE_MAX_TRACKED_IMAGES = 128;

// ── 高度估算参数 ──
const EST_TEXT_NODE_MIN_CHAR_WEIGHT = 24;
const EST_ELEMENT_NODE_MIN_CHAR_WEIGHT = 40;
const EST_ELEMENT_NODE_TAG_OVERHEAD = 32;
const EST_MEDIA_ELEMENT_CHAR_BOOST = 260;
const EST_UNKNOWN_NODE_CHAR_WEIGHT = 32;
const EST_FONT_SIZE_MIN_PX = 11;
const EST_FONT_SIZE_DEFAULT_PX = 16;
const EST_PAGE_WIDTH_MIN_PX = 360;
const EST_PAGE_WIDTH_MAX_PX = 1400;
const EST_PAGE_WIDTH_DEFAULT_PX = 900;
const EST_CHARS_PER_LINE_MIN = 18;
const EST_CHAR_WIDTH_RATIO = 1.75;
const EST_MIN_LINES = 2;
const EST_LINE_HEIGHT_MIN_FACTOR = 1.25;
const EST_LINE_HEIGHT_DEFAULT = 1.6;
const EST_PARAGRAPH_SPACING_FACTOR_MIN = 1.04;
const EST_PARAGRAPH_SPACING_NORMALIZE_DIVISOR = 220;
const EST_HEIGHT_CORRECTION_MIN = 0.62;
const EST_HEIGHT_CORRECTION_MAX = 2.4;

// ── 渲染阶段资源加载参数 ──
const RENDER_VECTORIZED_LOAD_TIMEOUT_MS = 3_500;
const RENDER_LARGE_CHAPTER_LOAD_TIMEOUT_MS = 6_500;
const RENDER_VECTORIZED_MAX_TRACKED_IMAGES = 10;
const RENDER_LARGE_MAX_TRACKED_IMAGES = 16;
const RENDER_NORMAL_MAX_TRACKED_IMAGES = 48;
const CHUNK_APPEND_MIN_BATCH_SIZE = 40;

// ── 水合阶段参数 ──
const HYDRATE_MEDIA_CHECK_INTERVAL = 3;
const HYDRATE_MEDIA_LOAD_TIMEOUT_MS = 2_500;
const HYDRATE_MEDIA_MAX_TRACKED_IMAGES = 4;

/** 模块级段 DOM 节点池单例 */
export const segmentPool = new SegmentDomPool();

interface ChapterVectorSegment {
  index: number;
  nodes: ChildNode[];
  charCount: number;
  estimatedHeight: number;
  /** Worker 侧向量化时填充，优先用于 materialize */
  _htmlContent?: string;
}

interface ShadowRenderContext {
  chapterWrapper: HTMLElement;
  canUseVectorized: boolean;
  vectorSegments: ChapterVectorSegment[];
  segmentEls: HTMLElement[];
  initialSegmentCount: number;
}

async function yieldToBrowser(): Promise<void> {
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

async function yieldForHydration(): Promise<void> {
  if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
    await new Promise<void>((resolve) => {
      window.requestIdleCallback(() => resolve(), { timeout: VECTOR_IDLE_TIMEOUT_MS });
    });
    return;
  }
  await yieldToBrowser();
}


function estimateNodeCharWeight(node: ChildNode): number {
  if (node.nodeType === Node.TEXT_NODE) {
    return Math.max(EST_TEXT_NODE_MIN_CHAR_WEIGHT, (node.textContent || '').trim().length);
  }

  if (node.nodeType === Node.ELEMENT_NODE) {
    const element = node as HTMLElement;
    const textLength = (element.textContent || '').length;
    const mediaBoost = element.matches('img,svg,video,table,pre,code') ? EST_MEDIA_ELEMENT_CHAR_BOOST : 0;
    return Math.max(EST_ELEMENT_NODE_MIN_CHAR_WEIGHT, textLength + EST_ELEMENT_NODE_TAG_OVERHEAD + mediaBoost);
  }

  return EST_UNKNOWN_NODE_CHAR_WEIGHT;
}

function estimateSegmentHeight(charCount: number, readerStyles: ReaderStyleConfig): number {
  const fontSize = Math.max(EST_FONT_SIZE_MIN_PX, readerStyles.fontSize || EST_FONT_SIZE_DEFAULT_PX);
  const width = Math.max(EST_PAGE_WIDTH_MIN_PX, Math.min(EST_PAGE_WIDTH_MAX_PX, readerStyles.pageWidth || EST_PAGE_WIDTH_DEFAULT_PX));
  const charsPerLine = Math.max(EST_CHARS_PER_LINE_MIN, Math.floor((width / fontSize) * EST_CHAR_WIDTH_RATIO));
  const estimatedLines = Math.max(EST_MIN_LINES, Math.ceil(Math.max(1, charCount) / charsPerLine));
  const lineHeightPx = Math.max(fontSize * EST_LINE_HEIGHT_MIN_FACTOR, fontSize * (readerStyles.lineHeight || EST_LINE_HEIGHT_DEFAULT));
  const paragraphFactor = Math.max(EST_PARAGRAPH_SPACING_FACTOR_MIN, 1 + (readerStyles.paragraphSpacing || 0) / EST_PARAGRAPH_SPACING_NORMALIZE_DIVISOR);

  return Math.max(
    VECTOR_MIN_SEGMENT_EST_HEIGHT,
    Math.ceil(estimatedLines * lineHeightPx * paragraphFactor),
  );
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
  // 优先使用 Worker 侧的 _htmlContent (innerHTML 设值)
  if (segment._htmlContent) {
    targetEl.innerHTML = segment._htmlContent;
    return;
  }
  // 回退到现有 nodes.cloneNode 路径
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

async function calibrateSegmentIntrinsicSizeBatch(targets: readonly HTMLElement[]): Promise<void> {
  if (targets.length === 0) return;

  // Let browser apply pending writes first, then read in one batch.
  await yieldToBrowser();
  const measuredHeights = targets.map((target) =>
    Math.max(VECTOR_MIN_SEGMENT_EST_HEIGHT, getContainerHeight(target)),
  );

  // Write in a dedicated pass to avoid interleaving reads/writes.
  for (let index = 0; index < targets.length; index += 1) {
    targets[index].style.containIntrinsicSize = `${measuredHeights[index]}px`;
  }
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
    // DOMParser 解析失败 — 不直接 innerHTML（避免浏览器宽松解析构造危险标签）
    // 降级为纯文本渲染
    container.textContent = html;
    return;
  }

  const nodes = Array.from(sourceBody.childNodes);
  const limit = Math.max(CHUNK_APPEND_MIN_BATCH_SIZE, batchSize);

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

async function appendHtmlFragmentsChunked(
  container: HTMLElement,
  htmlFragments: readonly string[],
): Promise<void> {
  if (htmlFragments.length === 0) {
    return;
  }

  for (let index = 0; index < htmlFragments.length; index += 1) {
    const fragmentHtml = htmlFragments[index];
    if (!fragmentHtml) continue;
    await appendHtmlContentChunked(container, fragmentHtml);
    if (index + 1 < htmlFragments.length) {
      await yieldToBrowser();
    }
  }
}

function normalizeHtmlFragments(
  htmlFragments: readonly string[] | undefined,
  htmlContent: string,
): readonly string[] {
  if (!htmlFragments || htmlFragments.length === 0) {
    return [htmlContent];
  }
  return htmlFragments.filter((fragment) => fragment.length > 0);
}

function hasLayoutSensitiveMedia(html: string): boolean {
  return /<(img|video|picture|svg|canvas|figure|table|math)\b/i.test(html);
}

function enforceDeterministicMediaLayout(chapterWrapper: HTMLElement): void {
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

export interface ShadowRendererProps {
  /** 章节 HTML 内容 */
  htmlContent: string;
  /** Worker 预处理后的 HTML 分片 */
  htmlFragments?: string[];
  /** Worker 侧向量化的段元数据 */
  segmentMetas?: SegmentMeta[];
  /** 章节唯一标识 */
  chapterId: string;
  /** 章节关联的外部 CSS 数组 */
  externalStyles?: string[];
  /** 是否已完成 worker 预处理（sanitize + scope） */
  preprocessed?: boolean;
  /** 就绪回调：DOM 节点 + 精确高度 */
  onReady: (node: HTMLElement, height: number) => void;
  /** 渲染失败回调 */
  onError?: (error: Error) => void;
  /** 阅读器样式配置 */
  readerStyles: ReaderStyleConfig;
  /** Session-level asset liveness check */
  resourceExists?: (url: string) => boolean;
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
  htmlFragments = [],
  segmentMetas,
  chapterId,
  externalStyles = [],
  preprocessed = false,
  onReady,
  onError,
  readerStyles,
  resourceExists,
  mode = 'scroll',
}: ShadowRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const hasReportedRef = useRef(false);
  const currentChapterIdRef = useRef(chapterId);

  /** 构建阅读器内容样式 CSS（已作用域化到 chapterId） */
  const buildContentCss = useCallback(() => {
    const {
      textColor, bgColor, fontSize, fontFamily,
      lineHeight, paragraphSpacing, textIndentEm, letterSpacing, textAlign,
      isPdfDarkMode,
    } = readerStyles;
    const scope = `[data-chapter-id="${chapterId}"]`;

    // PDF 暗色模式：85% 反色 + 亮度补偿，避免完全反色导致图片过暗
    const pdfDarkModeCss = isPdfDarkMode ? `
      ${scope} .pdf-page-layer img {
        filter: invert(0.85) brightness(1.15);
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
      // 等待字体加载完成，确保测量阶段使用正确的字体度量
      if (typeof document !== 'undefined' && document.fonts?.ready) {
        await document.fonts.ready;
      }

      const trace = createVitraRenderTrace(chapterId);
      try {
        const chapterWrapper = document.createElement('div');
        chapterWrapper.setAttribute('data-chapter-id', chapterId);
        chapterWrapper.className = 'chapter-content';
        chapterWrapper.style.width = '100%';
        chapterWrapper.style.position = 'relative';
        chapterWrapper.style.display = 'flow-root';

        const processed = await runVitraRenderStage(trace, 'parse', () => {
          if (preprocessed) {
            return {
              cleanedHtml: htmlContent,
              processedStyles: externalStyles,
              fragments: normalizeHtmlFragments(htmlFragments, htmlContent),
            };
          }
          return buildLocalProcessedPayload(htmlContent, externalStyles, chapterId);
        });

        const cleanedHtml = processed.cleanedHtml;
        const processedStyles = processed.processedStyles;
        const normalizedFragments = processed.fragments;
        const chapterSize = cleanedHtml.length;
        const isLargeChapter = chapterSize >= LARGE_CHAPTER_HTML_THRESHOLD;
        const mediaSensitiveChapter = hasLayoutSensitiveMedia(cleanedHtml);

        const vectorSegments = await runVitraRenderStage(trace, 'measure', () => {
          if (mode !== 'scroll' || !isLargeChapter) return [];
          // 优先使用 Worker 侧 segmentMetas，转为内部 ChapterVectorSegment 兼容格式
          if (segmentMetas && segmentMetas.length > 0) {
            return segmentMetas.map((meta): ChapterVectorSegment => ({
              index: meta.index,
              nodes: [],
              charCount: meta.charCount,
              estimatedHeight: meta.estimatedHeight,
              _htmlContent: meta.htmlContent,
            }));
          }
          // 回退到主线程 DOMParser 向量化路径
          return vectorizeChapterContent(cleanedHtml, readerStyles);
        });

        const vectorPlan = await runVitraRenderStage(trace, 'paginate', () => {
          return buildVitraVectorRenderPlan({
            mode,
            chapterSize,
            segmentCount: vectorSegments.length,
          });
        });

        const renderContext = await runVitraRenderStage<ShadowRenderContext | null>(trace, 'render', async () => {
          const styleEl = document.createElement('style');
          const cssOverride = mode === 'paginated'
            ? generatePaginatedCSSOverride(chapterId)
            : generateCSSOverride(chapterId);
          styleEl.textContent = [
            cssOverride,
            processedStyles.join('\n'),
            buildContentCss(),
          ].join('\n');
          chapterWrapper.appendChild(styleEl);

          const contentDiv = document.createElement('div');
          contentDiv.style.display = 'flow-root';
          const canUseVectorized = vectorPlan.enabled;
          const segmentEls: HTMLElement[] = [];
          const initialSegmentCount = mediaSensitiveChapter
            ? vectorSegments.length
            : vectorPlan.initialSegmentCount;

          if (canUseVectorized) {
            vectorSegments.forEach((segment, segmentIndex) => {
              const segmentEl = segmentPool.acquire();
              segmentEl.setAttribute('data-shadow-segment-index', String(segmentIndex));
              segmentEl.style.width = '100%';
              segmentEl.style.position = 'relative';
              segmentEl.style.contain = 'layout style paint';
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
                ? clampNumber(measuredSeedHeight / estimatedSeedHeight, EST_HEIGHT_CORRECTION_MIN, EST_HEIGHT_CORRECTION_MAX)
                : 1;

              for (let idx = initialSegmentCount; idx < vectorSegments.length; idx += 1) {
                const placeholderEl = segmentEls[idx];
                const seg = vectorSegments[idx];
                if (!placeholderEl || !seg) continue;
                applyPlaceholderSizing(placeholderEl, seg.estimatedHeight * correction);
              }
            }
          } else if (normalizedFragments.length > 1) {
            await appendHtmlFragmentsChunked(contentDiv, normalizedFragments);
          } else if (isLargeChapter) {
            await appendHtmlContentChunked(contentDiv, cleanedHtml);
          } else {
            contentDiv.innerHTML = cleanedHtml;
          }

          chapterWrapper.appendChild(contentDiv);
          enforceDeterministicMediaLayout(chapterWrapper);

          container.innerHTML = '';
          container.appendChild(chapterWrapper);
          if (cancelled) return null;

          await waitForAssetLoad(chapterWrapper, {
            chapterSizeHint: cleanedHtml.length,
            timeoutMs: mediaSensitiveChapter
              ? MEDIA_SENSITIVE_LOAD_TIMEOUT_MS
              : (canUseVectorized ? RENDER_VECTORIZED_LOAD_TIMEOUT_MS : (isLargeChapter ? RENDER_LARGE_CHAPTER_LOAD_TIMEOUT_MS : undefined)),
            maxTrackedImages: mediaSensitiveChapter
              ? MEDIA_SENSITIVE_MAX_TRACKED_IMAGES
              : (canUseVectorized ? RENDER_VECTORIZED_MAX_TRACKED_IMAGES : (isLargeChapter ? RENDER_LARGE_MAX_TRACKED_IMAGES : RENDER_NORMAL_MAX_TRACKED_IMAGES)),
            largeChapterThreshold: mediaSensitiveChapter
              ? Number.POSITIVE_INFINITY
              : LARGE_CHAPTER_HTML_THRESHOLD,
            resourceExists,
          });
          if (cancelled) return null;

          void chapterWrapper.offsetHeight;
          const height = getContainerHeight(chapterWrapper);
          console.log(`[ShadowRenderer] Chapter "${chapterId}" ready. Height: ${height}px`);
          hasReportedRef.current = true;
          onReady(chapterWrapper, height);
          return {
            chapterWrapper,
            canUseVectorized,
            vectorSegments,
            segmentEls,
            initialSegmentCount,
          };
        });

        if (!renderContext || cancelled) return;

        await runVitraRenderStage(trace, 'hydrate', async () => {
          const {
            chapterWrapper: activeChapterWrapper,
            canUseVectorized,
            vectorSegments: activeSegments,
            segmentEls: activeSegmentEls,
            initialSegmentCount: activeInitialSegmentCount,
          } = renderContext;

          if (!canUseVectorized || activeSegments.length <= activeInitialSegmentCount) return;

          // 若 segmentMetas 存在（Worker路径），跳过全量 rIC 循环，交由 ScrollReaderView IO 驱动
          const isWorkerVectorized = segmentMetas && segmentMetas.length > 0;
          if (isWorkerVectorized) {
            console.log(
              `[ShadowRenderer] Chapter "${chapterId}" using IO-driven hydration (${activeSegments.length - activeInitialSegmentCount} deferred segments)`,
            );
            return;
          }

          // 回退路径: 保持现有 rIC 全量 hydration
          let materializedCount = 0;
          const pendingMeasureTargets: HTMLElement[] = [];
          for (let idx = activeInitialSegmentCount; idx < activeSegments.length; idx += 1) {
            if (cancelled || !activeChapterWrapper.isConnected) return;

            const targetEl = activeSegmentEls[idx];
            const segment = activeSegments[idx];
            if (!targetEl || !segment) continue;

            materializeVectorSegment(targetEl, segment);
            targetEl.setAttribute('data-shadow-segment-state', 'hydrated');
            targetEl.style.minHeight = '0px';
            pendingMeasureTargets.push(targetEl);

            const hasMediaAsset = targetEl.querySelector(SEGMENT_ASSET_SELECTOR);
            if (idx % HYDRATE_MEDIA_CHECK_INTERVAL === 0 && hasMediaAsset) {
              await waitForAssetLoad(targetEl, {
                chapterSizeHint: segment.charCount,
                timeoutMs: HYDRATE_MEDIA_LOAD_TIMEOUT_MS,
                maxTrackedImages: HYDRATE_MEDIA_MAX_TRACKED_IMAGES,
                largeChapterThreshold: LARGE_CHAPTER_HTML_THRESHOLD,
                resourceExists,
              });
            }

            const isLastSegment = idx === activeSegments.length - 1;
            const shouldMeasureBatch = pendingMeasureTargets.length >= VECTOR_HYDRATE_MEASURE_BATCH_SIZE || isLastSegment;
            if (shouldMeasureBatch) {
              const measureBatch = pendingMeasureTargets.splice(0, pendingMeasureTargets.length);
              await calibrateSegmentIntrinsicSizeBatch(measureBatch);
            }

            materializedCount += 1;
            if (materializedCount % VECTOR_HYDRATE_YIELD_EVERY_SEGMENTS === 0) {
              await yieldForHydration();
            }
          }

          if (!cancelled && activeChapterWrapper.isConnected) {
            const finalHeight = getContainerHeight(activeChapterWrapper);
            console.log(
              `[ShadowRenderer] Chapter "${chapterId}" vectorized hydration done. Final: ${finalHeight}px`,
            );
          }
        });

        const traceSnapshot = finalizeVitraRenderTrace(trace);
        console.log(formatVitraRenderTrace(traceSnapshot));
      } catch (error) {
        if (cancelled) return;
        const err = error instanceof Error ? error : new Error(String(error));
        console.error(`[ShadowRenderer] Render error for "${chapterId}":`, err);
        onError?.(err);
      }
    };

    renderAndMeasure();

    // 字体加载完成后，如果测量已完成，触发高度重校准
    const handleFontLoaded = () => {
      if (!hasReportedRef.current || cancelled) return;
      const wrapper = container.querySelector('.chapter-content') as HTMLElement | null;
      if (!wrapper || !wrapper.isConnected) return;
      const recalibratedHeight = getContainerHeight(wrapper);
      console.log(`[ShadowRenderer] Font loaded recalibration for "${chapterId}": ${recalibratedHeight}px`);
      onReady(wrapper, recalibratedHeight);
    };
    document.fonts?.addEventListener?.('loadingdone', handleFontLoaded);

    return () => {
      if (!hasReportedRef.current) {
        cancelled = true;
      }
      document.fonts?.removeEventListener?.('loadingdone', handleFontLoaded);
    };
  }, [htmlContent, htmlFragments, segmentMetas, chapterId, externalStyles, preprocessed, onReady, onError, buildContentCss]);

  return (
    <div
      ref={containerRef}
      className={styles.shadowContainer}
      aria-hidden="true"
    />
  );
}

function buildLocalProcessedPayload(
  htmlContent: string,
  externalStyles: readonly string[],
  chapterId: string,
): {
  cleanedHtml: string;
  processedStyles: string[];
  fragments: readonly string[];
} {
  const sanitizedHtml = sanitizeChapterHtml(htmlContent).htmlContent;
  const inlineStyles = sanitizeStyleSheets(extractStyles(sanitizedHtml));
  const cleanedHtml = removeStyleTags(sanitizedHtml);
  const sanitizedExternalStyles = sanitizeStyleSheets([...externalStyles]);
  const allStyles = [...sanitizedExternalStyles, ...inlineStyles];
  const scopedStyles = allStyles
    .map((css) => scopeStyles(css, chapterId))
    .filter((css) => css.trim().length > 0);

  return {
    cleanedHtml,
    processedStyles: scopedStyles,
    fragments: [cleanedHtml],
  };
}
