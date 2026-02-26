import type { BlockMetrics, PageBoundary, VitraPaginateOptions } from '../types/vitraPagination'
import {
    collectCanvasBlockMetricsIdle,
    isCanvasMeasureEligible,
} from './vitraCanvasMeasure'

const DEFAULT_GAP = 0
const DEFAULT_MIN_BREAKABLE_SPACE_RATIO = 0.2
const DEFAULT_BLOCK_SELECTOR = 'p,h1,h2,h3,h4,h5,h6,li,blockquote,pre,figure,table,section,article,div,img,svg,video,canvas'
const DEFAULT_MEASURE_BATCH_SIZE = 100
const DEFAULT_IDLE_TIMEOUT_MS = 120
const MIN_IDLE_BATCH_SIZE = 20
const MAX_IDLE_BATCH_SIZE = 600

export interface VitraBlockMeasureOptions {
    batchSize?: number
    idleTimeoutMs?: number
    signal?: AbortSignal
    strategy?: 'auto' | 'dom' | 'canvas'
    canvasCalibrationSamples?: number
    canvasTextCacheEntries?: number
    onBatchMeasured?: (
        blocks: readonly BlockMetrics[],
        progress: VitraBlockMeasureProgress,
    ) => void
}

export interface VitraBlockMeasureProgress {
    blocksMeasured: number
    processedCandidates: number
    totalCandidates: number
}

export interface VitraIdlePaginationProgress extends VitraBlockMeasureProgress {
    boundaries: readonly PageBoundary[]
    done: boolean
}

function createBoundary(startBlock: number, endBlock: number, startOffset: number, endOffset: number): PageBoundary {
    return { sectionIndex: 0, startBlock, endBlock, startOffset, endOffset }
}

function isBoundaryEmpty(boundary: PageBoundary): boolean {
    return boundary.endBlock < boundary.startBlock || (boundary.endOffset <= 0 && boundary.startOffset <= 0)
}

function normalizeBlockHeight(height: number, gap: number): number {
    return Math.max(1, Math.ceil(height + gap))
}

function isBreakableTag(tagName: string): boolean {
    return !new Set(['img', 'svg', 'video', 'audio', 'canvas', 'table', 'pre', 'code', 'figure', 'math']).has(tagName)
}

function toElementKey(element: HTMLElement, index: number): string {
    const id = element.id ? `#${element.id}` : ''
    return `${element.tagName.toLowerCase()}${id}:${index}`
}

function clampNumber(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value))
}

function normalizeBatchSize(batchSize?: number): number {
    return clampNumber(
        Math.floor(batchSize ?? DEFAULT_MEASURE_BATCH_SIZE),
        MIN_IDLE_BATCH_SIZE,
        MAX_IDLE_BATCH_SIZE,
    )
}

function ensureNotAborted(signal?: AbortSignal): void {
    if (signal?.aborted) {
        throw new Error('Pagination block measurement aborted')
    }
}

function resolveMeasureStrategy(
    root: HTMLElement,
    selector: string,
    strategy: VitraBlockMeasureOptions['strategy'],
): 'dom' | 'canvas' {
    const resolved = strategy ?? 'auto'
    if (resolved === 'dom') return 'dom'

    const eligible = isCanvasMeasureEligible(root, selector)
    if (resolved === 'canvas') {
        if (!eligible) {
            throw new Error('Canvas pagination measurement requires pure text layout without media/table/pre blocks')
        }
        return 'canvas'
    }
    return eligible ? 'canvas' : 'dom'
}

function waitForIdle(timeoutMs: number): Promise<void> {
    if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
        return new Promise<void>((resolve) => {
            window.requestIdleCallback(() => resolve(), {
                timeout: Math.max(0, Math.floor(timeoutMs)),
            })
        })
    }
    return new Promise<void>((resolve) => {
        setTimeout(resolve, 0)
    })
}

function collectRenderableBlockMetric(
    element: HTMLElement,
    rootRect: DOMRect,
    rootScrollTop: number,
    renderableIndex: number,
): BlockMetrics | null {
    const style = window.getComputedStyle(element)
    if (style.display === 'none') return null
    if (style.visibility === 'hidden') return null
    if (Number(style.opacity || 1) === 0) return null

    const rect = element.getBoundingClientRect()
    if (rect.width <= 1 || rect.height <= 1) return null

    return {
        element: toElementKey(element, renderableIndex),
        offsetTop: rect.top - rootRect.top + rootScrollTop,
        height: rect.height,
        isBreakable: isBreakableTag(element.tagName.toLowerCase()),
    }
}

function createChunkedBoundaries(blockIndex: number, blockHeight: number, viewportHeight: number): PageBoundary[] {
    const boundaries: PageBoundary[] = []
    let consumed = 0
    while (consumed < blockHeight) {
        const next = Math.min(blockHeight, consumed + viewportHeight)
        boundaries.push(createBoundary(blockIndex, blockIndex, consumed, next))
        consumed = next
    }
    return boundaries
}

export function paginateBlocks(
    blocks: readonly BlockMetrics[],
    viewportHeight: number,
    options: VitraPaginateOptions = {},
): PageBoundary[] {
    if (blocks.length === 0) return []
    const safeViewportHeight = Math.max(1, Math.floor(viewportHeight))
    const gap = Math.max(0, options.gap ?? DEFAULT_GAP)
    const minBreakableSpace = safeViewportHeight * (options.minBreakableSpaceRatio ?? DEFAULT_MIN_BREAKABLE_SPACE_RATIO)
    const pages: PageBoundary[] = []
    let page = createBoundary(0, 0, 0, 0)
    let remainingHeight = safeViewportHeight

    blocks.forEach((block, index) => {
        const blockHeight = normalizeBlockHeight(block.height, gap)
        if (blockHeight <= remainingHeight) {
            page.endBlock = index
            page.endOffset = blockHeight
            remainingHeight -= blockHeight
            return
        }
        if (block.isBreakable && remainingHeight > minBreakableSpace) {
            page.endBlock = index
            page.endOffset = remainingHeight
            if (!isBoundaryEmpty(page)) pages.push({ ...page })
            page = createBoundary(index, index, remainingHeight, blockHeight)
            remainingHeight = safeViewportHeight - (blockHeight - remainingHeight)
            return
        }

        if (!isBoundaryEmpty(page)) pages.push({ ...page })
        if (blockHeight <= safeViewportHeight) {
            page = createBoundary(index, index, 0, blockHeight)
            remainingHeight = safeViewportHeight - blockHeight
            return
        }

        const chunked = createChunkedBoundaries(index, blockHeight, safeViewportHeight)
        pages.push(...chunked)
        page = createBoundary(index + 1, index + 1, 0, 0)
        remainingHeight = safeViewportHeight
    })

    if (!isBoundaryEmpty(page)) pages.push({ ...page })
    return pages
}

export function collectBlockMetrics(root: HTMLElement, selector = DEFAULT_BLOCK_SELECTOR): BlockMetrics[] {
    const rootRect = root.getBoundingClientRect()
    const rootScrollTop = root.scrollTop
    let renderableIndex = 0
    return Array.from(root.querySelectorAll(selector))
        .filter((node): node is HTMLElement => node instanceof HTMLElement)
        .flatMap((element) => {
            const metric = collectRenderableBlockMetric(
                element,
                rootRect,
                rootScrollTop,
                renderableIndex,
            )
            if (!metric) return []
            renderableIndex += 1
            return [metric]
        })
}

export async function collectBlockMetricsIdle(
    root: HTMLElement,
    selector = DEFAULT_BLOCK_SELECTOR,
    options: VitraBlockMeasureOptions = {},
): Promise<BlockMetrics[]> {
    const strategy = resolveMeasureStrategy(root, selector, options.strategy)
    if (strategy === 'canvas') {
        return collectCanvasBlockMetricsIdle(root, selector, {
            batchSize: normalizeBatchSize(options.batchSize),
            idleTimeoutMs: options.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS,
            signal: options.signal,
            calibrationSamples: options.canvasCalibrationSamples,
            maxTextCacheEntries: options.canvasTextCacheEntries,
            onBatchMeasured: options.onBatchMeasured,
        })
    }

    const batchSize = normalizeBatchSize(options.batchSize)
    const idleTimeoutMs = options.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS
    const rootRect = root.getBoundingClientRect()
    const rootScrollTop = root.scrollTop
    const nodes = Array.from(root.querySelectorAll(selector))
        .filter((node): node is HTMLElement => node instanceof HTMLElement)

    const blocks: BlockMetrics[] = []
    let renderableIndex = 0
    const emitProgress = (processedCandidates: number) => {
        options.onBatchMeasured?.(blocks, {
            blocksMeasured: blocks.length,
            processedCandidates,
            totalCandidates: nodes.length,
        })
    }

    for (let offset = 0; offset < nodes.length; offset += batchSize) {
        ensureNotAborted(options.signal)

        const chunk = nodes.slice(offset, offset + batchSize)
        for (const element of chunk) {
            ensureNotAborted(options.signal)

            const metric = collectRenderableBlockMetric(
                element,
                rootRect,
                rootScrollTop,
                renderableIndex,
            )
            if (!metric) continue
            blocks.push(metric)
            renderableIndex += 1
        }
        emitProgress(Math.min(nodes.length, offset + chunk.length))

        if (offset + batchSize < nodes.length) {
            await waitForIdle(idleTimeoutMs)
        }
    }

    return blocks
}

export function buildPageBoundariesFromDom(
    root: HTMLElement,
    viewportHeight: number,
    options: VitraPaginateOptions = {},
): PageBoundary[] {
    const blocks = collectBlockMetrics(root)
    return paginateBlocks(blocks, viewportHeight, options)
}

export async function buildPageBoundariesFromDomIdle(
    root: HTMLElement,
    viewportHeight: number,
    options: VitraPaginateOptions = {},
    measureOptions: VitraBlockMeasureOptions = {},
    onProgress?: (progress: VitraIdlePaginationProgress) => void,
): Promise<PageBoundary[]> {
    let latestProgress: VitraBlockMeasureProgress = {
        blocksMeasured: 0,
        processedCandidates: 0,
        totalCandidates: 0,
    }

    const blocks = await collectBlockMetricsIdle(root, DEFAULT_BLOCK_SELECTOR, {
        ...measureOptions,
        onBatchMeasured: (currentBlocks, progress) => {
            latestProgress = progress
            measureOptions.onBatchMeasured?.(currentBlocks, progress)
            if (!onProgress) return
            onProgress({
                ...progress,
                boundaries: paginateBlocks(currentBlocks, viewportHeight, options),
                done: false,
            })
        },
    })

    const boundaries = paginateBlocks(blocks, viewportHeight, options)
    onProgress?.({
        ...latestProgress,
        blocksMeasured: blocks.length,
        boundaries,
        done: true,
    })
    return boundaries
}
