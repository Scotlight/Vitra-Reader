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

/** 段级元数据向量项 (Piece Table 风格: 默认只存 buffer 偏移，按需 slice) */
export interface SegmentMeta {
    readonly index: number;
    readonly charCount: number;
    estimatedHeight: number;
    realHeight: number | null;
    offsetY: number;
    measured: boolean;
    /** Piece Table: buffer 内起始偏移 */
    readonly bufferOffset: number;
    /** Piece Table: buffer 内长度 */
    readonly bufferLength: number;
    /**
     * 段 HTML 内容。
     * Worker 侧为空串(零拷贝)，主线程 hydrate 时从 buffer 按需 slice 填充。
     */
    htmlContent: string;
    hasMedia: boolean;
}

/** 章节 metaVector */
export interface ChapterMetaVector {
    readonly chapterId: string;
    readonly spineIndex: number;
    /** Piece Table: 不可变 HTML buffer，segments 通过 (bufferOffset, bufferLength) 索引 */
    readonly buffer: string;
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
