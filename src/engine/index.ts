// ═══════════════════════════════════════════════════════
// Vitra Engine — 统一导出
// ═══════════════════════════════════════════════════════

// 核心：格式嗅探
export { detectFormat } from './core/formatDetector';

// 核心：抽象基类
export { BaseParser } from './core/baseParser';

// 核心：章节分割
export { SectionSplitter } from './core/sectionSplitter';
export type { SectionChunk } from './core/sectionSplitter';

// 核心：Section → Blob URL 工厂
export { createBlobSectionsFromChunks } from './core/sectionFactory';
export type { SectionChunkInput, SectionFactoryResult } from './core/sectionFactory';

// 核心：分页引擎 (4.3)
export {
  paginateBlocks,
  collectBlockMetrics,
  collectBlockMetricsIdle,
  buildPageBoundariesFromDom,
  buildPageBoundariesFromDomIdle,
} from './render/paginator';
export type {
  BlockMeasureOptions,
  BlockMeasureProgress,
  IdlePaginationProgress,
} from './render/paginator';

// 核心：离屏测量服务 (4.2 Stage 2+3)
export { startMeasure, measurePageBoundaries } from './render/measure';
export type { MeasureConfig, MeasureRequest, MeasureHandle } from './render/measure';

// 核心：Canvas 快速测量 (4.2 Stage 2 优化路径)
export { isCanvasMeasureEligible, invalidateCanvasMeasureCache } from './render/canvasMeasure';

// 核心：渲染管线跟踪 (4.2)
export {
  createRenderTrace,
  runRenderStage,
  finalizeRenderTrace,
  formatRenderTrace,
} from './render/renderStageTrace';
export type {
  RenderStageTiming,
  RenderTraceSnapshot,
} from './render/renderStageTrace';

// 向量元数据管理器 (4.1)
export {
  findSegmentByOffset,
  computeVisibleRange,
  batchUpdateSegmentHeights,
  buildChapterMetaVector,
} from './render/metaVectorManager';

// 段级 DOM 节点池 (4.1)
export { SegmentDomPool } from './render/segmentDomPool';

// 独立格式 Parser：漫画归档
export { CbzParser, CbtParser, CbrParser, Cb7Parser } from './parsers/comicParser';
export type { ArchiveLoader, ArchiveEntry } from './parsers/comicArchiveAdapters';

// 独立格式 Parser：DOCX
export { DocxParser } from './parsers/docxParser';

// 独立格式 Parser：DJVU（骨架，依赖可选的 djvu.js GPL-3.0）
// 不从桶导出以避免构建时拉入未安装的 djvu.js。
// 如需使用请手动 import './parsers/djvuParser'。

// 向量渲染规划器 (4.4)
export {
  buildVectorRenderPlan,
  resolveVectorRenderConfig,
  DEFAULT_VECTOR_RENDER_CONFIG,
} from './render/vectorPlanner';

// 渲染模式决策 (4.4)
export { resolveReaderRenderMode } from './core/readerRenderMode';
export type { ReaderRenderModeDecision } from './core/readerRenderMode';

// CSS 注入模板 (4.6)
export { buildReaderCssTemplate } from './render/readerCss';
export type { ReaderCssConfig, ReaderCssOptions } from './render/readerCss';

// 位置序列化 (DOM path + text anchor)
export { serializePosition, deserializePosition, scrollToPosition } from './render/position';
export type { SerializedPosition, PositionResult } from './render/position';

// 解析缓存 (5.1)
export { BookCache } from './cache/bookCache';
export type { CachedBook, BookCacheStats } from './cache/bookCache';

// Section LRU 内存管理 (5.2)
export { SectionManager } from './cache/sectionManager';
export type { SectionManagerOptions, SectionManagerStats } from './cache/sectionManager';

// 搜索索引缓存 (5.3 辅助)
export {
  upsertChapterIndex,
  hasChapterIndex,
  getIndexedChapterCount,
  clearBookIndex,
  searchBookIndex,
} from './cache/searchIndexCache';

// 分页类型 (4.3)
export type {
  BlockMetrics,
  PageBoundary,
  PaginateOptions,
} from './types/pagination';

// 向量渲染类型 (4.1-4.2)
export type {
  ReaderRenderMode,
  VectorPipelineStage,
  VectorRenderConfig,
  VectorPlanInput,
  VectorPlanReason,
  VectorRenderPlan,
  SegmentMeta,
  ChapterMetaVector,
  VectorizeConfig,
} from './types/vectorRender';

// 统一 Book 模型类型
export type {
  ParsedBook,
  EngineBookFormat,
  ParsedBookMetadata,
  BookSection,
  BookLayoutMode,
  ReadingDirection,
  BookSearchResult,
  BookTocItem,
} from './types/book';
