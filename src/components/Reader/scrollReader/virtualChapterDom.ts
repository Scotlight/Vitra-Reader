import type { ChapterMetaVector, SegmentMeta } from '@/engine/types/vectorRender';

const VIRTUAL_SEGMENT_MIN_HEIGHT_PX = 96;

export function getVectorContentContainer(node: ParentNode | null): HTMLElement | null {
    if (!node) return null;
    return node.querySelector('[data-vitra-vector-content="true"]') as HTMLElement | null;
}

function resolveVirtualSegmentHeight(segment: SegmentMeta): number {
    return Math.max(VIRTUAL_SEGMENT_MIN_HEIGHT_PX, segment.realHeight ?? segment.estimatedHeight);
}

export function updateVirtualContentHeight(contentEl: HTMLElement, vector: ChapterMetaVector): void {
    const totalHeight = Math.max(1, vector.totalEstimatedHeight);
    contentEl.style.position = 'relative';
    contentEl.style.height = `${totalHeight}px`;
    contentEl.style.minHeight = `${totalHeight}px`;
    contentEl.setAttribute('data-vitra-vector-total-height', String(totalHeight));
}

export function updateVirtualSegmentLayout(segmentEl: HTMLElement, segment: SegmentMeta): void {
    const height = resolveVirtualSegmentHeight(segment);
    segmentEl.style.position = 'absolute';
    segmentEl.style.top = '0';
    segmentEl.style.left = '0';
    segmentEl.style.right = '0';
    segmentEl.style.width = '100%';
    segmentEl.style.transform = `translateY(${Math.max(0, segment.offsetY)}px)`;
    segmentEl.style.containIntrinsicSize = `0 ${height}px`;
}

export function insertVirtualSegmentInOrder(
    container: HTMLElement,
    activeSegmentEls: ReadonlyMap<number, HTMLElement>,
    nextIndex: number,
    segmentEl: HTMLElement,
): void {
    const ordered = Array.from(activeSegmentEls.entries()).sort((a, b) => a[0] - b[0]);
    const nextSibling = ordered.find(([index]) => index > nextIndex)?.[1] ?? null;
    container.insertBefore(segmentEl, nextSibling);
}
