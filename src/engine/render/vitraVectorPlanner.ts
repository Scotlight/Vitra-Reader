import type {
    VitraVectorPlanInput,
    VitraVectorRenderConfig,
    VitraVectorRenderPlan,
    VitraVectorPipelineStage,
} from '../types/vectorRender'

const VECTOR_PIPELINE_STAGES: readonly VitraVectorPipelineStage[] = [
    'parse',
    'measure',
    'paginate',
    'render',
    'hydrate',
]

export const DEFAULT_VITRA_VECTOR_CONFIG: Readonly<VitraVectorRenderConfig> = Object.freeze({
    largeChapterThreshold: 450_000,
    veryLargeChapterThreshold: 750_000,
    hugeChapterThreshold: 1_200_000,
    minInitialSegments: 2,
    maxInitialSegments: 4,
})

export function resolveVitraVectorConfig(
    config?: Partial<VitraVectorRenderConfig>,
): VitraVectorRenderConfig {
    if (!config) return { ...DEFAULT_VITRA_VECTOR_CONFIG }

    return {
        largeChapterThreshold: config.largeChapterThreshold ?? DEFAULT_VITRA_VECTOR_CONFIG.largeChapterThreshold,
        veryLargeChapterThreshold: config.veryLargeChapterThreshold ?? DEFAULT_VITRA_VECTOR_CONFIG.veryLargeChapterThreshold,
        hugeChapterThreshold: config.hugeChapterThreshold ?? DEFAULT_VITRA_VECTOR_CONFIG.hugeChapterThreshold,
        minInitialSegments: config.minInitialSegments ?? DEFAULT_VITRA_VECTOR_CONFIG.minInitialSegments,
        maxInitialSegments: config.maxInitialSegments ?? DEFAULT_VITRA_VECTOR_CONFIG.maxInitialSegments,
    }
}

function computeInitialSegmentsBySize(
    chapterSize: number,
    config: VitraVectorRenderConfig,
): number {
    if (chapterSize >= config.hugeChapterThreshold) return config.minInitialSegments
    if (chapterSize >= config.veryLargeChapterThreshold) return config.minInitialSegments + 1
    return config.maxInitialSegments
}

function clampInitialSegments(segmentCount: number, candidate: number): number {
    if (segmentCount <= 0) return 0
    return Math.max(1, Math.min(segmentCount, candidate))
}

function isVectorEligible(input: VitraVectorPlanInput, threshold: number): boolean {
    if (input.mode !== 'scroll') return false
    if (input.chapterSize < threshold) return false
    return input.segmentCount > 1
}

export function buildVitraVectorRenderPlan(
    input: VitraVectorPlanInput,
    config?: Partial<VitraVectorRenderConfig>,
): VitraVectorRenderPlan {
    const resolved = resolveVitraVectorConfig(config)
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
