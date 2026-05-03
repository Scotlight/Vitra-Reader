import type { AssetLoadOptions } from '@/utils/assetLoader';
import type { SegmentMeta } from '@/engine/types/vectorRender';
import {
  LARGE_CHAPTER_HTML_THRESHOLD,
  MEDIA_SENSITIVE_LOAD_TIMEOUT_MS,
  MEDIA_SENSITIVE_MAX_TRACKED_IMAGES,
  RENDER_VECTORIZED_LOAD_TIMEOUT_MS,
  RENDER_LARGE_CHAPTER_LOAD_TIMEOUT_MS,
  RENDER_VECTORIZED_MAX_TRACKED_IMAGES,
  RENDER_LARGE_MAX_TRACKED_IMAGES,
  RENDER_NORMAL_MAX_TRACKED_IMAGES,
  HYDRATE_MEDIA_LOAD_TIMEOUT_MS,
  HYDRATE_MEDIA_MAX_TRACKED_IMAGES,
} from './shadowRendererConstants';
import type { ChapterVectorSegment } from './shadowRendererTypes';
import type { ReaderStyleConfig } from './contentCss';
import { getSegmentMetaTotalChars, hasSegmentMetaMedia, vectorizeChapterContent } from './vectorization';
import { hasLayoutSensitiveMedia } from './mediaLayout';

export function buildRenderAssetLoadOptions(options: {
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

export function buildHydrateAssetLoadOptions(
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

export function resolveChapterRenderTraits(
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

export function buildVectorSegments(options: {
  mode: 'scroll' | 'paginated';
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
