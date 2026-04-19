/**
 * ShadowRenderer 内部类型定义。
 *
 * - ChapterVectorSegment: 主线程 vectorizeChapterContent 产物的内部格式。
 *   注意：这与 Worker 产出的 SegmentMeta 不等价——前者携带真实 ChildNode
 *   引用（用于 materialize 阶段 cloneNode），后者是可序列化 HTML 字符串。
 *   Worker 路径通过 _htmlContent 字段复用此类型做 materialize。
 *
 * - ShadowRenderContext: Render 阶段产物，承接 hydrate 阶段所需的上下文。
 */

export interface ChapterVectorSegment {
    index: number;
    nodes: ChildNode[];
    charCount: number;
    estimatedHeight: number;
    /** Worker 侧向量化时填充，优先用于 materialize */
    _htmlContent?: string;
}

export interface ShadowRenderContext {
    chapterWrapper: HTMLElement;
    canUseVectorized: boolean;
    vectorSegments: ChapterVectorSegment[];
    segmentEls: HTMLElement[];
    initialSegmentCount: number;
}
