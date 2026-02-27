// ═══════════════════════════════════════════════════════
// Vitra Engine — 统一导出
// ═══════════════════════════════════════════════════════

// 核心：格式嗅探
export { detectVitraFormat } from './vitraFormatDetector';

// 核心：抽象基类
export { VitraBaseParser } from './vitraBaseParser';

// 核心：章节分割
export { VitraSectionSplitter } from './vitraSectionSplitter';
export type { SectionChunk } from './vitraSectionSplitter';

// 核心：Section → Blob URL 工厂
export { createBlobSectionsFromChunks } from './vitraSectionFactory';
export type { SectionChunkInput, SectionFactoryResult } from './vitraSectionFactory';

// 管线：统一 open 入口
export { VitraPipeline, VITRA_SUPPORTED_FORMATS } from './vitraPipeline';
export type { VitraOpenRequest, VitraOpenHandle, VitraPreviewSection } from './vitraPipeline';

// 核心：分页引擎 (4.3)
export {
  paginateBlocks,
  collectBlockMetrics,
  collectBlockMetricsIdle,
  buildPageBoundariesFromDom,
  buildPageBoundariesFromDomIdle,
} from './vitraPaginator';
export type {
  VitraBlockMeasureOptions,
  VitraBlockMeasureProgress,
  VitraIdlePaginationProgress,
} from './vitraPaginator';

// 核心：离屏测量服务 (4.2 Stage 2+3)
export { startMeasure, measurePageBoundaries } from './vitraMeasure';
export type { VitraMeasureConfig, VitraMeasureRequest, VitraMeasureHandle } from './vitraMeasure';

// 核心：Canvas 快速测量 (4.2 Stage 2 优化路径)
export { isCanvasMeasureEligible } from './vitraCanvasMeasure';

// 核心：渲染管线跟踪 (4.2)
export {
  createVitraRenderTrace,
  runVitraRenderStage,
  finalizeVitraRenderTrace,
  formatVitraRenderTrace,
} from './vitraRenderPipeline';
export type {
  VitraRenderStageTiming,
  VitraRenderTraceSnapshot,
} from './vitraRenderPipeline';

// 核心：渐进式水合调度器 (4.5) — 已被 ShadowRenderer/ScrollReaderView
// 的 IO 驱动方案取代，保留模块文件但不再从桶导出。
// 如需恢复请手动 import './vitraHydration'。

// 向量元数据管理器 (4.1)
export {
  findSegmentByOffset,
  computeVisibleRange,
  batchUpdateSegmentHeights,
  buildChapterMetaVector,
} from './metaVectorManager';

// 段级 DOM 节点池 (4.1)
export { SegmentDomPool } from '../utils/segmentDomPool';

// 独立格式 Parser：漫画归档
export { VitraCbzParser, VitraCbtParser, VitraCbrParser, VitraCb7Parser } from './parsers/vitraComicParser';
export type { ArchiveLoader, ArchiveEntry } from './parsers/comicArchiveAdapters';

// 独立格式 Parser：DOCX
export { VitraDocxParser } from './parsers/vitraDocxParser';

// 独立格式 Parser：DJVU（骨架）
export { VitraDjvuParser } from './parsers/vitraDjvuParser';

// 向量渲染规划器 (4.4)
export {
  buildVitraVectorRenderPlan,
  resolveVitraVectorConfig,
  DEFAULT_VITRA_VECTOR_CONFIG,
} from './vitraVectorPlanner';

// 渲染模式决策 (4.4)
export { resolveReaderRenderMode } from './readerRenderMode';
export type { ReaderRenderModeDecision } from './readerRenderMode';

// CSS 注入模板 (4.6)
export { buildReaderCssTemplate } from '../utils/readerCss';
export type { ReaderCssConfig, ReaderCssOptions } from '../utils/readerCss';

// 解析缓存 (5.1)
export { VitraBookCache } from './vitraBookCache';
export type { VitraCachedBook, VitraCacheStats } from './vitraBookCache';

// Section LRU 内存管理 (5.2)
export { VitraSectionManager } from './vitraSectionManager';
export type { VitraSectionManagerOptions, VitraSectionManagerStats } from './vitraSectionManager';

// 搜索索引缓存 (5.3 辅助)
export {
  upsertChapterIndex,
  hasChapterIndex,
  getIndexedChapterCount,
  clearBookIndex,
  searchBookIndex,
} from './searchIndexCache';

// 分页类型 (4.3)
export type {
  BlockMetrics,
  PageBoundary,
  VitraPaginateOptions,
} from '../types/vitraPagination';

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
} from '../types/vectorRender';

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
} from '../types/vitraBook';
