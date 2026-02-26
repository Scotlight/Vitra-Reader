import type { SegmentMeta, ChapterMetaVector } from '../types/vectorRender';

/**
 * Piece Table: 从 buffer 按需 slice 段内容。
 * 若 meta.htmlContent 已填充则直接返回（缓存），否则从 buffer 中 slice。
 */
export function resolveSegmentHtml(buffer: string, meta: SegmentMeta): string {
  if (meta.htmlContent) return meta.htmlContent;
  const resolved = buffer.slice(meta.bufferOffset, meta.bufferOffset + meta.bufferLength);
  // 缓存到 meta 上，避免重复 slice
  meta.htmlContent = resolved;
  return resolved;
}

/**
 * O(log N) 二分查找 — 返回包含 offset 的段索引。
 * 若 offset 超出总高度则返回最后一段。
 */
export function findSegmentByOffset(segments: readonly SegmentMeta[], offset: number): number {
  if (segments.length === 0) return -1;
  if (offset <= 0) return 0;

  let lo = 0;
  let hi = segments.length - 1;

  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1;
    if (segments[mid].offsetY <= offset) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }

  return lo;
}

/**
 * 计算可见段范围（含 overscan 缓冲区）。
 * 返回 [startIndex, endIndex]（inclusive）。
 */
export function computeVisibleRange(
  segments: readonly SegmentMeta[],
  scrollOffset: number,
  viewportHeight: number,
  overscan: number = 2,
): { startIndex: number; endIndex: number } {
  if (segments.length === 0) return { startIndex: 0, endIndex: -1 };

  const topEdge = Math.max(0, scrollOffset);
  const bottomEdge = topEdge + viewportHeight;

  const rawStart = findSegmentByOffset(segments, topEdge);
  const rawEnd = findSegmentByOffset(segments, bottomEdge);

  const startIndex = Math.max(0, rawStart - overscan);
  const endIndex = Math.min(segments.length - 1, rawEnd + overscan);

  return { startIndex, endIndex };
}

/**
 * 批量更新段高度 + 一次性重算全部 offsetY。
 * 返回 totalDelta（用于滚动补偿）。
 */
export function batchUpdateSegmentHeights(
  vector: ChapterMetaVector,
  updates: readonly { index: number; realHeight: number }[],
): number {
  let totalDelta = 0;

  for (const { index, realHeight } of updates) {
    const seg = vector.segments[index];
    if (!seg) continue;

    const oldHeight = seg.realHeight ?? seg.estimatedHeight;
    seg.realHeight = realHeight;
    seg.measured = true;
    totalDelta += realHeight - oldHeight;
  }

  // 一次性重算全部 offsetY
  let cumulativeY = 0;
  let allMeasured = true;
  for (const seg of vector.segments) {
    seg.offsetY = cumulativeY;
    const height = seg.realHeight ?? seg.estimatedHeight;
    cumulativeY += height;
    if (!seg.measured) allMeasured = false;
  }

  vector.totalMeasuredHeight = cumulativeY;
  vector.totalEstimatedHeight = cumulativeY;
  vector.fullyMeasured = allMeasured;

  return totalDelta;
}

/**
 * 从 SegmentMeta[] 构建 ChapterMetaVector。
 * @param buffer Piece Table 不可变 HTML buffer
 */
export function buildChapterMetaVector(
  chapterId: string,
  spineIndex: number,
  segments: SegmentMeta[],
  buffer: string,
): ChapterMetaVector {
  let totalHeight = 0;
  for (const seg of segments) {
    totalHeight += seg.realHeight ?? seg.estimatedHeight;
  }

  return {
    chapterId,
    spineIndex,
    buffer,
    segments,
    totalEstimatedHeight: totalHeight,
    totalMeasuredHeight: totalHeight,
    fullyMeasured: false,
  };
}
