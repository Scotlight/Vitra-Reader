/**
 * ShadowRenderer 内部常量。
 *
 * 按用途分组：
 * - 章节大小 / 向量化：LARGE_CHAPTER_HTML_THRESHOLD / VECTOR_* / CHUNK_*
 * - 媒体资源敏感章节：MEDIA_*
 * - 高度估算：EST_*
 * - 渲染阶段资源加载：RENDER_*
 * - 水合阶段：HYDRATE_*
 *
 * 所有常量为 readonly，仅在模块内定义，不接收运行时注入。
 * 若需要运行时可调参数，应通过 DEFAULT_VITRA_VECTOR_CONFIG 或 ReaderStyleConfig。
 */

import { DEFAULT_VITRA_VECTOR_CONFIG } from '../../../engine';

// ── 章节大小 / 向量化 ──
export const LARGE_CHAPTER_HTML_THRESHOLD = DEFAULT_VITRA_VECTOR_CONFIG.largeChapterThreshold;
export const CHUNK_APPEND_BATCH_SIZE = 120;
export const CHUNK_APPEND_MIN_BATCH_SIZE = 40;
export const VECTOR_SEGMENT_CHAR_BUDGET = 16_000;
export const VECTOR_MIN_SEGMENT_EST_HEIGHT = 96;
export const VECTOR_HYDRATE_YIELD_EVERY_SEGMENTS = 1;
export const VECTOR_HYDRATE_MEASURE_BATCH_SIZE = 4;
export const VECTOR_IDLE_TIMEOUT_MS = 120;

export const SEGMENT_ASSET_SELECTOR = 'img,video,audio,source,svg,image';
export const MEDIA_LAYOUT_SELECTOR = 'img,video,picture,svg,canvas,figure,table,math';

// ── 媒体资源敏感章节（含图 / 视频 / 表格等，首屏必须稳定布局） ──
export const MEDIA_SENSITIVE_LOAD_TIMEOUT_MS = 4_500;
export const MEDIA_SENSITIVE_MAX_TRACKED_IMAGES = 128;
export const MEDIA_SENSITIVE_INITIAL_SEGMENT_CAP = 6;

// ── 高度估算参数 ──
export const EST_TEXT_NODE_MIN_CHAR_WEIGHT = 24;
export const EST_ELEMENT_NODE_MIN_CHAR_WEIGHT = 40;
export const EST_ELEMENT_NODE_TAG_OVERHEAD = 32;
export const EST_MEDIA_ELEMENT_CHAR_BOOST = 260;
export const EST_UNKNOWN_NODE_CHAR_WEIGHT = 32;
export const EST_FONT_SIZE_MIN_PX = 11;
export const EST_FONT_SIZE_DEFAULT_PX = 16;
export const EST_PAGE_WIDTH_MIN_PX = 360;
export const EST_PAGE_WIDTH_MAX_PX = 1400;
export const EST_PAGE_WIDTH_DEFAULT_PX = 900;
export const EST_CHARS_PER_LINE_MIN = 18;
export const EST_CHAR_WIDTH_RATIO = 1.75;
export const EST_MIN_LINES = 2;
export const EST_LINE_HEIGHT_MIN_FACTOR = 1.25;
export const EST_LINE_HEIGHT_DEFAULT = 1.6;
export const EST_PARAGRAPH_SPACING_FACTOR_MIN = 1.04;
export const EST_PARAGRAPH_SPACING_NORMALIZE_DIVISOR = 220;

// ── 渲染阶段资源加载参数 ──
export const RENDER_VECTORIZED_LOAD_TIMEOUT_MS = 3_500;
export const RENDER_LARGE_CHAPTER_LOAD_TIMEOUT_MS = 6_500;
export const RENDER_VECTORIZED_MAX_TRACKED_IMAGES = 10;
export const RENDER_LARGE_MAX_TRACKED_IMAGES = 16;
export const RENDER_NORMAL_MAX_TRACKED_IMAGES = 48;

// ── 水合阶段参数 ──
export const HYDRATE_MEDIA_CHECK_INTERVAL = 3;
export const HYDRATE_MEDIA_LOAD_TIMEOUT_MS = 2_500;
export const HYDRATE_MEDIA_MAX_TRACKED_IMAGES = 4;
