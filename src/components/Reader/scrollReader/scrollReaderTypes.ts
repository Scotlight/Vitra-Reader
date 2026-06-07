import type { SegmentMeta } from '@/engine/types/vectorRender';
import type { ChapterPreprocessFailure } from '@/engine/types/chapterPreprocess';
import { RenderPipelineState } from '@/engine/types/renderPipeline';

export interface LoadedChapter {
    spineIndex: number;
    id: string;
    chapterTitle?: string;
    htmlContent: string;
    htmlFragments: string[];
    externalStyles: string[];
    segmentMetas?: SegmentMeta[];
    vectorStyleKey?: string;
    domNode: HTMLElement | null;
    height: number;
    status: 'loading' | 'shadow-rendering' | 'ready' | 'mounted' | 'placeholder' | 'error';
    preprocessError?: ChapterPreprocessFailure;
    mountedAt?: number;
}

export const ScrollPipelineState = {
    IDLE: RenderPipelineState.IDLE,
    PRE_FETCHING: RenderPipelineState.PRE_FETCHING,
    RENDERING_OFFSCREEN: RenderPipelineState.RENDERING_OFFSCREEN,
} as const;

export type PipelineState = typeof ScrollPipelineState[keyof typeof ScrollPipelineState];

export interface ViewportDerivedMetrics {
    activeSpineIndex: number | null;
    progressSpineIndex: number | null;
    progress: number | null;
}
