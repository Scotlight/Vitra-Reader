import { describe, expect, it } from 'vitest'
import { resolveInitialSectionHref } from '@/components/Reader/readerBookSessionLoader'
import type { SpineItemInfo } from '@/engine/core/contentProvider'

const spineItems: SpineItemInfo[] = [
    { index: 0, href: 'intro.xhtml', id: 'intro', linear: true },
    { index: 1, href: 'chapter-1.xhtml', id: 'chapter-1', linear: true },
    { index: 2, href: 'chapter-2.xhtml', id: 'chapter-2', linear: true },
]

const provider = {
    getSpineItems: () => spineItems,
}

describe('readerBookSessionLoader', () => {
    it('根据恢复位置的 spineIndex 推导初始目录章节 href', () => {
        expect(resolveInitialSectionHref(provider, 1)).toBe('chapter-1.xhtml')
    })

    it('spineIndex 越界时夹到有效章节，空 spine 返回空字符串', () => {
        expect(resolveInitialSectionHref(provider, 99)).toBe('chapter-2.xhtml')
        expect(resolveInitialSectionHref({ getSpineItems: () => [] }, 1)).toBe('')
    })
})
