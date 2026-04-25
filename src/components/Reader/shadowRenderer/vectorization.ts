/**
 * 段向量化相关纯函数。
 *
 * 涵盖三组相关职责（合并到同一文件，因为都围绕"段"数据结构操作）：
 *
 * 1. 主线程回退向量化（vectorizeChapterContent）
 *    Worker 路径失败时在主线程对 HTML 做 DOMParser 扫描 + 字数权重切分。
 *
 * 2. 段 DOM 操作（materializeVectorSegment / applyPlaceholderSizing /
 *    resolveInitialShadowSegmentCount / calibrateSegmentIntrinsicSizeBatch）
 *    把段元数据挂到 DOM 上，或对已挂段做 intrinsic size 校准。
 *
 * 3. SegmentMeta 查询（getSegmentMetaTotalChars / hasSegmentMetaMedia）
 *    Worker 产物 SegmentMeta[] 的聚合查询。
 *
 * 不含 React 状态，不读 refs，不写 DOM 以外的副作用。
 */

import type { SegmentMeta } from '@/engine';
import { getContainerHeight } from '@/utils/assetLoader';
import { estimateNodeCharWeight, estimateSegmentHeight } from './heightEstimation';
import type { HeightEstimationStyleInputs } from './heightEstimation';
import {
    VECTOR_SEGMENT_CHAR_BUDGET,
    VECTOR_MIN_SEGMENT_EST_HEIGHT,
    MEDIA_SENSITIVE_INITIAL_SEGMENT_CAP,
} from './shadowRendererConstants';
import type { ChapterVectorSegment } from './shadowRendererTypes';
import { yieldToBrowser } from './yieldScheduling';

// ── 1. 主线程回退向量化 ──

export function vectorizeChapterContent(
    html: string,
    readerStyles: HeightEstimationStyleInputs,
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
        if (shouldSplit) flush();
        currentNodes.push(node);
        currentChars += weight;
    });

    flush();
    return segments;
}

// ── 2. 段 DOM 操作 ──

export function materializeVectorSegment(targetEl: HTMLElement, segment: ChapterVectorSegment): void {
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

export function applyPlaceholderSizing(segmentEl: HTMLElement, height: number): void {
    const safeHeight = Math.max(VECTOR_MIN_SEGMENT_EST_HEIGHT, Math.floor(height));
    segmentEl.style.minHeight = `${safeHeight}px`;
    segmentEl.style.containIntrinsicSize = `${safeHeight}px`;
}

export function resolveInitialShadowSegmentCount(
    totalSegments: number,
    plannedInitialSegmentCount: number,
    mediaSensitiveChapter: boolean,
): number {
    if (totalSegments <= 0) return 0;
    if (!mediaSensitiveChapter) {
        return Math.max(1, Math.min(totalSegments, plannedInitialSegmentCount));
    }
    const cappedCount = Math.max(plannedInitialSegmentCount, MEDIA_SENSITIVE_INITIAL_SEGMENT_CAP);
    return Math.max(1, Math.min(totalSegments, cappedCount));
}

export async function calibrateSegmentIntrinsicSizeBatch(targets: readonly HTMLElement[]): Promise<void> {
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

// ── 3. SegmentMeta 聚合查询 ──

export function getSegmentMetaTotalChars(segmentMetas?: readonly SegmentMeta[]): number {
    if (!segmentMetas || segmentMetas.length === 0) return 0;
    return segmentMetas.reduce((total, segment) => total + segment.charCount, 0);
}

export function hasSegmentMetaMedia(segmentMetas?: readonly SegmentMeta[]): boolean {
    if (!segmentMetas || segmentMetas.length === 0) return false;
    return segmentMetas.some((segment) => segment.hasMedia);
}
