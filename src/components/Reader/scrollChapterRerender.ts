import { partitionStyleChangeTargets } from './scrollVectorStrategy'
import type { LoadedChapterState } from './scrollChapterLoad'

export interface StyleChangeRerenderPlan {
    rerenderIndexes: Set<number>
    rerenderQueue: LoadedChapterState[]
    shadowRerenderIndexes: Set<number>
    shadowRerenderTargets: LoadedChapterState[]
    vectorReloadIndexes: Set<number>
    vectorReloadTargets: LoadedChapterState[]
}

export function createStyleChangeRerenderPlan(
    chapters: readonly LoadedChapterState[],
    nextKey: string,
): StyleChangeRerenderPlan {
    const rerenderTargets = chapters.filter((chapter) =>
        chapter.status === 'mounted' || chapter.status === 'ready'
    )
    const {
        vectorReloadTargets,
        shadowRerenderTargets,
    } = partitionStyleChangeTargets(rerenderTargets)

    return {
        rerenderIndexes: new Set(rerenderTargets.map((chapter) => chapter.spineIndex)),
        rerenderQueue: shadowRerenderTargets.map((chapter) => ({
            ...chapter,
            domNode: null,
            vectorStyleKey: nextKey,
            status: 'shadow-rendering' as const,
        })),
        shadowRerenderIndexes: new Set(shadowRerenderTargets.map((chapter) => chapter.spineIndex)),
        shadowRerenderTargets,
        vectorReloadIndexes: new Set(vectorReloadTargets.map((chapter) => chapter.spineIndex)),
        vectorReloadTargets,
    }
}

export function applyStyleChangeToChapters(
    chapters: readonly LoadedChapterState[],
    plan: StyleChangeRerenderPlan,
    nextKey: string,
    resolvePlaceholderHeight: (height: number) => number,
): LoadedChapterState[] {
    return chapters.map((chapter) =>
        plan.vectorReloadIndexes.has(chapter.spineIndex)
            ? {
                ...chapter,
                htmlContent: '',
                htmlFragments: [],
                segmentMetas: undefined,
                domNode: null,
                height: resolvePlaceholderHeight(chapter.height),
                vectorStyleKey: nextKey,
                status: 'placeholder' as const,
            }
            : plan.shadowRerenderIndexes.has(chapter.spineIndex)
            ? { ...chapter, domNode: null, vectorStyleKey: nextKey, status: 'shadow-rendering' as const }
            : chapter
    )
}

export function mergeShadowQueueForStyleChange(
    queue: readonly LoadedChapterState[],
    plan: StyleChangeRerenderPlan,
): LoadedChapterState[] {
    return [
        ...queue.filter((chapter) => !plan.rerenderIndexes.has(chapter.spineIndex)),
        ...plan.rerenderQueue,
    ]
}

export function filterPendingReadyForStyleChange<T extends { spineIndex: number }>(
    pendingItems: readonly T[],
    plan: StyleChangeRerenderPlan,
): T[] {
    return pendingItems.filter((item) => !plan.rerenderIndexes.has(item.spineIndex))
}
