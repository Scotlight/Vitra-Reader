import type { BlockMetrics } from '../types/vitraPagination'
import { clampNumber } from '../../utils/mathUtils'

const COMPLEX_LAYOUT_SELECTOR = 'img,svg,video,audio,canvas,table,math,pre,code,figure,iframe,object,embed,input,textarea,select,button'
const NON_BREAKABLE_TAGS = new Set(['img', 'svg', 'video', 'audio', 'canvas', 'table', 'pre', 'code', 'figure', 'math'])
const DEFAULT_CALIBRATION_SAMPLES = 3
const DEFAULT_MAX_TEXT_CACHE_ENTRIES = 2500
const MAX_STYLE_FACTOR_CACHE_ENTRIES = 256
const MIN_CONTENT_WIDTH_PX = 64
const STYLE_FACTOR_CACHE = new Map<string, number>()

/**
 * 清除 Canvas 测量缓存。
 * 当字体加载完成或用户切换字体时应调用此函数，
 * 使后续测量使用正确的字体度量。
 */
export function invalidateCanvasMeasureCache(): void {
    STYLE_FACTOR_CACHE.clear()
}

interface CanvasProgressPayload {
    blocksMeasured: number
    processedCandidates: number
    totalCandidates: number
}

interface CanvasCollectOptions {
    batchSize: number
    idleTimeoutMs: number
    signal?: AbortSignal
    calibrationSamples?: number
    maxTextCacheEntries?: number
    onBatchMeasured?: (blocks: readonly BlockMetrics[], progress: CanvasProgressPayload) => void
}

interface CanvasMeasureState {
    context: CanvasRenderingContext2D
    rootContentWidth: number
    textHeightCache: Map<string, number>
    maxTextCacheEntries: number
    calibrationBudget: number
    cumulativeTop: number
}



function parseCssNumber(value: string, fallback = 0): number {
    const parsed = Number.parseFloat(value)
    return Number.isFinite(parsed) ? parsed : fallback
}

function ensureNotAborted(signal?: AbortSignal): void {
    if (signal?.aborted) throw new Error('Pagination block measurement aborted')
}

function waitForIdle(timeoutMs: number): Promise<void> {
    if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
        return new Promise<void>((resolve) => {
            window.requestIdleCallback(() => resolve(), { timeout: Math.max(0, Math.floor(timeoutMs)) })
        })
    }
    return new Promise<void>((resolve) => setTimeout(resolve, 0))
}

function buildFontShorthand(style: CSSStyleDeclaration): string {
    if (style.font && style.font.trim().length > 0) return style.font
    const pieces = [
        style.fontStyle || 'normal',
        style.fontVariant || 'normal',
        style.fontWeight || '400',
        style.fontSize || '16px',
        style.fontFamily || 'sans-serif',
    ]
    return pieces.join(' ').replace(/\s+/g, ' ').trim()
}

function normalizeTextForMeasure(text: string, whiteSpace: string): string {
    const normalizedLineBreaks = text.replace(/\r\n?/g, '\n')
    if (whiteSpace.includes('pre')) {
        return normalizedLineBreaks
    }
    if (whiteSpace === 'pre-line') {
        return normalizedLineBreaks
            .split('\n')
            .map((line) => line.replace(/[ \t\f\v]+/g, ' ').trim())
            .join('\n')
    }
    return normalizedLineBreaks.replace(/\s+/g, ' ').trim()
}

function computeRootContentWidth(root: HTMLElement): number {
    const rootStyle = window.getComputedStyle(root)
    const width = root.clientWidth
        - parseCssNumber(rootStyle.paddingLeft)
        - parseCssNumber(rootStyle.paddingRight)
    return Math.max(MIN_CONTENT_WIDTH_PX, Math.floor(width))
}

function resolveLineHeight(style: CSSStyleDeclaration): number {
    const fontSize = Math.max(8, parseCssNumber(style.fontSize, 16))
    if (style.lineHeight === 'normal') return Math.max(10, fontSize * 1.6)
    return Math.max(10, parseCssNumber(style.lineHeight, fontSize * 1.6))
}

function resolveContentWidth(style: CSSStyleDeclaration, rootContentWidth: number): number {
    const widthLoss = parseCssNumber(style.paddingLeft)
        + parseCssNumber(style.paddingRight)
        + parseCssNumber(style.borderLeftWidth)
        + parseCssNumber(style.borderRightWidth)
        + Math.max(0, parseCssNumber(style.textIndent))
    return Math.max(MIN_CONTENT_WIDTH_PX, rootContentWidth - widthLoss)
}

function resolveBlockChromeHeight(style: CSSStyleDeclaration): number {
    return parseCssNumber(style.paddingTop)
        + parseCssNumber(style.paddingBottom)
        + parseCssNumber(style.borderTopWidth)
        + parseCssNumber(style.borderBottomWidth)
}

function isElementRenderable(style: CSSStyleDeclaration): boolean {
    if (style.display === 'none') return false
    if (style.visibility === 'hidden') return false
    if (Number(style.opacity || 1) === 0) return false
    return true
}

function estimateTextLines(
    ctx: CanvasRenderingContext2D,
    text: string,
    contentWidth: number,
    letterSpacing: number,
): number {
    if (!text) return 1
    const lines = text.split('\n')
    let totalLines = 0

    for (const line of lines) {
        const source = line.length > 0 ? line : ' '
        const width = ctx.measureText(source).width + Math.max(0, source.length - 1) * letterSpacing
        totalLines += Math.max(1, Math.ceil(width / contentWidth))
    }
    return Math.max(1, totalLines)
}

function toElementKey(element: HTMLElement, index: number): string {
    const id = element.id ? `#${element.id}` : ''
    return `${element.tagName.toLowerCase()}${id}:${index}`
}

function isBreakableTag(tagName: string): boolean {
    return !NON_BREAKABLE_TAGS.has(tagName)
}

function createMeasureState(root: HTMLElement, options: CanvasCollectOptions): CanvasMeasureState {
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    if (!context) {
        throw new Error('Canvas context is unavailable for pagination measurement')
    }

    return {
        context,
        rootContentWidth: computeRootContentWidth(root),
        textHeightCache: new Map<string, number>(),
        maxTextCacheEntries: Math.max(200, Math.floor(options.maxTextCacheEntries ?? DEFAULT_MAX_TEXT_CACHE_ENTRIES)),
        calibrationBudget: Math.max(0, Math.floor(options.calibrationSamples ?? DEFAULT_CALIBRATION_SAMPLES)),
        cumulativeTop: 0,
    }
}

function pushTextHeightCache(state: CanvasMeasureState, key: string, height: number): void {
    if (state.textHeightCache.size >= state.maxTextCacheEntries) {
        state.textHeightCache.clear()
    }
    state.textHeightCache.set(key, height)
}

function updateStyleFactor(styleKey: string, factor: number): void {
    if (STYLE_FACTOR_CACHE.size >= MAX_STYLE_FACTOR_CACHE_ENTRIES) {
        STYLE_FACTOR_CACHE.clear()
    }
    STYLE_FACTOR_CACHE.set(styleKey, factor)
}

function resolveCorrectionFactor(
    styleKey: string,
    rawHeight: number,
    element: HTMLElement,
    state: CanvasMeasureState,
    normalizedText: string,
): number {
    const cached = STYLE_FACTOR_CACHE.get(styleKey)
    if (cached !== undefined) return cached
    if (state.calibrationBudget <= 0) return 1
    if (normalizedText.length < 24) return 1

    const actualHeight = element.getBoundingClientRect().height
    if (!(actualHeight > 1 && rawHeight > 1)) return 1

    const factor = clampNumber(actualHeight / rawHeight, 0.72, 1.38)
    updateStyleFactor(styleKey, factor)
    state.calibrationBudget -= 1
    return factor
}

function collectCanvasMetric(
    element: HTMLElement,
    renderableIndex: number,
    state: CanvasMeasureState,
): BlockMetrics | null {
    const style = window.getComputedStyle(element)
    if (!isElementRenderable(style)) return null

    const normalizedText = normalizeTextForMeasure(element.textContent || '', style.whiteSpace)
    if (!normalizedText && element.children.length === 0) return null

    const font = buildFontShorthand(style)
    const lineHeight = resolveLineHeight(style)
    const letterSpacing = parseCssNumber(style.letterSpacing)
    const contentWidth = resolveContentWidth(style, state.rootContentWidth)
    const blockChromeHeight = resolveBlockChromeHeight(style)

    state.context.font = font
    const cacheKey = `${font}|${lineHeight}|${letterSpacing}|${contentWidth}|${blockChromeHeight}|${normalizedText}`
    const cachedHeight = state.textHeightCache.get(cacheKey)
    if (cachedHeight !== undefined) {
        return {
            element: toElementKey(element, renderableIndex),
            offsetTop: state.cumulativeTop,
            height: cachedHeight,
            isBreakable: isBreakableTag(element.tagName.toLowerCase()),
        }
    }

    const lines = estimateTextLines(state.context, normalizedText, contentWidth, letterSpacing)
    const rawHeight = Math.max(1, lines * lineHeight + blockChromeHeight)
    const styleKey = `${font}|${lineHeight}|${letterSpacing}|${contentWidth}|${blockChromeHeight}`
    const factor = resolveCorrectionFactor(styleKey, rawHeight, element, state, normalizedText)
    const minHeight = parseCssNumber(style.minHeight, 0)
    const finalHeight = Math.max(1, rawHeight * factor, minHeight)

    pushTextHeightCache(state, cacheKey, finalHeight)

    return {
        element: toElementKey(element, renderableIndex),
        offsetTop: state.cumulativeTop,
        height: finalHeight,
        isBreakable: isBreakableTag(element.tagName.toLowerCase()),
    }
}

export function isCanvasMeasureEligible(root: HTMLElement, selector: string): boolean {
    if (root.querySelector(COMPLEX_LAYOUT_SELECTOR)) return false
    const candidates = Array.from(root.querySelectorAll(selector))
        .filter((node): node is HTMLElement => node instanceof HTMLElement)
    if (candidates.length === 0) return false
    return candidates.some((element) => (element.textContent || '').trim().length > 0)
}

export async function collectCanvasBlockMetricsIdle(
    root: HTMLElement,
    selector: string,
    options: CanvasCollectOptions,
): Promise<BlockMetrics[]> {
    // 等待字体加载完成，确保 Canvas.measureText 使用正确的字体度量
    if (typeof document !== 'undefined' && document.fonts?.ready) {
        await document.fonts.ready
    }

    const nodes = Array.from(root.querySelectorAll(selector))
        .filter((node): node is HTMLElement => node instanceof HTMLElement)
    const state = createMeasureState(root, options)
    const blocks: BlockMetrics[] = []
    let renderableIndex = 0

    for (let offset = 0; offset < nodes.length; offset += options.batchSize) {
        ensureNotAborted(options.signal)
        const chunk = nodes.slice(offset, offset + options.batchSize)

        for (const element of chunk) {
            ensureNotAborted(options.signal)
            const metric = collectCanvasMetric(element, renderableIndex, state)
            if (!metric) continue
            blocks.push(metric)
            state.cumulativeTop += metric.height
            renderableIndex += 1
        }

        options.onBatchMeasured?.(blocks, {
            blocksMeasured: blocks.length,
            processedCandidates: Math.min(nodes.length, offset + chunk.length),
            totalCandidates: nodes.length,
        })

        if (offset + options.batchSize < nodes.length) {
            await waitForIdle(options.idleTimeoutMs)
        }
    }

    return blocks
}
