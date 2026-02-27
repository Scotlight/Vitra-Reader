import type {
  ChapterPreprocessInput,
  ChapterPreprocessResult,
} from '../types/chapterPreprocess';
import type { SegmentMeta, VectorizeConfig } from '../types/vectorRender';
import {
  sanitizeChapterHtml,
  sanitizeStyleSheets,
} from './contentSanitizer';
import {
  extractStyles,
  removeStyleTags,
  scopeStyles,
} from './styleProcessor';

const FRAGMENT_TARGET_CHARS = 120_000;
const FRAGMENT_HARD_MAX_CHARS = 180_000;
const FRAGMENT_BREAK_PATTERN = /<\/(?:p|div|section|article|li|blockquote|h[1-6]|table|tr|td|ul|ol)>/gi;
const MEDIA_TAG_PATTERN = /<(?:img|video|picture|svg|canvas|figure|table|math)\b/i;
const VECTOR_MIN_SEGMENT_EST_HEIGHT = 96;
const VECTORIZE_HTML_LENGTH_THRESHOLD = 450_000;

function cutsInsideTag(html: string, index: number): boolean {
  if (index <= 0 || index >= html.length) return false;
  const left = html.lastIndexOf('<', index - 1);
  if (left < 0) return false;
  const right = html.lastIndexOf('>', index - 1);
  return left > right;
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

  return {
    htmlContent: cleanedHtml,
    htmlFragments: splitHtmlIntoFragments(cleanedHtml),
    externalStyles: scopedStyles,
    removedTagCount: sanitized.removedTagCount,
    removedAttributeCount: sanitized.removedAttributeCount,
    usedFallback: sanitized.usedFallback,
    stylesScoped: true,
    segmentMetas,
  };
}

function splitHtmlIntoFragments(html: string): string[] {
  if (!html || html.length <= FRAGMENT_TARGET_CHARS) {
    return [html];
  }

  const fragments: string[] = [];
  let start = 0;
  let lastSafeCut = 0;

  for (const match of html.matchAll(FRAGMENT_BREAK_PATTERN)) {
    const end = (match.index ?? 0) + match[0].length;
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

  if (start < html.length) {
    const tail = html.slice(start);
    if (tail.length <= FRAGMENT_HARD_MAX_CHARS) {
      fragments.push(tail);
    } else {
      for (let offset = 0; offset < tail.length; offset += FRAGMENT_HARD_MAX_CHARS) {
        const end = Math.min(offset + FRAGMENT_HARD_MAX_CHARS, tail.length);
        const cutIndex = start + end;
        if (end < tail.length && cutsInsideTag(html, cutIndex)) {
          return [html];
        }
        fragments.push(tail.slice(offset, end));
      }
    }
  }

  return fragments.filter((fragment) => fragment.length > 0);
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

/**
 * 检测 html[start..end) 范围内是否包含媒体标签，不产生子串分配。
 */
function hasMediaInRange(html: string, start: number, end: number): boolean {
  // 使用 indexOf 链扫描，避免 slice + regex 分配
  for (let i = start; i < end - 3; i++) {
    if (html.charCodeAt(i) !== 0x3C) continue; // '<'
    const rest = html.charCodeAt(i + 1);
    // 快速前缀匹配: i/I(mg), v/V(ideo), p/P(icture), s/S(vg), c/C(anvas), f/F(igure), t/T(able), m/M(ath)
    if (rest === 0x69 || rest === 0x49 || // i/I
        rest === 0x76 || rest === 0x56 || // v/V
        rest === 0x70 || rest === 0x50 || // p/P
        rest === 0x73 || rest === 0x53 || // s/S
        rest === 0x63 || rest === 0x43 || // c/C
        rest === 0x66 || rest === 0x46 || // f/F
        rest === 0x74 || rest === 0x54 || // t/T
        rest === 0x6D || rest === 0x4D) { // m/M
      // 精确正则只检查这一小段
      const snippet = html.slice(i, Math.min(i + 12, end));
      if (MEDIA_TAG_PATTERN.test(snippet)) return true;
    }
  }
  return false;
}

/**
 * Worker 侧纯字符串向量化 — 直接存储段 htmlContent。
 *
 * 每段切分后直接 slice 复制 htmlContent 到 SegmentMeta，
 * Transferable 传输时编码为 NUL 分隔 ArrayBuffer（零拷贝）。
 */
export function vectorizeHtmlToSegmentMetas(
  html: string,
  config: VectorizeConfig,
): SegmentMeta[] {
  const targetChars = Math.max(4_000, config.targetChars || 16_000);

  if (!html || html.length <= targetChars) {
    return [buildSingleSegmentMeta(html, 0, config)];
  }

  const segments: SegmentMeta[] = [];
  let start = 0;
  let lastSafeCut = 0;
  let cumulativeOffsetY = 0;

  const breakPattern = new RegExp(FRAGMENT_BREAK_PATTERN.source, 'gi');

  for (const match of html.matchAll(breakPattern)) {
    const end = (match.index ?? 0) + match[0].length;
    if (end - start < targetChars) {
      lastSafeCut = end;
      continue;
    }

    const cutPoint = lastSafeCut > start ? lastSafeCut : end;
    if (cutsInsideTag(html, cutPoint)) {
      return [buildSingleSegmentMeta(html, 0, config)];
    }

    const charCount = cutPoint - start;
    const estHeight = estimateSegmentHeightPure(charCount, config);
    segments.push({
      index: segments.length,
      charCount,
      estimatedHeight: estHeight,
      realHeight: null,
      offsetY: cumulativeOffsetY,
      measured: false,
      htmlContent: html.slice(start, cutPoint),
      hasMedia: hasMediaInRange(html, start, cutPoint),
    });
    cumulativeOffsetY += estHeight;
    start = cutPoint;
    lastSafeCut = cutPoint;
  }

  // 处理尾部
  if (start < html.length) {
    const charCount = html.length - start;
    const estHeight = estimateSegmentHeightPure(charCount, config);
    segments.push({
      index: segments.length,
      charCount,
      estimatedHeight: estHeight,
      realHeight: null,
      offsetY: cumulativeOffsetY,
      measured: false,
      htmlContent: html.slice(start),
      hasMedia: hasMediaInRange(html, start, html.length),
    });
  }

  return segments.length > 0 ? segments : [buildSingleSegmentMeta(html, 0, config)];
}

function buildSingleSegmentMeta(html: string, offsetY: number, config: VectorizeConfig): SegmentMeta {
  const charCount = html.length;
  return {
    index: 0,
    charCount,
    estimatedHeight: estimateSegmentHeightPure(charCount, config),
    realHeight: null,
    offsetY,
    measured: false,
    htmlContent: html,
    hasMedia: MEDIA_TAG_PATTERN.test(html),
  };
}
