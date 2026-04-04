import {
    buildVitraVectorRenderPlan,
    computeVisibleRange,
    type ChapterMetaVector,
    type SegmentMeta,
} from '../../engine';

export interface WindowedVectorCacheCandidate {
    status: 'loading' | 'shadow-rendering' | 'ready' | 'mounted' | 'placeholder';
    segmentMetas?: readonly SegmentMeta[];
    vectorStyleKey?: string;
}

export interface StyleChangeChapterCandidate extends WindowedVectorCacheCandidate {
    spineIndex: number;
    id: string;
}

export interface VirtualMountPlanChapter {
    chapterId: string;
    chapterTop: number;
    vector: Pick<ChapterMetaVector, 'segments' | 'totalEstimatedHeight'>;
}

export interface VirtualMountPlanOptions {
    overscanSegments: number;
    preloadMarginPx: number;
    globalSegmentBudget: number;
}

interface VirtualMountCandidate {
    chapterId: string;
    segmentIndex: number;
    visible: boolean;
    distanceToViewportCenter: number;
    chapterTop: number;
    offsetY: number;
}

export function resolveVectorChapterSize(segmentMetas: readonly SegmentMeta[] | undefined): number {
    if (!segmentMetas || segmentMetas.length === 0) return 0;
    return segmentMetas.reduce((sum, segment) => sum + segment.charCount, 0);
}

export function shouldBypassShadowQueueForSegmentMetas(
    segmentMetas: readonly SegmentMeta[] | undefined,
): boolean {
    if (!segmentMetas || segmentMetas.length === 0) return false;
    return buildVitraVectorRenderPlan({
        mode: 'scroll',
        chapterSize: resolveVectorChapterSize(segmentMetas),
        segmentCount: segmentMetas.length,
    }).enabled;
}

export function canRestoreWindowedVectorPlaceholder(
    chapter: WindowedVectorCacheCandidate | undefined,
    currentReaderStyleKey: string,
): boolean {
    return Boolean(
        chapter
        && chapter.status === 'placeholder'
        && chapter.segmentMetas
        && chapter.segmentMetas.length > 0
        && chapter.vectorStyleKey === currentReaderStyleKey,
    );
}

export function partitionStyleChangeTargets<T extends StyleChangeChapterCandidate>(
    chapters: readonly T[],
): {
    vectorReloadTargets: T[];
    shadowRerenderTargets: T[];
} {
    const vectorReloadTargets: T[] = [];
    const shadowRerenderTargets: T[] = [];

    chapters.forEach((chapter) => {
        if (chapter.status !== 'mounted' && chapter.status !== 'ready') {
            return;
        }

        if (shouldBypassShadowQueueForSegmentMetas(chapter.segmentMetas)) {
            vectorReloadTargets.push(chapter);
            return;
        }

        shadowRerenderTargets.push(chapter);
    });

    return {
        vectorReloadTargets,
        shadowRerenderTargets,
    };
}

function resolveSegmentHeight(segment: SegmentMeta): number {
    return Math.max(1, segment.realHeight ?? segment.estimatedHeight);
}

function resolveDistanceToViewportCenter(
    segmentTop: number,
    segmentBottom: number,
    viewportTop: number,
    viewportBottom: number,
    viewportCenter: number,
): { visible: boolean; distanceToViewportCenter: number } {
    const visible = !(segmentBottom < viewportTop || segmentTop > viewportBottom);
    const segmentCenter = segmentTop + ((segmentBottom - segmentTop) / 2);
    return {
        visible,
        distanceToViewportCenter: Math.abs(segmentCenter - viewportCenter),
    };
}

export function computeGlobalVirtualSegmentMountPlan(
    chapters: readonly VirtualMountPlanChapter[],
    scrollTop: number,
    viewportHeight: number,
    options: VirtualMountPlanOptions,
): Map<string, number[]> {
    const plan = new Map<string, number[]>();
    if (viewportHeight <= 0 || options.globalSegmentBudget <= 0 || chapters.length === 0) {
        return plan;
    }

    const viewportBottom = scrollTop + viewportHeight;
    const viewportCenter = scrollTop + (viewportHeight / 2);
    const preloadTop = Math.max(0, scrollTop - options.preloadMarginPx);
    const preloadBottom = viewportBottom + options.preloadMarginPx;
    const candidates: VirtualMountCandidate[] = [];

    chapters.forEach((chapter) => {
        const chapterBottom = chapter.chapterTop + chapter.vector.totalEstimatedHeight;
        if (chapterBottom < preloadTop || chapter.chapterTop > preloadBottom) {
            return;
        }

        const localScrollTop = Math.max(0, scrollTop - chapter.chapterTop);
        const range = computeVisibleRange(
            chapter.vector.segments,
            localScrollTop,
            viewportHeight,
            options.overscanSegments,
        );

        for (let index = range.startIndex; index <= range.endIndex; index += 1) {
            const segment = chapter.vector.segments[index];
            if (!segment) continue;

            const segmentTop = chapter.chapterTop + segment.offsetY;
            const segmentBottom = segmentTop + resolveSegmentHeight(segment);
            const visibility = resolveDistanceToViewportCenter(
                segmentTop,
                segmentBottom,
                scrollTop,
                viewportBottom,
                viewportCenter,
            );

            candidates.push({
                chapterId: chapter.chapterId,
                segmentIndex: index,
                visible: visibility.visible,
                distanceToViewportCenter: visibility.distanceToViewportCenter,
                chapterTop: chapter.chapterTop,
                offsetY: segment.offsetY,
            });
        }
    });

    candidates
        .sort((left, right) => {
            if (left.visible !== right.visible) {
                return left.visible ? -1 : 1;
            }
            if (left.distanceToViewportCenter !== right.distanceToViewportCenter) {
                return left.distanceToViewportCenter - right.distanceToViewportCenter;
            }
            if (left.chapterTop !== right.chapterTop) {
                return left.chapterTop - right.chapterTop;
            }
            if (left.offsetY !== right.offsetY) {
                return left.offsetY - right.offsetY;
            }
            return left.segmentIndex - right.segmentIndex;
        });

    candidates
        .slice(0, options.globalSegmentBudget)
        .forEach((candidate) => {
            const indices = plan.get(candidate.chapterId) ?? [];
            indices.push(candidate.segmentIndex);
            plan.set(candidate.chapterId, indices);
        });

    plan.forEach((indices, chapterId) => {
        const ordered = Array.from(new Set(indices)).sort((left, right) => left - right);
        plan.set(chapterId, ordered);
    });

    return plan;
}
