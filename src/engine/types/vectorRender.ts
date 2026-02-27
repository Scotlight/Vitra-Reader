export type VitraRenderMode = 'scroll' | 'paginated';

export type VitraVectorPipelineStage =
    | 'parse'
    | 'measure'
    | 'paginate'
    | 'render'
    | 'hydrate';

export interface VitraVectorRenderConfig {
    largeChapterThreshold: number;
    veryLargeChapterThreshold: number;
    hugeChapterThreshold: number;
    minInitialSegments: number;
    maxInitialSegments: number;
}

export interface VitraVectorPlanInput {
    mode: VitraRenderMode;
    chapterSize: number;
    segmentCount: number;
}

export type VitraVectorPlanReason =
    | 'mode-disabled'
    | 'chapter-not-large'
    | 'single-segment'
    | 'vector-enabled';

export interface VitraVectorRenderPlan {
    enabled: boolean;
    reason: VitraVectorPlanReason;
    initialSegmentCount: number;
    stages: readonly VitraVectorPipelineStage[];
}

/** 段级元数据向量项 */
export interface SegmentMeta {
    readonly index: number;
    readonly charCount: number;
    estimatedHeight: number;
    realHeight: number | null;
    offsetY: number;
    measured: boolean;
    htmlContent: string;
    hasMedia: boolean;
}

/** 章节 metaVector */
export interface ChapterMetaVector {
    readonly chapterId: string;
    readonly spineIndex: number;
    segments: SegmentMeta[];
    totalEstimatedHeight: number;
    totalMeasuredHeight: number;
    fullyMeasured: boolean;
}

/** Worker 向量化配置 */
export interface VectorizeConfig {
    targetChars: number;
    fontSize: number;
    pageWidth: number;
    lineHeight: number;
    paragraphSpacing: number;
}
