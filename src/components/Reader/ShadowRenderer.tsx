import { useRef, useEffect, useCallback } from 'react';
import styles from './ShadowRenderer.module.css';
import { waitForAssetLoad, getContainerHeight, type AssetLoadOptions } from '@/utils/assetLoader';
import { generateCSSOverride, generatePaginatedCSSOverride } from '@/utils/styleProcessor';
import { SegmentDomPool } from '@/engine/render/segmentDomPool';
import {
  createRenderTrace,
  finalizeRenderTrace,
  formatRenderTrace,
  runRenderStage,
} from '@/engine/render/renderStageTrace';
import { buildVectorRenderPlan } from '@/engine/render/vectorPlanner';
import type { SegmentMeta } from '@/engine/types/vectorRender';

// ── Re-export 公共 API（保持调用方 import 不变） ──
export type { ReaderStyleConfig, CreateWindowedVectorChapterShellOptions } from './shadowRenderer/contentCss';
export { createWindowedVectorChapterShell } from './shadowRenderer/windowedVectorShell';

// ── 子模块 import ──
import {
  LARGE_CHAPTER_HTML_THRESHOLD,
  VECTOR_MIN_SEGMENT_EST_HEIGHT,
  VECTOR_HYDRATE_YIELD_EVERY_SEGMENTS,
  VECTOR_HYDRATE_MEASURE_BATCH_SIZE,
  SEGMENT_ASSET_SELECTOR,
  MEDIA_SENSITIVE_LOAD_TIMEOUT_MS,
  MEDIA_SENSITIVE_MAX_TRACKED_IMAGES,
  RENDER_VECTORIZED_LOAD_TIMEOUT_MS,
  RENDER_LARGE_CHAPTER_LOAD_TIMEOUT_MS,
  RENDER_VECTORIZED_MAX_TRACKED_IMAGES,
  RENDER_LARGE_MAX_TRACKED_IMAGES,
  RENDER_NORMAL_MAX_TRACKED_IMAGES,
  HYDRATE_MEDIA_CHECK_INTERVAL,
  HYDRATE_MEDIA_LOAD_TIMEOUT_MS,
  HYDRATE_MEDIA_MAX_TRACKED_IMAGES,
} from './shadowRenderer/shadowRendererConstants';
import type { ChapterVectorSegment, ShadowRenderContext } from './shadowRenderer/shadowRendererTypes';
import { vectorizeChapterContent, materializeVectorSegment, applyPlaceholderSizing, resolveInitialShadowSegmentCount, calibrateSegmentIntrinsicSizeBatch, getSegmentMetaTotalChars, hasSegmentMetaMedia } from './shadowRenderer/vectorization';
import { appendHtmlContentChunked, appendHtmlFragmentsChunked, normalizeHtmlFragments } from './shadowRenderer/htmlChunkedAppend';
import { hasLayoutSensitiveMedia, enforceDeterministicMediaLayout } from './shadowRenderer/mediaLayout';
import { buildScopedContentCss, type ReaderStyleConfig } from './shadowRenderer/contentCss';
import { buildLocalProcessedPayload } from './shadowRenderer/localProcessedPayload';
import { yieldForHydration } from './shadowRenderer/yieldScheduling';

export const segmentPool = new SegmentDomPool();

type ShadowRendererMode = 'scroll' | 'paginated';

export interface ShadowRendererProps {
  htmlContent: string;
  htmlFragments?: string[];
  segmentMetas?: SegmentMeta[];
  chapterId: string;
  externalStyles?: string[];
  preprocessed?: boolean;
  onReady: (node: HTMLElement, height: number) => void;
  onError?: (error: Error) => void;
  readerStyles: ReaderStyleConfig;
  resourceExists?: (url: string) => boolean;
  mode?: ShadowRendererMode;
}

function createChapterWrapper(chapterId: string): HTMLDivElement {
  const chapterWrapper = document.createElement('div');
  chapterWrapper.setAttribute('data-chapter-id', chapterId);
  chapterWrapper.className = 'chapter-content';
  chapterWrapper.style.width = '100%';
  chapterWrapper.style.position = 'relative';
  chapterWrapper.style.display = 'flow-root';
  return chapterWrapper;
}

function appendRenderStyles(
  chapterWrapper: HTMLElement,
  options: {
    mode: ShadowRendererMode;
    chapterId: string;
    processedStyles: readonly string[];
    contentCss: string;
  },
): void {
  const styleEl = document.createElement('style');
  const cssOverride = options.mode === 'paginated'
    ? generatePaginatedCSSOverride(options.chapterId)
    : generateCSSOverride(options.chapterId);
  styleEl.textContent = [
    cssOverride,
    options.processedStyles.join('\n'),
    options.contentCss,
  ].join('\n');
  chapterWrapper.appendChild(styleEl);
}

function createFlowRootDiv(): HTMLDivElement {
  const contentDiv = document.createElement('div');
  contentDiv.style.display = 'flow-root';
  return contentDiv;
}

function createShadowSegmentElement(
  segment: ChapterVectorSegment,
  segmentIndex: number,
  initialSegmentCount: number,
): HTMLElement {
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

  return segmentEl;
}

async function appendRenderedContent(
  contentDiv: HTMLElement,
  options: {
    canUseVectorized: boolean;
    vectorSegments: readonly ChapterVectorSegment[];
    initialSegmentCount: number;
    normalizedFragments: readonly string[];
    isLargeChapter: boolean;
    cleanedHtml: string;
  },
): Promise<HTMLElement[]> {
  const segmentEls: HTMLElement[] = [];

  if (options.canUseVectorized) {
    options.vectorSegments.forEach((segment, segmentIndex) => {
      const segmentEl = createShadowSegmentElement(segment, segmentIndex, options.initialSegmentCount);
      contentDiv.appendChild(segmentEl);
      segmentEls.push(segmentEl);
    });
    return segmentEls;
  }

  if (options.normalizedFragments.length > 1) {
    await appendHtmlFragmentsChunked(contentDiv, options.normalizedFragments);
  } else if (options.isLargeChapter) {
    await appendHtmlContentChunked(contentDiv, options.cleanedHtml);
  } else {
    contentDiv.innerHTML = options.cleanedHtml;
  }

  return segmentEls;
}

function buildRenderAssetLoadOptions(options: {
  cleanedHtmlLength: number;
  mediaSensitiveChapter: boolean;
  canUseVectorized: boolean;
  isLargeChapter: boolean;
  resourceExists?: (url: string) => boolean;
}): AssetLoadOptions {
  return {
    chapterSizeHint: options.cleanedHtmlLength,
    timeoutMs: options.mediaSensitiveChapter
      ? MEDIA_SENSITIVE_LOAD_TIMEOUT_MS
      : (options.canUseVectorized ? RENDER_VECTORIZED_LOAD_TIMEOUT_MS : (options.isLargeChapter ? RENDER_LARGE_CHAPTER_LOAD_TIMEOUT_MS : undefined)),
    maxTrackedImages: options.mediaSensitiveChapter
      ? MEDIA_SENSITIVE_MAX_TRACKED_IMAGES
      : (options.canUseVectorized ? RENDER_VECTORIZED_MAX_TRACKED_IMAGES : (options.isLargeChapter ? RENDER_LARGE_MAX_TRACKED_IMAGES : RENDER_NORMAL_MAX_TRACKED_IMAGES)),
    largeChapterThreshold: options.mediaSensitiveChapter
      ? Number.POSITIVE_INFINITY
      : LARGE_CHAPTER_HTML_THRESHOLD,
    resourceExists: options.resourceExists,
  };
}

function buildHydrateAssetLoadOptions(
  segment: ChapterVectorSegment,
  resourceExists?: (url: string) => boolean,
): AssetLoadOptions {
  return {
    chapterSizeHint: segment.charCount,
    timeoutMs: HYDRATE_MEDIA_LOAD_TIMEOUT_MS,
    maxTrackedImages: HYDRATE_MEDIA_MAX_TRACKED_IMAGES,
    largeChapterThreshold: LARGE_CHAPTER_HTML_THRESHOLD,
    resourceExists,
  };
}

function resolveChapterRenderTraits(
  cleanedHtml: string,
  segmentMetas?: readonly SegmentMeta[],
): {
  chapterSize: number;
  isLargeChapter: boolean;
  mediaSensitiveChapter: boolean;
} {
  const chapterSize = cleanedHtml.length > 0
    ? cleanedHtml.length
    : getSegmentMetaTotalChars(segmentMetas);
  return {
    chapterSize,
    isLargeChapter: chapterSize >= LARGE_CHAPTER_HTML_THRESHOLD,
    mediaSensitiveChapter: cleanedHtml.length > 0
      ? hasLayoutSensitiveMedia(cleanedHtml)
      : hasSegmentMetaMedia(segmentMetas),
  };
}

function buildVectorSegments(options: {
  mode: ShadowRendererMode;
  isLargeChapter: boolean;
  segmentMetas?: readonly SegmentMeta[];
  cleanedHtml: string;
  readerStyles: ReaderStyleConfig;
}): ChapterVectorSegment[] {
  if (options.mode !== 'scroll' || !options.isLargeChapter) return [];
  if (options.segmentMetas && options.segmentMetas.length > 0) {
    return options.segmentMetas.map((meta): ChapterVectorSegment => ({
      index: meta.index,
      nodes: [],
      charCount: meta.charCount,
      estimatedHeight: meta.estimatedHeight,
      _htmlContent: meta.htmlContent,
    }));
  }
  return vectorizeChapterContent(options.cleanedHtml, options.readerStyles);
}

/**
 * ShadowRenderer — 离屏渲染组件
 *
 * 在 visibility:hidden 容器中渲染章节 HTML，执行 CSS 注入 / 作用域隔离 /
 * 安全清洗 / 资源等待，最终通过 onReady 返回 DOM 节点 + 精确高度。
 *
 * 渲染管线（parse → measure → paginate → render → hydrate）完全在 useEffect
 * 内串行执行，不拆 hook——管线阶段间共享 cancelled 闭包做统一取消。
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

  const buildContentCss = useCallback(() => {
    return buildScopedContentCss(chapterId, readerStyles);
  }, [readerStyles, chapterId]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    if (!htmlContent && htmlFragments.length === 0 && (!segmentMetas || segmentMetas.length === 0)) return;

    if (currentChapterIdRef.current !== chapterId) {
      hasReportedRef.current = false;
      currentChapterIdRef.current = chapterId;
    }

    if (hasReportedRef.current) return;

    let cancelled = false;

    const renderAndMeasure = async () => {
      if (typeof document !== 'undefined' && document.fonts?.ready) {
        await document.fonts.ready;
      }

      const trace = createRenderTrace(chapterId);
      try {
        const chapterWrapper = createChapterWrapper(chapterId);

        const processed = await runRenderStage(trace, 'parse', () => {
          if (preprocessed) {
            return {
              cleanedHtml: htmlContent,
              processedStyles: externalStyles,
              fragments: normalizeHtmlFragments(htmlFragments, htmlContent, segmentMetas),
            };
          }
          return buildLocalProcessedPayload(htmlContent, externalStyles, chapterId);
        });

        const cleanedHtml = processed.cleanedHtml;
        const processedStyles = processed.processedStyles;
        const normalizedFragments = processed.fragments;
        const {
          chapterSize,
          isLargeChapter,
          mediaSensitiveChapter,
        } = resolveChapterRenderTraits(cleanedHtml, segmentMetas);

        const vectorSegments = await runRenderStage(trace, 'measure', () => {
          return buildVectorSegments({
            mode,
            isLargeChapter,
            segmentMetas,
            cleanedHtml,
            readerStyles,
          });
        });

        const vectorPlan = await runRenderStage(trace, 'paginate', () => {
          return buildVectorRenderPlan({
            mode,
            chapterSize,
            segmentCount: vectorSegments.length,
          });
        });

        const renderContext = await runRenderStage<ShadowRenderContext | null>(trace, 'render', async () => {
          appendRenderStyles(chapterWrapper, {
            mode,
            chapterId,
            processedStyles,
            contentCss: buildContentCss(),
          });

          const contentDiv = createFlowRootDiv();
          const canUseVectorized = vectorPlan.enabled;
          const initialSegmentCount = canUseVectorized
            ? resolveInitialShadowSegmentCount(
              vectorSegments.length,
              vectorPlan.initialSegmentCount,
              mediaSensitiveChapter,
            )
            : 0;
          const segmentEls = await appendRenderedContent(contentDiv, {
            canUseVectorized,
            vectorSegments,
            initialSegmentCount,
            normalizedFragments,
            isLargeChapter,
            cleanedHtml,
          });

          chapterWrapper.appendChild(contentDiv);
          enforceDeterministicMediaLayout(chapterWrapper);

          container.innerHTML = '';
          container.appendChild(chapterWrapper);
          if (cancelled) return null;

          await waitForAssetLoad(chapterWrapper, buildRenderAssetLoadOptions({
            cleanedHtmlLength: cleanedHtml.length,
            mediaSensitiveChapter,
            canUseVectorized,
            isLargeChapter,
            resourceExists,
          }));
          if (cancelled) return null;

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

        await runRenderStage(trace, 'hydrate', async () => {
          const {
            chapterWrapper: activeChapterWrapper,
            canUseVectorized,
            vectorSegments: activeSegments,
            segmentEls: activeSegmentEls,
            initialSegmentCount: activeInitialSegmentCount,
          } = renderContext;

          if (!canUseVectorized || activeSegments.length <= activeInitialSegmentCount) return;

          const isWorkerVectorized = segmentMetas && segmentMetas.length > 0;
          if (isWorkerVectorized) {
            console.log(
              `[ShadowRenderer] Chapter "${chapterId}" using IO-driven hydration (${activeSegments.length - activeInitialSegmentCount} deferred segments)`,
            );
            return;
          }

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
              await waitForAssetLoad(targetEl, buildHydrateAssetLoadOptions(segment, resourceExists));
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

        const traceSnapshot = finalizeRenderTrace(trace);
        console.log(formatRenderTrace(traceSnapshot));
      } catch (error) {
        if (cancelled) return;
        const err = error instanceof Error ? error : new Error(String(error));
        console.error(`[ShadowRenderer] Render error for "${chapterId}":`, err);
        onError?.(err);
      }
    };

    renderAndMeasure();

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
