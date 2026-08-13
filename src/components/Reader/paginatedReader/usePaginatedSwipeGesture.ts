import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion'
import { formatPaginatedTranslateX } from './paginatedPageLayoutMath'
import {
    DEFAULT_SWIPE_CONFIG,
    resolveDragOffset,
    resolveSwipeIntent,
    shouldCommitSwipe,
} from './paginatedSwipeGesture'

interface UsePaginatedSwipeGestureOptions {
    readonly viewportRef: RefObject<HTMLDivElement | null>
    readonly columnRef: RefObject<HTMLDivElement | null>
    readonly getCurrentPage: () => number
    readonly canGoPrev: () => boolean
    readonly canGoNext: () => boolean
    readonly onPrev: () => void
    readonly onNext: () => void
    /** slide/realistic 才跟手；fade/none 只在松手判向 */
    readonly follow: boolean
}

/**
 * 分页阅读器横滑翻页手势（Pointer Events，仅 touch/pen——鼠标拖拽留给文本选择）。
 *
 * 与长按选词共存的策略：意图判定前不 capture、不 preventDefault，位移在 400ms 内
 * 未达阈值就永久放弃本次触摸（长按选词 400ms 出菜单，接管会杀掉它）；
 * 认定横滑后才 setPointerCapture 并在 move 上 preventDefault 阻断选区。
 *
 * 跟手位移走 ref + rAF 直写 style，不进 setState——每帧 re-render 会掉帧。
 */
export function usePaginatedSwipeGesture({
    viewportRef,
    columnRef,
    getCurrentPage,
    canGoPrev,
    canGoNext,
    onPrev,
    onNext,
    follow,
}: UsePaginatedSwipeGestureOptions) {
    const prefersReducedMotion = usePrefersReducedMotion()
    // 回弹动画期间禁止新手势起手（fadePhaseRef 同款防重入思路）
    const settlingRef = useRef(false)
    const optionsRef = useRef({ getCurrentPage, canGoPrev, canGoNext, onPrev, onNext, follow, prefersReducedMotion })
    optionsRef.current = { getCurrentPage, canGoPrev, canGoNext, onPrev, onNext, follow, prefersReducedMotion }

    useEffect(() => {
        const viewport = viewportRef.current
        const container = columnRef.current
        if (!viewport || !container) return

        const config = DEFAULT_SWIPE_CONFIG
        let pointerId: number | null = null
        let startX = 0
        let startY = 0
        let startTime = 0
        let lastX = 0
        let lastTime = 0
        let intent: 'undecided' | 'horizontal' | 'abandoned' = 'abandoned'
        let dragFrame: number | null = null
        let pendingOffset = 0
        let settleTimer: number | null = null

        const pageWidth = () => viewport.clientWidth

        const writeDragOffset = () => {
            dragFrame = null
            const { getCurrentPage: page } = optionsRef.current
            container.style.transition = 'none'
            container.style.transform = `translateX(${-(page() * pageWidth()) + pendingOffset}px)`
        }

        const scheduleDragWrite = (offset: number) => {
            pendingOffset = offset
            if (dragFrame === null) dragFrame = window.requestAnimationFrame(writeDragOffset)
        }

        const restoreBaseTransform = (animated: boolean) => {
            if (dragFrame !== null) {
                window.cancelAnimationFrame(dragFrame)
                dragFrame = null
            }
            const { getCurrentPage: page } = optionsRef.current
            container.style.transition = animated ? '' : 'none'
            container.style.transform = formatPaginatedTranslateX(page(), pageWidth())
            if (animated) {
                settlingRef.current = true
                if (settleTimer !== null) window.clearTimeout(settleTimer)
                settleTimer = window.setTimeout(() => {
                    settleTimer = null
                    settlingRef.current = false
                }, 300)
            }
        }

        const handlePointerDown = (event: PointerEvent) => {
            if (event.pointerType === 'mouse') return
            if (settlingRef.current) return
            pointerId = event.pointerId
            startX = event.clientX
            startY = event.clientY
            lastX = event.clientX
            startTime = event.timeStamp
            lastTime = event.timeStamp
            intent = 'undecided'
        }

        const handlePointerMove = (event: PointerEvent) => {
            if (pointerId !== event.pointerId || intent === 'abandoned') return
            const deltaX = event.clientX - startX
            const deltaY = event.clientY - startY

            if (intent === 'undecided') {
                // 超时未达阈值 = 用户在长按/慢读，本次触摸永久让路给文本选择
                if (event.timeStamp - startTime > config.longPressMs) {
                    intent = 'abandoned'
                    return
                }
                const resolved = resolveSwipeIntent(deltaX, deltaY, config)
                if (resolved === 'rejected') {
                    intent = 'abandoned'
                    return
                }
                if (resolved === 'horizontal') {
                    intent = 'horizontal'
                    viewport.setPointerCapture(event.pointerId)
                }
            }

            if (intent !== 'horizontal') return
            event.preventDefault()
            lastX = event.clientX
            lastTime = event.timeStamp

            const { canGoPrev: prev, canGoNext: next, follow: shouldFollow, prefersReducedMotion: reduced } = optionsRef.current
            if (!shouldFollow || reduced) return
            scheduleDragWrite(resolveDragOffset(deltaX, prev(), next(), config))
        }

        const finishGesture = (event: PointerEvent) => {
            if (pointerId !== event.pointerId) return
            const wasHorizontal = intent === 'horizontal'
            pointerId = null
            intent = 'abandoned'
            if (!wasHorizontal) return

            if (viewport.hasPointerCapture(event.pointerId)) {
                viewport.releasePointerCapture(event.pointerId)
            }

            const deltaX = event.clientX - startX
            // 用尾段速度而不是全程平均：慢拖后最后一甩也应该提交
            const tailMs = Math.max(1, event.timeStamp - lastTime + 1)
            const velocity = (event.clientX - lastX) / tailMs
            const { canGoPrev: prev, canGoNext: next, onPrev: goPrev, onNext: goNext } = optionsRef.current

            const commit = shouldCommitSwipe(deltaX, pageWidth(), velocity, config)
                && ((deltaX > 0 && prev()) || (deltaX < 0 && next()))

            if (commit) {
                // 位移交还基准位，翻页动画由 goToPage 按当前动画设置接管
                restoreBaseTransform(false)
                if (deltaX > 0) goPrev()
                else goNext()
                return
            }
            restoreBaseTransform(true)
        }

        const handlePointerCancel = (event: PointerEvent) => {
            if (pointerId !== event.pointerId) return
            const wasHorizontal = intent === 'horizontal'
            pointerId = null
            intent = 'abandoned'
            if (wasHorizontal) restoreBaseTransform(true)
        }

        viewport.addEventListener('pointerdown', handlePointerDown)
        viewport.addEventListener('pointermove', handlePointerMove)
        viewport.addEventListener('pointerup', finishGesture)
        viewport.addEventListener('pointercancel', handlePointerCancel)
        return () => {
            viewport.removeEventListener('pointerdown', handlePointerDown)
            viewport.removeEventListener('pointermove', handlePointerMove)
            viewport.removeEventListener('pointerup', finishGesture)
            viewport.removeEventListener('pointercancel', handlePointerCancel)
            if (dragFrame !== null) window.cancelAnimationFrame(dragFrame)
            if (settleTimer !== null) window.clearTimeout(settleTimer)
        }
    }, [viewportRef, columnRef])
}
