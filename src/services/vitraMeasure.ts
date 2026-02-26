/**
 * Vitra 离屏 DOM 测量服务
 *
 * 将 HTML 注入离屏容器进行块级元素测量，
 * 结合 vitraPaginator 生成分页边界（PageBoundary）。
 *
 * 对应文档 4.2 Stage 2 (Measure) + Stage 3 (Paginate)。
 */

import type { PageBoundary } from '../types/vitraPagination'
import {
    buildPageBoundariesFromDomIdle,
    type VitraBlockMeasureOptions,
    type VitraIdlePaginationProgress,
} from './vitraPaginator'
import type { VitraPaginateOptions } from '../types/vitraPagination'

// ─── 配置默认值 ──────────────────────────────────────

const DEFAULT_BATCH_SIZE = 100
const DEFAULT_IDLE_TIMEOUT_MS = 120
const DEFAULT_CANVAS_CALIBRATION_SAMPLES = 3
const DEFAULT_CANVAS_TEXT_CACHE_ENTRIES = 3000

// ─── 公共接口 ────────────────────────────────────────

export interface VitraMeasureConfig {
    /** DOM 测量批次大小（默认 100） */
    batchSize?: number
    /** 空闲回调超时（默认 120ms） */
    idleTimeoutMs?: number
    /** 测量策略：auto 自动选择、dom 强制 DOM 测量、canvas 强制 Canvas 估算 */
    strategy?: 'auto' | 'dom' | 'canvas'
    /** Canvas 校准采样数（默认 3） */
    canvasCalibrationSamples?: number
    /** Canvas 文本缓存条目数（默认 3000） */
    canvasTextCacheEntries?: number
}

export interface VitraMeasureRequest {
    /** 待测量的 HTML 源节点（将被 cloneNode 复制） */
    sourceNode: HTMLElement
    /** 视口高度（px） */
    viewportHeight: number
    /** 离屏宿主容器（不可见但参与布局） */
    host: HTMLElement
    /** 可选测量配置 */
    config?: VitraMeasureConfig
    /** 可选分页选项 */
    paginateOptions?: VitraPaginateOptions
    /** 进度回调（每批次触发） */
    onProgress?: (progress: VitraIdlePaginationProgress) => void
}

export interface VitraMeasureHandle {
    /** 等待测量完成，返回分页边界 */
    readonly result: Promise<readonly PageBoundary[]>
    /** 取消测量 */
    readonly abort: () => void
}

// ─── 核心函数 ────────────────────────────────────────

/**
 * 启动一次离屏 DOM 测量 + 分页计算。
 *
 * 流程：
 * 1. 将 sourceNode 深拷贝到 host 容器
 * 2. 使用 buildPageBoundariesFromDomIdle 进行空闲调度测量
 * 3. 完成或中止后清理离屏节点
 *
 * @returns 可取消的测量句柄
 */
export function startMeasure(request: VitraMeasureRequest): VitraMeasureHandle {
    const {
        sourceNode,
        viewportHeight,
        host,
        config = {},
        paginateOptions = {},
        onProgress,
    } = request

    if (viewportHeight <= 0) {
        return { result: Promise.resolve([]), abort: () => {} }
    }

    const controller = new AbortController()
    const measureNode = sourceNode.cloneNode(true) as HTMLElement
    measureNode.style.width = '100%'
    host.appendChild(measureNode)

    const measureOpts: VitraBlockMeasureOptions = {
        batchSize: config.batchSize ?? DEFAULT_BATCH_SIZE,
        idleTimeoutMs: config.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS,
        signal: controller.signal,
        strategy: config.strategy ?? 'auto',
        canvasCalibrationSamples: config.canvasCalibrationSamples ?? DEFAULT_CANVAS_CALIBRATION_SAMPLES,
        canvasTextCacheEntries: config.canvasTextCacheEntries ?? DEFAULT_CANVAS_TEXT_CACHE_ENTRIES,
    }

    const cleanup = () => {
        if (host.contains(measureNode)) {
            host.removeChild(measureNode)
        }
    }

    const result = buildPageBoundariesFromDomIdle(
        measureNode,
        viewportHeight,
        paginateOptions,
        measureOpts,
        onProgress,
    ).then(
        (boundaries) => {
            cleanup()
            if (controller.signal.aborted) return []
            return boundaries
        },
        (error) => {
            cleanup()
            if (controller.signal.aborted) return []
            throw error
        },
    )

    const abort = () => {
        controller.abort()
        cleanup()
    }

    return { result, abort }
}

/**
 * 一次性测量便捷函数（不可中止）。
 *
 * 适用于不需要中途取消的场景。
 */
export async function measurePageBoundaries(
    sourceNode: HTMLElement,
    viewportHeight: number,
    host: HTMLElement,
    config?: VitraMeasureConfig,
    paginateOptions?: VitraPaginateOptions,
): Promise<readonly PageBoundary[]> {
    const handle = startMeasure({
        sourceNode,
        viewportHeight,
        host,
        config,
        paginateOptions,
    })
    return handle.result
}
