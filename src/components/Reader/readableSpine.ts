import type { SpineItemInfo } from '@/engine/core/contentProvider'

/**
 * 阅读流的"可停留性"判定（Phase：书内目录页跳过）。
 *
 * 只跳 EPUB3 目录文档（isNavDoc），不动 linear 语义：linear="no" 的辅助页
 * （封面/版权等）现状就在阅读流里，本段不改它们的行为，避免影响面扩散。
 * nav 项保留在 spine 里占位——进度/CFI/内链跳转都以 spine 序号为货币，
 * 剔除会让已存进度整体漂移，所以是"永不停留"而不是"从列表删掉"。
 */
export function isReadableSpineItem(item: SpineItemInfo): boolean {
    return item.isNavDoc !== true
}

function clampSpineIndex(spineItems: readonly SpineItemInfo[], index: number): number {
    return Math.max(0, Math.min(spineItems.length - 1, Math.floor(index)))
}

/**
 * 从 targetIndex 出发按 direction 找最近可停留项；目标方向找不到就反向兜底。
 * 全 spine 都不可停留（病态书）时返回 clamp 后的 targetIndex——宁可显示目录页
 * 也不能无页可显。
 */
export function resolveReadableSpineIndex(
    spineItems: readonly SpineItemInfo[],
    targetIndex: number,
    direction: 1 | -1,
): number {
    if (spineItems.length === 0) return 0
    const clamped = clampSpineIndex(spineItems, targetIndex)

    for (let i = clamped; i >= 0 && i < spineItems.length; i += direction) {
        const item = spineItems[i]
        if (item && isReadableSpineItem(item)) return i
    }
    for (let i = clamped; i >= 0 && i < spineItems.length; i -= direction) {
        const item = spineItems[i]
        if (item && isReadableSpineItem(item)) return i
    }
    return clamped
}

/**
 * 打开书/恢复进度时的落点修正：落在目录页上就向后找第一个正文项。
 * 章内位置（页码/滚动偏移）属于原落点，换章后必须清零——带着旧 position
 * 跳到别的章会定位到无意义的位置。
 */
export function snapLocationToReadable(
    spineItems: readonly SpineItemInfo[],
    location: { spineIndex: number; position: number },
): { spineIndex: number; position: number } {
    if (spineItems.length === 0) return { spineIndex: 0, position: 0 }
    const clamped = clampSpineIndex(spineItems, location.spineIndex)
    const snapped = resolveReadableSpineIndex(spineItems, clamped, 1)
    if (snapped === clamped) return { spineIndex: clamped, position: location.position }
    return { spineIndex: snapped, position: 0 }
}
