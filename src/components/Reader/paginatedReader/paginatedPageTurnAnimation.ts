import type { PageTurnAnimation } from '@/stores/useSettingsStore'
import { formatPaginatedTranslateX } from './paginatedPageLayoutMath'

/** 页级翻页动画类型，统一复用 settings 的 PageTurnAnimation，避免多处内联联合类型漂移 */
export type PaginatedPageTurnAnimation = PageTurnAnimation

/** slide 翻页时长（ms），与 CSS 中 .columnContainer 的 transform transition 保持一致 */
export const PAGE_TURN_SLIDE_MS = 280

/** fade 翻页时长（ms），JS 内联 opacity transition 使用 */
export const PAGE_TURN_FADE_MS = 170

/**
 * realistic 半翻时长（ms）。原型的 520ms 是"双页叠放转满 -168°"的架构；
 * 本引擎是单容器分页（同一时刻只有一份内容），用"半翻提交"戏法：
 * 旧页掀到 -88° → 提交新页平铺（前进），或新页从 -88° 盖回 0°（后退）。
 * 只播半程，时长相应减半量级。
 */
export const PAGE_TURN_REALISTIC_MS = 320

/** 翻页方向：前进（下一页）/ 后退（上一页） */
export type PageTurnDirection = 'forward' | 'backward'

/**
 * 由 from→to 推导翻页方向。delta 为 0（页码未变，可能是重排对齐）时按前进处理，
 * 调用方据此决定是否启动动画——真正的"无翻页"由调用方在 delta===0 时直接瞬时返回。
 */
export function resolvePageTurnDirection(fromPage: number, toPage: number): PageTurnDirection {
    return toPage < fromPage ? 'backward' : 'forward'
}

/**
 * slide 起始位移：容器先钉在"即将离开的旧页"（fromPage），
 * 待下一帧恢复 transition 后由 CSS 把 translateX 带到 toPage。
 * 前进时新页自右进入、旧页左移；后退对称——方向感来自 from→to 的位移差，
 * 起始帧恒为旧页，无需按方向再加减（那样会让起始帧与目标帧重合、动画失效）。
 */
export function formatSlideStartTransform(fromPage: number, pageWidth: number): string {
    return formatPaginatedTranslateX(fromPage, pageWidth)
}

/**
 * realistic 翻转帧：分页定位（translateX）与绕轴旋转（rotateY）必须合成同一个
 * transform——分开写会互相覆盖，容器瞬移回第 0 页。
 * 角度封顶调用方自律在 (-90, 0]：越过 -90° 会露出内容镜像背面。
 */
export function formatRealisticFlipTransform(page: number, pageWidth: number, angleDeg: number): string {
    const offset = Math.max(0, Math.floor(page)) * Math.max(0, pageWidth)
    return `translateX(${-offset}px) rotateY(${angleDeg}deg)`
}

/**
 * realistic 旋转轴：视口左缘在容器本地坐标系里的 x（transform-origin 不吃 transform
 * 影响，所以是"页码 × 页宽"而不是 0）。
 */
export function resolveRealisticFlipOrigin(page: number, pageWidth: number): string {
    return `${Math.max(0, Math.floor(page)) * Math.max(0, pageWidth)}px 50%`
}

