/**
 * 分页横滑翻页手势的纯判定逻辑（无 DOM、无 React），供 usePaginatedSwipeGesture 与测试共用。
 * 阈值来自设计原型 1a：44px 起判 / 横向 > 纵向×1.4 / 页宽 30% 或 0.5px/ms 提交 / 边界阻尼 0.35。
 */

export interface SwipeGestureConfig {
    /** 横向位移超过该值才开始判定翻页意图 */
    readonly horizontalThresholdPx: number
    /** 横向位移须大于纵向位移的该倍数（防斜向误判） */
    readonly horizontalDominanceRatio: number
    /** 松手时位移超过页宽的该比例即提交翻页 */
    readonly commitDistanceRatio: number
    /** 或松手速度超过该值（px/ms）即提交（快扫短距离也能翻） */
    readonly commitVelocityPxPerMs: number
    /** 边界方向（第一页往前/最后一页往后）的位移阻尼系数 */
    readonly edgeDampingFactor: number
    /** 按下后该时长内位移未达意图阈值 → 放弃接管，把事件让给长按选词 */
    readonly longPressMs: number
}

export const DEFAULT_SWIPE_CONFIG: SwipeGestureConfig = {
    horizontalThresholdPx: 44,
    horizontalDominanceRatio: 1.4,
    commitDistanceRatio: 0.3,
    commitVelocityPxPerMs: 0.5,
    edgeDampingFactor: 0.35,
    longPressMs: 400,
}

/** undecided = 还没超过起判阈值；horizontal = 认定翻页；rejected = 纵向/斜向占优，本次触摸放弃 */
export type SwipeIntent = 'undecided' | 'horizontal' | 'rejected'

export function resolveSwipeIntent(
    deltaX: number,
    deltaY: number,
    config: SwipeGestureConfig = DEFAULT_SWIPE_CONFIG,
): SwipeIntent {
    if (Math.abs(deltaX) <= config.horizontalThresholdPx) {
        // 未达横向阈值前若纵向已明显占优，直接拒绝——不然纵向长滑到 44px 横向漂移也会被接管
        if (Math.abs(deltaY) > config.horizontalThresholdPx && Math.abs(deltaY) > Math.abs(deltaX)) {
            return 'rejected'
        }
        return 'undecided'
    }
    return Math.abs(deltaX) > Math.abs(deltaY) * config.horizontalDominanceRatio ? 'horizontal' : 'rejected'
}

export function shouldCommitSwipe(
    deltaX: number,
    pageWidthPx: number,
    velocityPxPerMs: number,
    config: SwipeGestureConfig = DEFAULT_SWIPE_CONFIG,
): boolean {
    if (pageWidthPx <= 0) return false
    if (Math.abs(deltaX) > pageWidthPx * config.commitDistanceRatio) return true
    return Math.abs(velocityPxPerMs) > config.commitVelocityPxPerMs
}

/**
 * 跟手位移：往边界外拖（第一页往前 / 最后一页往后）乘阻尼，
 * 拖得动但拖不远，肌肉记忆能感知"到头了"。
 */
export function resolveDragOffset(
    deltaX: number,
    canGoPrev: boolean,
    canGoNext: boolean,
    config: SwipeGestureConfig = DEFAULT_SWIPE_CONFIG,
): number {
    const blocked = (deltaX > 0 && !canGoPrev) || (deltaX < 0 && !canGoNext)
    return blocked ? deltaX * config.edgeDampingFactor : deltaX
}
