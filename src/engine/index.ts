// ═══════════════════════════════════════════════════════
// Vitra Engine — 统一导出
// ═══════════════════════════════════════════════════════

// 核心：格式嗅探
export { detectVitraFormat } from './core/vitraFormatDetector';

// 核心：抽象基类
export { VitraBaseParser } from './core/vitraBaseParser';

// 核心：章节分割
export { VitraSectionSplitter } from './core/vitraSectionSplitter';
export type { SectionChunk } from './core/vitraSectionSplitter';

// 核心：Section → Blob URL 工厂
export { createBlobSectionsFromChunks } from './core/vitraSectionFactory';
export type { SectionChunkInput, SectionFactoryResult } from './core/vitraSectionFactory';

// 核心：分页引擎 (4.3)
export {
  paginateBlocks,
  collectBlockMetrics,
  collectBlockMetricsIdle,
  buildPageBoundariesFromDom,
  buildPageBoundariesFromDomIdle,
} from './render/vitraPaginator';
export type {
  VitraBlockMeasureOptions,
  VitraBlockMeasureProgress,
  VitraIdlePaginationProgress,
} from './render/vitraPaginator';

// 核心：离屏测量服务 (4.2 Stage 2+3)
export { startMeasure, measurePageBoundaries } from './render/vitraMeasure';
export type { VitraMeasureConfig, VitraMeasureRequest, VitraMeasureHandle } from './render/vitraMeasure';

// 核心：Canvas 快速测量 (4.2 Stage 2 优化路径)
export { isCanvasMeasureEligible, invalidateCanvasMeasureCache } from './render/vitraCanvasMeasure';

// 核心：渲染管线跟踪 (4.2)
export {
  createVitraRenderTrace,
  runVitraRenderStage,
  finalizeVitraRenderTrace,
  formatVitraRenderTrace,
} from './render/vitraRenderPipeline';
export type {
  VitraRenderStageTiming,
  VitraRenderTraceSnapshot,
} from './render/vitraRenderPipeline';

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
export { VitraCbzParser, VitraCbtParser, VitraCbrParser, VitraCb7Parser } from './parsers/vitraComicParser';
export type { ArchiveLoader, ArchiveEntry } from './parsers/comicArchiveAdapters';

// 独立格式 Parser：DOCX
export { VitraDocxParser } from './parsers/vitraDocxParser';

// 独立格式 Parser：DJVU（骨架，依赖可选的 djvu.js GPL-3.0）
// 不从桶导出以避免构建时拉入未安装的 djvu.js。
// 如需使用请手动 import './parsers/vitraDjvuParser'。

// 向量渲染规划器 (4.4)
export {
  buildVitraVectorRenderPlan,
  resolveVitraVectorConfig,
  DEFAULT_VITRA_VECTOR_CONFIG,
} from './render/vitraVectorPlanner';

// 渲染模式决策 (4.4)
export { resolveReaderRenderMode } from './core/readerRenderMode';
export type { ReaderRenderModeDecision } from './core/readerRenderMode';

// CSS 注入模板 (4.6)
export { buildReaderCssTemplate } from './render/readerCss';
export type { ReaderCssConfig, ReaderCssOptions } from './render/readerCss';

// 位置序列化 (DOM path + text anchor)
export { serializePosition, deserializePosition, scrollToPosition } from './render/vitraPosition';
export type { VitraPosition, VitraPositionResult } from './render/vitraPosition';

// 解析缓存 (5.1)
export { VitraBookCache } from './cache/vitraBookCache';
export type { VitraCachedBook, VitraCacheStats } from './cache/vitraBookCache';

// Section LRU 内存管理 (5.2)
export { VitraSectionManager } from './cache/vitraSectionManager';
export type { VitraSectionManagerOptions, VitraSectionManagerStats } from './cache/vitraSectionManager';

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
  VitraPaginateOptions,
} from './types/vitraPagination';

// 向量渲染类型 (4.1-4.2)
export type {
  VitraRenderMode,
  VitraVectorPipelineStage,
  VitraVectorRenderConfig,
  VitraVectorPlanInput,
  VitraVectorPlanReason,
  VitraVectorRenderPlan,
  SegmentMeta,
  ChapterMetaVector,
  VectorizeConfig,
} from './types/vectorRender';

// 统一 Book 模型类型
export type {
  VitraBook,
  VitraBookFormat,
  VitraBookMetadata,
  VitraBookSection,
  VitraLayoutMode,
  VitraReadingDirection,
  VitraSearchResult,
  VitraTocItem,
} from './types/vitraBook';
