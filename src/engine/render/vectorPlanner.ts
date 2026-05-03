import type {
    VectorPlanInput,
    VectorRenderConfig,
    VectorRenderPlan,
    VectorPipelineStage,
} from '../types/vectorRender'

const VECTOR_PIPELINE_STAGES: readonly VectorPipelineStage[] = [
    'parse',
    'measure',
    'paginate',
    'render',
    'hydrate',
]

export const DEFAULT_VECTOR_RENDER_CONFIG: Readonly<VectorRenderConfig> = Object.freeze({
    largeChapterThreshold: 450_000,
    veryLargeChapterThreshold: 750_000,
    hugeChapterThreshold: 1_200_000,
    minInitialSegments: 2,
    maxInitialSegments: 4,
})

export function resolveVectorRenderConfig(
    config?: Partial<VectorRenderConfig>,
): VectorRenderConfig {
    if (!config) return { ...DEFAULT_VECTOR_RENDER_CONFIG }

    return {
        largeChapterThreshold: config.largeChapterThreshold ?? DEFAULT_VECTOR_RENDER_CONFIG.largeChapterThreshold,
        veryLargeChapterThreshold: config.veryLargeChapterThreshold ?? DEFAULT_VECTOR_RENDER_CONFIG.veryLargeChapterThreshold,
        hugeChapterThreshold: config.hugeChapterThreshold ?? DEFAULT_VECTOR_RENDER_CONFIG.hugeChapterThreshold,
        minInitialSegments: config.minInitialSegments ?? DEFAULT_VECTOR_RENDER_CONFIG.minInitialSegments,
        maxInitialSegments: config.maxInitialSegments ?? DEFAULT_VECTOR_RENDER_CONFIG.maxInitialSegments,
    }
}

function computeInitialSegmentsBySize(
    chapterSize: number,
    config: VectorRenderConfig,
): number {
    if (chapterSize >= config.hugeChapterThreshold) return config.minInitialSegments
    if (chapterSize >= config.veryLargeChapterThreshold) return config.minInitialSegments + 1
    return config.maxInitialSegments
}

function clampInitialSegments(segmentCount: number, candidate: number): number {
    if (segmentCount <= 0) return 0
    return Math.max(1, Math.min(segmentCount, candidate))
}

function isVectorEligible(input: VectorPlanInput, threshold: number): boolean {
    if (input.mode !== 'scroll') return false
    if (input.chapterSize < threshold) return false
    return input.segmentCount > 1
}

export function buildVectorRenderPlan(
    input: VectorPlanInput,
    config?: Partial<VectorRenderConfig>,
): VectorRenderPlan {
    const resolved = resolveVectorRenderConfig(config)
    if (input.mode !== 'scroll') {
        return { enabled: false, reason: 'mode-disabled', initialSegmentCount: 0, stages: VECTOR_PIPELINE_STAGES }
    }
    if (input.chapterSize < resolved.largeChapterThreshold) {
        return { enabled: false, reason: 'chapter-not-large', initialSegmentCount: 0, stages: VECTOR_PIPELINE_STAGES }
    }
    if (!isVectorEligible(input, resolved.largeChapterThreshold)) {
        return { enabled: false, reason: 'single-segment', initialSegmentCount: 0, stages: VECTOR_PIPELINE_STAGES }
    }

    const initialSegmentCount = clampInitialSegments(
        input.segmentCount,
        computeInitialSegmentsBySize(input.chapterSize, resolved),
    )
    return {
        enabled: true,
        reason: 'vector-enabled',
        initialSegmentCount,
        stages: VECTOR_PIPELINE_STAGES,
    }
}
