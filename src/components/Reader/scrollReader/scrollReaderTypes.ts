import type { SegmentMeta } from '@/engine';

export interface LoadedChapter {
    spineIndex: number;
    id: string;
    htmlContent: string;
    htmlFragments: string[];
    externalStyles: string[];
    segmentMetas?: SegmentMeta[];
    vectorStyleKey?: string;
    domNode: HTMLElement | null;
    height: number;
    status: 'loading' | 'shadow-rendering' | 'ready' | 'mounted' | 'placeholder' | 'error';
    mountedAt?: number;
}

export type PipelineState =
    | 'idle'
    | 'pre-fetching'
    | 'rendering-offscreen';

export interface ViewportDerivedMetrics {
    activeSpineIndex: number | null;
    progressSpineIndex: number | null;
    progress: number | null;
}
