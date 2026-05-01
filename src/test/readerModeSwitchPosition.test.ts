import { describe, expect, it } from 'vitest'
import type { ContentProvider } from '@/engine/core/contentProvider'
import {
    createFallbackModePositionSnapshot,
    resolvePageChapterProgress,
    resolvePaginatedInitialPage,
    resolveProgressInChapter,
    resolveScrollInitialOffset,
} from '@/components/Reader/readerModeSwitchPosition'

describe('readerModeSwitchPosition', () => {
    it('计算分页章节内进度', () => {
        expect(resolvePageChapterProgress(2, 5)).toBe(0.5)
        expect(resolvePageChapterProgress(99, 5)).toBe(1)
    })

    it('从全书进度还原章节内进度', () => {
        expect(resolveProgressInChapter(0.35, 3, 10)).toBeCloseTo(0.5)
    })

    it('分页初始页面优先使用章节内进度', () => {
        expect(resolvePaginatedInitialPage({
            initialPage: 0,
            initialChapterProgress: 0.5,
            totalPages: 9,
        })).toBe(4)
    })

    it('没有章节内进度时夹紧初始页码', () => {
        expect(resolvePaginatedInitialPage({
            initialPage: 99,
            totalPages: 6,
        })).toBe(5)
    })

    it('滚动初始偏移优先使用精确 scrollTop', () => {
        expect(resolveScrollInitialOffset({
            chapterHeight: 2000,
            chapterTop: 100,
            initialChapterProgress: 0.5,
            initialScrollOffset: 321,
            viewportHeight: 800,
        })).toBe(321)
    })

    it('没有精确 scrollTop 时用章节内进度估算滚动位置', () => {
        expect(resolveScrollInitialOffset({
            chapterHeight: 2000,
            chapterTop: 100,
            initialChapterProgress: 0.5,
            initialScrollOffset: 0,
            viewportHeight: 800,
        })).toBe(700)
    })

    it('根据当前章节 href 生成兜底快照', () => {
        const provider = {
            getSpineItems: () => [
                { id: 'c0', href: 'c0.xhtml' },
                { id: 'c1', href: 'c1.xhtml' },
                { id: 'c2', href: 'c2.xhtml' },
            ],
            getSpineIndexByHref: (href: string) => href === 'c1.xhtml' ? 1 : -1,
        }

        expect(createFallbackModePositionSnapshot({
            currentProgress: 0.5,
            currentSectionHref: 'c1.xhtml',
            fallbackSpineIndex: 0,
            provider: provider as unknown as ContentProvider,
            sourceMode: 'scrolled-continuous',
        })).toEqual({
            sourceMode: 'scrolled-continuous',
            spineIndex: 1,
            position: 0,
            chapterProgress: 0.5,
        })
    })
})
