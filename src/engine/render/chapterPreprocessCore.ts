import type {
  ChapterPreprocessInput,
  ChapterPreprocessResult,
} from '../types/chapterPreprocess';
import type { SegmentMeta, VectorizeConfig } from '../types/vectorRender';
import { buildVitraVectorRenderPlan } from './vitraVectorPlanner';
import {
  sanitizeChapterHtml,
  sanitizeStyleSheets,
} from '../core/contentSanitizer';
import {
  extractStyles,
  removeStyleTags,
  scopeStyles,
} from '../../utils/styleProcessor';
import {
  streamHtmlBySaxStream,
} from './htmlSaxStream';

const FRAGMENT_TARGET_CHARS = 120_000;
const FRAGMENT_HARD_MAX_CHARS = 180_000;
const VECTOR_MIN_SEGMENT_EST_HEIGHT = 96;
const VECTORIZE_HTML_LENGTH_THRESHOLD = 150_000;

interface AppendSegmentOptions {
  segments: SegmentMeta[];
  html: string;
  start: number;
  end: number;
  offsetY: number;
  hasMedia: boolean;
  config: VectorizeConfig;
}

function cutsInsideTag(html: string, index: number): boolean {
  if (index <= 0 || index >= html.length) return false;
  const left = html.lastIndexOf('<', index - 1);
  if (left < 0) return false;
  const right = html.lastIndexOf('>', index - 1);
  return left > right;
}

function shouldDropFullHtmlPayload(
  cleanedHtml: string,
  segmentMetas: readonly SegmentMeta[] | undefined,
): boolean {
  if (!segmentMetas || segmentMetas.length === 0) return false;
  return buildVitraVectorRenderPlan({
    mode: 'scroll',
    chapterSize: cleanedHtml.length,
    segmentCount: segmentMetas.length,
  }).enabled;
}

export function preprocessChapterCore(input: ChapterPreprocessInput): ChapterPreprocessResult {
  const sanitized = sanitizeChapterHtml(input.htmlContent);
  const inlineStyles = sanitizeStyleSheets(extractStyles(sanitized.htmlContent));
  const sanitizedExternalStyles = sanitizeStyleSheets(input.externalStyles);
  const cleanedHtml = removeStyleTags(sanitized.htmlContent);
  const scopedStyles = [...sanitizedExternalStyles, ...inlineStyles]
    .map((css) => scopeStyles(css, input.chapterId))
    .filter((css) => css.trim().length > 0);

  let segmentMetas: SegmentMeta[] | undefined;
  if (input.vectorize && cleanedHtml.length >= VECTORIZE_HTML_LENGTH_THRESHOLD && input.vectorConfig) {
    segmentMetas = vectorizeHtmlToSegmentMetas(cleanedHtml, input.vectorConfig);
  }
  const shouldDropHtmlPayload = shouldDropFullHtmlPayload(cleanedHtml, segmentMetas);

  return {
    htmlContent: shouldDropHtmlPayload ? '' : cleanedHtml,
    htmlFragments: shouldDropHtmlPayload ? [] : splitHtmlIntoFragments(cleanedHtml),
    externalStyles: scopedStyles,
    removedTagCount: sanitized.removedTagCount,
    removedAttributeCount: sanitized.removedAttributeCount,
    usedFallback: sanitized.usedFallback,
    stylesScoped: true,
    segmentMetas,
  };
}

function buildTailFragments(html: string, start: number): string[] | null {
  if (start >= html.length) return [];
  if (html.length - start <= FRAGMENT_HARD_MAX_CHARS) {
    return [html.slice(start)];
  }

  const fragments: string[] = [];
  for (let offset = start; offset < html.length; offset += FRAGMENT_HARD_MAX_CHARS) {
    const end = Math.min(offset + FRAGMENT_HARD_MAX_CHARS, html.length);
    if (end < html.length && cutsInsideTag(html, end)) {
      return null;
    }
    fragments.push(html.slice(offset, end));
  }
  return fragments;
}

function splitHtmlIntoFragments(html: string): string[] {
  if (!html || html.length <= FRAGMENT_TARGET_CHARS) {
    return [html];
  }

  const fragments: string[] = [];
  let start = 0;
  let lastSafeCut = 0;
  let fallbackToWholeHtml = false;

  streamHtmlBySaxStream(html, {
    onBlockBoundary(end) {
      if (end - start < FRAGMENT_TARGET_CHARS) {
        lastSafeCut = end;
        return;
      }

      const hardCut = Math.min(end, start + FRAGMENT_HARD_MAX_CHARS);
      const cutPoint = lastSafeCut > start ? lastSafeCut : hardCut;
      if (cutsInsideTag(html, cutPoint)) {
        fallbackToWholeHtml = true;
        return false;
      }

      fragments.push(html.slice(start, cutPoint));
      start = cutPoint;
      lastSafeCut = cutPoint;
      return;
    },
  });

  if (fallbackToWholeHtml) {
    return [html];
  }

  const tailFragments = buildTailFragments(html, start);
  if (!tailFragments) return [html];
  fragments.push(...tailFragments);

  return fragments.length > 0 ? fragments : [html];
}

function estimateSegmentHeightPure(charCount: number, config: VectorizeConfig): number {
  const fontSize = Math.max(11, config.fontSize || 16);
  const width = Math.max(360, Math.min(1400, config.pageWidth || 900));
  const charsPerLine = Math.max(18, Math.floor((width / fontSize) * 1.75));
  const estimatedLines = Math.max(2, Math.ceil(Math.max(1, charCount) / charsPerLine));
  const lineHeightPx = Math.max(fontSize * 1.25, fontSize * (config.lineHeight || 1.6));
  const paragraphFactor = Math.max(1.04, 1 + (config.paragraphSpacing || 0) / 220);

  return Math.max(
    VECTOR_MIN_SEGMENT_EST_HEIGHT,
    Math.ceil(estimatedLines * lineHeightPx * paragraphFactor),
  );
}

function appendSegmentMeta(options: AppendSegmentOptions): number {
  const {
    segments,
    html,
    start,
    end,
    offsetY,
    hasMedia,
    config,
  } = options;
  const charCount = end - start;
  const estimatedHeight = estimateSegmentHeightPure(charCount, config);
  segments.push({
    index: segments.length,
    charCount,
    estimatedHeight,
    realHeight: null,
    offsetY,
    measured: false,
    htmlContent: html.slice(start, end),
    hasMedia,
  });
  return offsetY + estimatedHeight;
}

function consumeQueuedMediaOffsets(
  mediaOffsets: number[],
  cursorRef: { value: number },
  end: number,
): boolean {
  let cursor = cursorRef.value;
  let hasMedia = false;
  while (cursor < mediaOffsets.length && mediaOffsets[cursor] < end) {
    hasMedia = true;
    cursor += 1;
  }

  if (cursor > 0) {
    mediaOffsets.splice(0, cursor);
    cursor = 0;
  }
  cursorRef.value = cursor;
  return hasMedia;
}

function detectAnyMediaTag(html: string): boolean {
  let hasMedia = false;
  streamHtmlBySaxStream(html, {
    onMediaTag() {
      hasMedia = true;
      return false;
    },
  });
  return hasMedia;
}

/**
 * Worker 侧流式/SAX 向量化：
 * - 以 SAX 回调按序消费，不预先构造完整边界数组
 * - 仅在落段时 slice 内容，避免频繁中间分配
 */
export function vectorizeHtmlToSegmentMetas(
  html: string,
  config: VectorizeConfig,
): SegmentMeta[] {
  const targetChars = Math.max(4_000, config.targetChars || 16_000);

  if (!html || html.length <= targetChars) {
    return [buildSingleSegmentMeta(html, 0, config, detectAnyMediaTag(html))];
  }

  const segments: SegmentMeta[] = [];
  const pendingMediaOffsets: number[] = [];
  const mediaCursor = { value: 0 };
  let start = 0;
  let lastSafeCut = 0;
  let cumulativeOffsetY = 0;
  let fallbackToSingleSegment = false;

  streamHtmlBySaxStream(html, {
    onMediaTag(offset) {
      pendingMediaOffsets.push(offset);
    },
    onBlockBoundary(end) {
      if (end - start < targetChars) {
        lastSafeCut = end;
        return;
      }

      const cutPoint = lastSafeCut > start ? lastSafeCut : end;
      if (cutsInsideTag(html, cutPoint)) {
        fallbackToSingleSegment = true;
        return false;
      }

      const hasMedia = consumeQueuedMediaOffsets(pendingMediaOffsets, mediaCursor, cutPoint);
      cumulativeOffsetY = appendSegmentMeta({
        segments,
        html,
        start,
        end: cutPoint,
        offsetY: cumulativeOffsetY,
        hasMedia,
        config,
      });
      start = cutPoint;
      lastSafeCut = cutPoint;
      return;
    },
  });

  if (fallbackToSingleSegment) {
    return [buildSingleSegmentMeta(html, 0, config, detectAnyMediaTag(html))];
  }

  if (start < html.length) {
    const hasMedia = pendingMediaOffsets.length > 0;
    appendSegmentMeta({
      segments,
      html,
      start,
      end: html.length,
      offsetY: cumulativeOffsetY,
      hasMedia,
      config,
    });
  }

  if (segments.length === 0) {
    return [buildSingleSegmentMeta(html, 0, config, pendingMediaOffsets.length > 0)];
  }
  return segments;
}

function buildSingleSegmentMeta(
  html: string,
  offsetY: number,
  config: VectorizeConfig,
  hasMedia: boolean,
): SegmentMeta {
  const charCount = html.length;
  return {
    index: 0,
    charCount,
    estimatedHeight: estimateSegmentHeightPure(charCount, config),
    realHeight: null,
    offsetY,
    measured: false,
    htmlContent: html,
    hasMedia,
  };
}
