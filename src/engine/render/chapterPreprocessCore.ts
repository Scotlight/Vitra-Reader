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
} from '@/utils/styleProcessor';
import {
  consumeMediaOffsetInRange,
  scanHtmlBySaxStream,
} from './htmlSaxStream';

const FRAGMENT_TARGET_CHARS = 120_000;
const FRAGMENT_HARD_MAX_CHARS = 180_000;
const VECTOR_MIN_SEGMENT_EST_HEIGHT = 96;
const VECTORIZE_HTML_LENGTH_THRESHOLD = 450_000;

// 用于 hasRenderableContent 判断，避免在调用方重复 regex 扫描
const MEDIA_TAG_RE = /<(img|svg|video|audio|canvas|table|math|object|embed)\b/i;
const VISIBLE_TEXT_RE = /[^\s<>&]/;

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
  const hasRenderableContent = MEDIA_TAG_RE.test(cleanedHtml) || VISIBLE_TEXT_RE.test(cleanedHtml);

  return {
    htmlContent: shouldDropHtmlPayload ? '' : cleanedHtml,
    htmlFragments: shouldDropHtmlPayload ? [] : splitHtmlIntoFragments(cleanedHtml),
    externalStyles: scopedStyles,
    removedTagCount: sanitized.removedTagCount,
    removedAttributeCount: sanitized.removedAttributeCount,
    usedFallback: sanitized.usedFallback,
    stylesScoped: true,
    hasRenderableContent,
    segmentMetas,
  };
}

const yieldToMain = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

/** Worker 不可用时的 async fallback，各阶段之间 yield 避免阻塞主线程 */
export async function preprocessChapterCoreAsync(input: ChapterPreprocessInput): Promise<ChapterPreprocessResult> {
  // stage 1: sanitize（含 DOMParser，不可分片，作为单一块）
  const sanitized = sanitizeChapterHtml(input.htmlContent);
  await yieldToMain();

  // stage 2: style extract + remove
  const inlineStyles = sanitizeStyleSheets(extractStyles(sanitized.htmlContent));
  const sanitizedExternalStyles = sanitizeStyleSheets(input.externalStyles);
  const cleanedHtml = removeStyleTags(sanitized.htmlContent);
  await yieldToMain();

  // stage 3: scope styles
  const scopedStyles = [...sanitizedExternalStyles, ...inlineStyles]
    .map((css) => scopeStyles(css, input.chapterId))
    .filter((css) => css.trim().length > 0);
  await yieldToMain();

  // stage 4: vectorize（可选，仅大章节触发）
  let segmentMetas: SegmentMeta[] | undefined;
  if (input.vectorize && cleanedHtml.length >= VECTORIZE_HTML_LENGTH_THRESHOLD && input.vectorConfig) {
    segmentMetas = vectorizeHtmlToSegmentMetas(cleanedHtml, input.vectorConfig);
    await yieldToMain();
  }

  // stage 5: split fragments
  const shouldDropHtmlPayload = shouldDropFullHtmlPayload(cleanedHtml, segmentMetas);
  const hasRenderableContent = MEDIA_TAG_RE.test(cleanedHtml) || VISIBLE_TEXT_RE.test(cleanedHtml);

  return {
    htmlContent: shouldDropHtmlPayload ? '' : cleanedHtml,
    htmlFragments: shouldDropHtmlPayload ? [] : splitHtmlIntoFragments(cleanedHtml),
    externalStyles: scopedStyles,
    removedTagCount: sanitized.removedTagCount,
    removedAttributeCount: sanitized.removedAttributeCount,
    usedFallback: sanitized.usedFallback,
    stylesScoped: true,
    hasRenderableContent,
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

  const { blockBoundaryOffsets } = scanHtmlBySaxStream(html);
  const fragments: string[] = [];
  let start = 0;
  let lastSafeCut = 0;

  for (const end of blockBoundaryOffsets) {
    if (end - start < FRAGMENT_TARGET_CHARS) {
      lastSafeCut = end;
      continue;
    }

    const hardCut = Math.min(end, start + FRAGMENT_HARD_MAX_CHARS);
    const cutPoint = lastSafeCut > start ? lastSafeCut : hardCut;
    if (cutsInsideTag(html, cutPoint)) {
      return [html];
    }

    fragments.push(html.slice(start, cutPoint));
    start = cutPoint;
    lastSafeCut = cutPoint;
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

/**
 * Worker 侧流式/SAX 向量化：
 * - 分块扫描标签事件，不使用 matchAll 全量正则遍历
 * - 仅在落段时 slice 内容，避免频繁中间分配
 */
export function vectorizeHtmlToSegmentMetas(
  html: string,
  config: VectorizeConfig,
): SegmentMeta[] {
  const targetChars = Math.max(4_000, config.targetChars || 16_000);
  const scanResult = scanHtmlBySaxStream(html);

  if (!html || html.length <= targetChars) {
    return [buildSingleSegmentMeta(html, 0, config, scanResult.mediaTagOffsets.length > 0)];
  }

  const segments: SegmentMeta[] = [];
  const mediaCursor = { value: 0 };
  let start = 0;
  let lastSafeCut = 0;
  let cumulativeOffsetY = 0;

  for (const end of scanResult.blockBoundaryOffsets) {
    if (end - start < targetChars) {
      lastSafeCut = end;
      continue;
    }

    const cutPoint = lastSafeCut > start ? lastSafeCut : end;
    if (cutsInsideTag(html, cutPoint)) {
      return [buildSingleSegmentMeta(html, 0, config, scanResult.mediaTagOffsets.length > 0)];
    }

    const hasMedia = consumeMediaOffsetInRange(
      scanResult.mediaTagOffsets,
      start,
      cutPoint,
      mediaCursor,
    );
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
  }

  if (start < html.length) {
    const hasMedia = consumeMediaOffsetInRange(
      scanResult.mediaTagOffsets,
      start,
      html.length,
      mediaCursor,
    );
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
    return [buildSingleSegmentMeta(html, 0, config, scanResult.mediaTagOffsets.length > 0)];
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
