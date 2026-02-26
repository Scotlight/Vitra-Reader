/**
 * Vitra 渐进式水合调度器
 *
 * 对应文档 4.5：大章节（>100KB HTML）分阶段渲染，
 * 确保首屏渲染不被低优先级任务阻塞。
 *
 * 7 个阶段按优先级排列：
 *   Phase 1 (0ms):    骨架渲染 — 注入 HTML
 *   Phase 2 (16ms):   样式注入 — 注入自定义 CSS
 *   Phase 3 (50ms):   分页计算 — 测量 DOM + 计算页面映射
 *   Phase 4 (100ms):  位置恢复 — 滚动到上次阅读位置
 *   Phase 5 (idle):   高亮渲染 — 注入用户标注
 *   Phase 6 (idle):   搜索索引 — 建立全文搜索索引
 *   Phase 7 (idle):   预加载   — 预加载相邻章节
 */

// ─── 阶段定义 ────────────────────────────────────────

export type VitraHydrationPhase =
    | 'skeleton'
    | 'styles'
    | 'paginate'
    | 'restore-position'
    | 'highlights'
    | 'search-index'
    | 'preload'

export const HYDRATION_PHASE_ORDER: readonly VitraHydrationPhase[] = [
    'skeleton',
    'styles',
    'paginate',
    'restore-position',
    'highlights',
    'search-index',
    'preload',
]

/** 每个阶段的默认延迟（ms），idle 阶段使用 requestIdleCallback */
const PHASE_DELAY: Readonly<Record<VitraHydrationPhase, number>> = {
    'skeleton': 0,
    'styles': 16,
    'paginate': 50,
    'restore-position': 100,
    'highlights': -1,     // idle
    'search-index': -1,   // idle
    'preload': -1,        // idle
}

const DEFAULT_IDLE_TIMEOUT_MS = 600

// ─── 公共接口 ────────────────────────────────────────

export interface VitraHydrationTask {
    readonly phase: VitraHydrationPhase
    readonly run: () => void | Promise<void>
}

export interface VitraHydrationProgress {
    readonly phase: VitraHydrationPhase
    readonly index: number
    readonly total: number
    readonly durationMs: number
}

export interface VitraHydrationHandle {
    /** 等待所有阶段完成 */
    readonly done: Promise<void>
    /** 中止后续阶段 */
    readonly abort: () => void
}

export interface VitraHydrationOptions {
    /** 空闲阶段的超时（默认 600ms） */
    idleTimeoutMs?: number
    /** 每阶段完成后的回调 */
    onPhaseComplete?: (progress: VitraHydrationProgress) => void
}

// ─── 核心调度 ────────────────────────────────────────

function waitMs(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)))
}

function waitIdle(timeoutMs: number): Promise<void> {
    if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
        return new Promise<void>((resolve) => {
            window.requestIdleCallback(() => resolve(), {
                timeout: Math.max(0, Math.floor(timeoutMs)),
            })
        })
    }
    return new Promise<void>((resolve) => setTimeout(resolve, 0))
}

/**
 * 调度一组水合任务按阶段顺序执行。
 *
 * - skeleton/styles/paginate/restore-position 用 setTimeout 延迟
 * - highlights/search-index/preload 用 requestIdleCallback 调度
 * - 每阶段完成后触发 onPhaseComplete 回调
 * - 可通过 abort() 中止后续阶段
 */
export function scheduleHydration(
    tasks: readonly VitraHydrationTask[],
    options: VitraHydrationOptions = {},
): VitraHydrationHandle {
    const idleTimeoutMs = options.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS
    let aborted = false

    const done = (async () => {
        const sorted = sortByPhaseOrder(tasks)

        for (let i = 0; i < sorted.length; i++) {
            if (aborted) return

            const task = sorted[i]
            const delay = PHASE_DELAY[task.phase]
            const startAt = performance.now()

            // 按延迟类型等待
            if (delay < 0) {
                await waitIdle(idleTimeoutMs)
            } else if (delay > 0) {
                await waitMs(delay)
            }

            if (aborted) return

            // 执行任务
            await task.run()

            options.onPhaseComplete?.({
                phase: task.phase,
                index: i,
                total: sorted.length,
                durationMs: performance.now() - startAt,
            })
        }
    })()

    return {
        done,
        abort: () => { aborted = true },
    }
}

// ─── 工具 ────────────────────────────────────────────

const PHASE_INDEX: Readonly<Record<VitraHydrationPhase, number>> = {
    'skeleton': 0,
    'styles': 1,
    'paginate': 2,
    'restore-position': 3,
    'highlights': 4,
    'search-index': 5,
    'preload': 6,
}

function sortByPhaseOrder(tasks: readonly VitraHydrationTask[]): VitraHydrationTask[] {
    return [...tasks].sort((a, b) => PHASE_INDEX[a.phase] - PHASE_INDEX[b.phase])
}

/**
 * 判断给定 HTML 大小是否达到渐进式水合阈值。
 *
 * 文档标准：>100KB HTML 启用渐进式水合。
 */
export function shouldUseProgressiveHydration(htmlSizeBytes: number): boolean {
    return htmlSizeBytes > 100_000
}
