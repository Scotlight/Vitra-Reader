import { describe, expect, it } from 'vitest'
import type { SpineItemInfo } from '@/engine/core/contentProvider'
import {
    isReadableSpineItem,
    resolveReadableSpineIndex,
    snapLocationToReadable,
} from '@/components/Reader/readableSpine'

function spine(index: number, overrides: Partial<SpineItemInfo> = {}): SpineItemInfo {
    return { index, href: `ch_${index}.xhtml`, id: `id-${index}`, linear: true, ...overrides }
}

describe('readableSpine', () => {
    // 典型网文结构：spine[0] 是 nav 目录文档
    const navFirst: SpineItemInfo[] = [
        spine(0, { isNavDoc: true }),
        spine(1),
        spine(2),
        spine(3),
    ]

    describe('isReadableSpineItem', () => {
        it('nav 文档不可停留，普通项可停留', () => {
            expect(isReadableSpineItem(spine(0, { isNavDoc: true }))).toBe(false)
            expect(isReadableSpineItem(spine(0))).toBe(true)
        })

        it('linear=false 本段不改变行为（仍可停留）', () => {
            expect(isReadableSpineItem(spine(0, { linear: false }))).toBe(true)
        })
    })

    describe('resolveReadableSpineIndex', () => {
        it('落点是 nav 时向前找第一个正文项', () => {
            expect(resolveReadableSpineIndex(navFirst, 0, 1)).toBe(1)
        })

        it('第一个正文项按上一章：反向无可停留项时兜底回自身', () => {
            // 目标 index 0 是 nav，向后（-1）找不到 → 反向兜底找到 1
            expect(resolveReadableSpineIndex(navFirst, 0, -1)).toBe(1)
        })

        it('nav 在中间时下一章直接越过', () => {
            const midNav = [spine(0), spine(1, { isNavDoc: true }), spine(2)]
            expect(resolveReadableSpineIndex(midNav, 1, 1)).toBe(2)
            expect(resolveReadableSpineIndex(midNav, 1, -1)).toBe(0)
        })

        it('越界目标先 clamp 再解析', () => {
            expect(resolveReadableSpineIndex(navFirst, 99, 1)).toBe(3)
            expect(resolveReadableSpineIndex(navFirst, -5, 1)).toBe(1)
        })

        it('全 spine 都是 nav 的病态书返回 clamp 后的原目标', () => {
            const allNav = [spine(0, { isNavDoc: true }), spine(1, { isNavDoc: true })]
            expect(resolveReadableSpineIndex(allNav, 1, 1)).toBe(1)
        })

        it('空 spine 返回 0', () => {
            expect(resolveReadableSpineIndex([], 3, 1)).toBe(0)
        })
    })

    describe('snapLocationToReadable', () => {
        it('落在 nav 上：前进到正文且章内位置清零', () => {
            expect(snapLocationToReadable(navFirst, { spineIndex: 0, position: 7 }))
                .toEqual({ spineIndex: 1, position: 0 })
        })

        it('落在正文上：原样保留章内位置', () => {
            expect(snapLocationToReadable(navFirst, { spineIndex: 2, position: 5 }))
                .toEqual({ spineIndex: 2, position: 5 })
        })

        it('无进度从头开：起点自动滑过 nav', () => {
            expect(snapLocationToReadable(navFirst, { spineIndex: 0, position: 0 }))
                .toEqual({ spineIndex: 1, position: 0 })
        })

        it('空 spine 返回零位', () => {
            expect(snapLocationToReadable([], { spineIndex: 4, position: 9 }))
                .toEqual({ spineIndex: 0, position: 0 })
        })
    })
})
