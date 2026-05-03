import { useRef, useEffect, useCallback } from 'react';
import styles from './ShadowRenderer.module.css';
import { waitForAssetLoad, getContainerHeight } from '@/utils/assetLoader';
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
  VECTOR_HYDRATE_YIELD_EVERY_SEGMENTS,
  VECTOR_HYDRATE_MEASURE_BATCH_SIZE,
  SEGMENT_ASSET_SELECTOR,
  HYDRATE_MEDIA_CHECK_INTERVAL,
} from './shadowRenderer/shadowRendererConstants';
import type { ShadowRenderContext } from './shadowRenderer/shadowRendererTypes';
import { materializeVectorSegment, resolveInitialShadowSegmentCount, calibrateSegmentIntrinsicSizeBatch } from './shadowRenderer/vectorization';
import { normalizeHtmlFragments } from './shadowRenderer/htmlChunkedAppend';
import { enforceDeterministicMediaLayout } from './shadowRenderer/mediaLayout';
import { buildScopedContentCss, type ReaderStyleConfig } from './shadowRenderer/contentCss';
import { buildLocalProcessedPayload } from './shadowRenderer/localProcessedPayload';
import { yieldForHydration } from './shadowRenderer/yieldScheduling';
import {
  appendRenderedContent,
  appendRenderStyles,
  createChapterWrapper,
  createFlowRootDiv,
  segmentPool,
} from './shadowRenderer/renderContent';
import {
  buildHydrateAssetLoadOptions,
  buildRenderAssetLoadOptions,
  buildVectorSegments,
  resolveChapterRenderTraits,
} from './shadowRenderer/renderPlanning';
import { shouldLogShadowRendererDebug } from '@/utils/readerDebug';

export { segmentPool };

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
            sanitizedHtml: cleanedHtml,
          });

          chapterWrapper.appendChild(contentDiv);
          enforceDeterministicMediaLayout(chapterWrapper);

          // 清空离屏容器，随后只挂载当前章节 wrapper。
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
          if (shouldLogShadowRendererDebug()) {
            console.log(`[ShadowRenderer] Chapter "${chapterId}" ready. Height: ${height}px`);
          }
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
            if (shouldLogShadowRendererDebug()) {
              console.log(
                `[ShadowRenderer] Chapter "${chapterId}" using IO-driven hydration (${activeSegments.length - activeInitialSegmentCount} deferred segments)`,
              );
            }
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
            if (shouldLogShadowRendererDebug()) {
              console.log(
                `[ShadowRenderer] Chapter "${chapterId}" vectorized hydration done. Final: ${finalHeight}px`,
              );
            }
          }
        });

        const traceSnapshot = finalizeRenderTrace(trace);
        if (shouldLogShadowRendererDebug()) {
          console.log(formatRenderTrace(traceSnapshot));
        }
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
      if (shouldLogShadowRendererDebug()) {
        console.log(`[ShadowRenderer] Font loaded recalibration for "${chapterId}": ${recalibratedHeight}px`);
      }
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
