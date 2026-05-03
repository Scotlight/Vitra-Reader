import type { VectorPipelineStage } from '../types/vectorRender'

const PIPELINE_STAGE_ORDER: readonly VectorPipelineStage[] = [
    'parse',
    'measure',
    'paginate',
    'render',
    'hydrate',
]

const STAGE_ORDER_INDEX: Readonly<Record<VectorPipelineStage, number>> = Object.freeze({
    parse: 0,
    measure: 1,
    paginate: 2,
    render: 3,
    hydrate: 4,
})

export interface RenderStageTiming {
    stage: VectorPipelineStage
    startAt: number
    endAt: number
    durationMs: number
}

export interface RenderTraceSnapshot {
    chapterId: string
    startedAt: number
    finishedAt: number
    durationMs: number
    stages: readonly RenderStageTiming[]
}

export interface RenderTraceState {
    chapterId: string
    startedAt: number
    finishedAt: number | null
    stageTimings: Partial<Record<VectorPipelineStage, RenderStageTiming>>
}

export function createRenderTrace(chapterId: string): RenderTraceState {
    return {
        chapterId,
        startedAt: performance.now(),
        finishedAt: null,
        stageTimings: {},
    }
}

function findMissingPreStages(trace: RenderTraceState, stage: VectorPipelineStage): VectorPipelineStage[] {
    const targetIndex = STAGE_ORDER_INDEX[stage]
    return PIPELINE_STAGE_ORDER
        .slice(0, targetIndex)
        .filter((pre) => !trace.stageTimings[pre])
}

function assertStageEligibility(trace: RenderTraceState, stage: VectorPipelineStage): void {
    if (trace.stageTimings[stage]) {
        throw new Error(`[RenderStageTrace] stage already completed: ${stage}`)
    }
    const missingPreStages = findMissingPreStages(trace, stage)
    if (missingPreStages.length === 0) return
    throw new Error(
        `[RenderStageTrace] invalid stage order for "${stage}", missing: ${missingPreStages.join(', ')}`,
    )
}

function recordStageTiming(
    trace: RenderTraceState,
    stage: VectorPipelineStage,
    startAt: number,
    endAt: number,
): void {
    trace.stageTimings[stage] = {
        stage,
        startAt,
        endAt,
        durationMs: Math.max(0, endAt - startAt),
    }
}

export async function runRenderStage<T>(
    trace: RenderTraceState,
    stage: VectorPipelineStage,
    task: () => T | Promise<T>,
): Promise<T> {
    assertStageEligibility(trace, stage)
    const startAt = performance.now()
    try {
        const result = await task()
        const endAt = performance.now()
        recordStageTiming(trace, stage, startAt, endAt)
        return result
    } catch (error) {
        const endAt = performance.now()
        recordStageTiming(trace, stage, startAt, endAt)
        throw error
    }
}

export function finalizeRenderTrace(trace: RenderTraceState): RenderTraceSnapshot {
    const stageTimings = PIPELINE_STAGE_ORDER.map((stage) => trace.stageTimings[stage]).filter(
        (item): item is RenderStageTiming => Boolean(item),
    )
    if (stageTimings.length !== PIPELINE_STAGE_ORDER.length) {
        const missing = PIPELINE_STAGE_ORDER.filter((stage) => !trace.stageTimings[stage])
        throw new Error(`[RenderStageTrace] finalize failed, missing stages: ${missing.join(', ')}`)
    }

    const finishedAt = performance.now()
    trace.finishedAt = finishedAt
    return {
        chapterId: trace.chapterId,
        startedAt: trace.startedAt,
        finishedAt,
        durationMs: Math.max(0, finishedAt - trace.startedAt),
        stages: stageTimings,
    }
}

export function formatRenderTrace(trace: RenderTraceSnapshot): string {
    const stageSummary = trace.stages
        .map((stage) => `${stage.stage}:${stage.durationMs.toFixed(1)}ms`)
        .join(' | ')
    return `[RenderStageTrace] ${trace.chapterId} total:${trace.durationMs.toFixed(1)}ms :: ${stageSummary}`
}
