import type { MutableRefObject } from 'react';
import { ScrollPipelineState, type PipelineState } from './scrollReaderTypes';

interface ScrollPipelineRuntimeRefs {
    pipelineRef: MutableRefObject<PipelineState>;
    loadingLockRef: MutableRefObject<Set<number>>;
}

interface ScrollPipelineStateRefs {
    pipelineRef: MutableRefObject<PipelineState>;
}

interface ChapterLoadLockRefs {
    loadingLockRef: MutableRefObject<Set<number>>;
}

export function isScrollPipelineIdle(refs: ScrollPipelineStateRefs): boolean {
    return refs.pipelineRef.current === ScrollPipelineState.IDLE;
}

export function markScrollPipelineIdle(refs: ScrollPipelineStateRefs): void {
    refs.pipelineRef.current = ScrollPipelineState.IDLE;
}

export function markScrollPipelineRenderingOffscreen(refs: ScrollPipelineStateRefs): void {
    refs.pipelineRef.current = ScrollPipelineState.RENDERING_OFFSCREEN;
}

export function hasActiveChapterLoad(refs: ChapterLoadLockRefs, spineIndex: number): boolean {
    return refs.loadingLockRef.current.has(spineIndex);
}

export function beginChapterLoad(refs: ScrollPipelineRuntimeRefs, spineIndex: number): void {
    refs.loadingLockRef.current.add(spineIndex);
    refs.pipelineRef.current = ScrollPipelineState.PRE_FETCHING;
}

export function releaseChapterLoadLock(refs: ChapterLoadLockRefs, spineIndex: number): void {
    refs.loadingLockRef.current.delete(spineIndex);
}

export function resetScrollPipelineRuntime(refs: ScrollPipelineRuntimeRefs): void {
    refs.loadingLockRef.current.clear();
    refs.pipelineRef.current = ScrollPipelineState.IDLE;
}
