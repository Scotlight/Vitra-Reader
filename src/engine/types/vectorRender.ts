export type ReaderRenderMode = 'scroll' | 'paginated';

export type VectorPipelineStage =
    | 'parse'
    | 'measure'
    | 'paginate'
    | 'render'
    | 'hydrate';

export interface VectorRenderConfig {
    largeChapterThreshold: number;
    veryLargeChapterThreshold: number;
    hugeChapterThreshold: number;
    minInitialSegments: number;
    maxInitialSegments: number;
}

export interface VectorPlanInput {
    mode: ReaderRenderMode;
    chapterSize: number;
    segmentCount: number;
}

export type VectorPlanReason =
    | 'mode-disabled'
    | 'chapter-not-large'
    | 'single-segment'
    | 'vector-enabled';

export interface VectorRenderPlan {
    enabled: boolean;
    reason: VectorPlanReason;
    initialSegmentCount: number;
    stages: readonly VectorPipelineStage[];
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
