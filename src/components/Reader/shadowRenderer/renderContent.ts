import { SegmentDomPool } from '@/engine/render/segmentDomPool';
import { generateCSSOverride, generatePaginatedCSSOverride } from '@/utils/styleProcessor';
import { VECTOR_MIN_SEGMENT_EST_HEIGHT } from './shadowRendererConstants';
import type { ChapterVectorSegment } from './shadowRendererTypes';
import { materializeVectorSegment, applyPlaceholderSizing } from './vectorization';
import { appendHtmlContentChunked, appendHtmlFragmentsChunked } from './htmlChunkedAppend';

export const segmentPool = new SegmentDomPool();

export function createChapterWrapper(chapterId: string): HTMLDivElement {
  const chapterWrapper = document.createElement('div');
  chapterWrapper.setAttribute('data-chapter-id', chapterId);
  chapterWrapper.className = 'chapter-content';
  chapterWrapper.style.width = '100%';
  chapterWrapper.style.position = 'relative';
  chapterWrapper.style.display = 'flow-root';
  return chapterWrapper;
}

export function appendRenderStyles(
  chapterWrapper: HTMLElement,
  options: {
    mode: 'scroll' | 'paginated';
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

export function createFlowRootDiv(): HTMLDivElement {
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

export async function appendRenderedContent(
  contentDiv: HTMLElement,
  options: {
    canUseVectorized: boolean;
    vectorSegments: readonly ChapterVectorSegment[];
    initialSegmentCount: number;
    normalizedFragments: readonly string[];
    isLargeChapter: boolean;
    sanitizedHtml: string;
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
    await appendHtmlContentChunked(contentDiv, options.sanitizedHtml);
  } else {
    // sanitizedHtml 只接收 buildLocalProcessedPayload / worker 预处理后的已清洗 HTML。
    contentDiv.innerHTML = options.sanitizedHtml;
  }

  return segmentEls;
}
