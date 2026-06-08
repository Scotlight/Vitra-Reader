import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { contrastRatio } from '@/components/Reader/readerTheme'
import { resolveReaderColors } from '@/components/Reader/readerColors'
import { buildReaderStyleConfig } from '@/components/Reader/readerStyleConfig'
import {
    normalizeScrollDirection,
    resolveScrollPreloadRequest,
} from '@/components/Reader/scrollReader/scrollPreloadTarget'
import {
    applyPendingVirtualHeightUpdates,
    recordPendingSegmentHeightUpdate,
    resolveSegmentResizeTarget,
} from '@/components/Reader/scrollReader/virtualHeightCommitState'
import { scheduleAtomicScrollAdjustmentFlush } from '@/components/Reader/scrollReader/atomicScrollAdjustment'
import type { LoadedChapter } from '@/components/Reader/scrollReader/scrollReaderTypes'
import type { ChapterMetaVector, SegmentMeta } from '@/engine/types/vectorRender'

function chapter(spineIndex: number, status: LoadedChapter['status'] = 'mounted'): LoadedChapter {
    return {
        spineIndex,
        id: `ch-${spineIndex}`,
        htmlContent: '',
        htmlFragments: [],
        externalStyles: [],
        domNode: null,
        height: 100,
        status,
    }
}

function segment(index: number, estimatedHeight: number): SegmentMeta {
    return {
        index,
        charCount: 100,
        estimatedHeight,
        realHeight: null,
        offsetY: 0,
        measured: false,
        htmlContent: `<p>${index}</p>`,
        hasMedia: false,
    }
}

function vector(chapterId: string, spineIndex: number): ChapterMetaVector {
    return {
        chapterId,
        spineIndex,
        segments: [segment(0, 100), segment(1, 120)],
        totalEstimatedHeight: 220,
        totalMeasuredHeight: 220,
        fullyMeasured: false,
    }
}

describe('readerTheme / readerColors', () => {
    it('contrastRatio 计算黑白高对比度并容错非法颜色', () => {
        expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1)
        expect(contrastRatio('not-a-color', '#ffffff')).toBe(21)
    })

    it('resolveReaderColors 使用主题默认色并在低对比背景上回退文本色', () => {
        expect(resolveReaderColors({ themeId: 'dark' })).toEqual({
            textColor: '#e0e0e0',
            bgColor: '#16213e',
        })

        expect(resolveReaderColors({
            themeId: 'sepia',
            customBgColor: '#5b4636',
        })).toEqual({
            textColor: '#1a1a1a',
            bgColor: '#5b4636',
        })
    })

    it('resolveReaderColors 尊重用户自定义文本色', () => {
        expect(resolveReaderColors({
            themeId: 'sepia',
            customTextColor: '#123456',
            customBgColor: '#abcdef',
        })).toEqual({
            textColor: '#123456',
            bgColor: '#abcdef',
        })
    })
})

describe('buildReaderStyleConfig', () => {
    it('把设置和颜色归一化为 ShadowRenderer 样式契约', () => {
        const config = buildReaderStyleConfig(
            {
                fontSize: 18,
                letterSpacing: 1,
                lineHeight: 1.8,
                pageWidth: 720,
                paragraphIndentEnabled: true,
                paragraphSpacing: 12,
                textAlign: 'justify',
                themeId: 'dark',
            },
            { textColor: '#eeeeee', bgColor: '#111111' },
            '"Noto Serif", serif',
            'pdf',
        )

        expect(config).toMatchObject({
            textColor: '#eeeeee',
            bgColor: '#111111',
            fontSize: 18,
            fontFamily: '"Noto Serif", serif',
            lineHeight: 1.8,
            paragraphSpacing: 12,
            textIndentEm: 2,
            letterSpacing: 1,
            textAlign: 'justify',
            pageWidth: 720,
            isPdfDarkMode: true,
        })
    })

    it('非缩进或非 PDF dark 时关闭对应派生标志', () => {
        const config = buildReaderStyleConfig(
            {
                fontSize: 16,
                letterSpacing: 0,
                lineHeight: 1.6,
                pageWidth: 640,
                paragraphIndentEnabled: false,
                paragraphSpacing: 8,
                textAlign: 'left',
                themeId: 'light',
            },
            { textColor: '#111111', bgColor: '#ffffff' },
            'system-ui',
            'epub',
        )

        expect(config.textIndentEm).toBe(0)
        expect(config.isPdfDarkMode).toBe(false)
    })
})

describe('scrollPreloadTarget', () => {
    it('normalizeScrollDirection 把小于阈值的滚动视为 none', () => {
        expect(normalizeScrollDirection('down', 100.2, 100)).toBe('none')
        expect(normalizeScrollDirection('up', 101, 100)).toBe('up')
    })

    it('resolveScrollPreloadRequest 在没有 mounted 章节时请求预测预取', () => {
        expect(resolveScrollPreloadRequest([chapter(1, 'loading')], 'down', 3)).toEqual({
            kind: 'predictive',
        })
    })

    it('resolveScrollPreloadRequest 按滚动方向请求相邻章节', () => {
        const chapters = [chapter(3), chapter(2), chapter(1, 'ready')]

        expect(resolveScrollPreloadRequest(chapters, 'up', 5)).toEqual({
            kind: 'chapter',
            spineIndex: 1,
            loadKind: 'prev',
        })
        expect(resolveScrollPreloadRequest(chapters, 'down', 5)).toEqual({
            kind: 'chapter',
            spineIndex: 4,
            loadKind: 'next',
        })
    })

    it('resolveScrollPreloadRequest 到达边界或 none 方向时不请求', () => {
        expect(resolveScrollPreloadRequest([chapter(0)], 'up', 2)).toBeNull()
        expect(resolveScrollPreloadRequest([chapter(1)], 'down', 2)).toBeNull()
        expect(resolveScrollPreloadRequest([chapter(0)], 'none', 2)).toBeNull()
    })
})

describe('virtualHeightCommitState', () => {
    beforeEach(() => {
        document.body.innerHTML = ''
    })

    it('resolveSegmentResizeTarget 从 segment 元素解析章节和段索引', () => {
        const chapterEl = document.createElement('section')
        chapterEl.setAttribute('data-chapter-id', 'ch-7')
        const segmentEl = document.createElement('div')
        segmentEl.setAttribute('data-shadow-segment-index', '3')
        chapterEl.appendChild(segmentEl)
        document.body.appendChild(chapterEl)

        expect(resolveSegmentResizeTarget(segmentEl)).toEqual({
            chapterId: 'ch-7',
            segmentIndex: 3,
        })
    })

    it('resolveSegmentResizeTarget 拒绝缺失或非法索引', () => {
        const el = document.createElement('div')
        expect(resolveSegmentResizeTarget(el)).toBeNull()
        el.setAttribute('data-shadow-segment-index', '-1')
        expect(resolveSegmentResizeTarget(el)).toBeNull()
    })

    it('recordPendingSegmentHeightUpdate 按章节聚合待提交高度', () => {
        const pending = new Map<string, Map<number, number>>()

        recordPendingSegmentHeightUpdate(pending, 'ch-1', 0, 140)
        recordPendingSegmentHeightUpdate(pending, 'ch-1', 1, 160)

        expect(pending.get('ch-1')?.get(0)).toBe(140)
        expect(pending.get('ch-1')?.get(1)).toBe(160)
    })

    it('applyPendingVirtualHeightUpdates 更新 vector 并累计锚点上方高度差', () => {
        const pending = new Map<string, Map<number, number>>([
            ['before', new Map([[0, 150]])],
            ['after', new Map([[1, 90]])],
        ])
        const beforeVector = vector('before', 0)
        const afterVector = vector('after', 2)
        const beforeRuntime = { spineIndex: 0 } as Parameters<typeof applyPendingVirtualHeightUpdates>[0]['virtualChapters'] extends Map<string, infer T> ? T : never
        const afterRuntime = { spineIndex: 2 } as typeof beforeRuntime
        const refreshVirtualChapterLayout = vi.fn()

        const delta = applyPendingVirtualHeightUpdates({
            pending,
            chapterVectors: new Map([
                ['before', beforeVector],
                ['after', afterVector],
            ]),
            virtualChapters: new Map([
                ['before', beforeRuntime],
                ['after', afterRuntime],
            ]),
            anchorIndex: 1,
            refreshVirtualChapterLayout,
        })

        expect(delta).toBe(50)
        expect(beforeVector.segments[0]?.realHeight).toBe(150)
        expect(afterVector.segments[1]?.realHeight).toBe(90)
        expect(refreshVirtualChapterLayout).toHaveBeenCalledTimes(2)
    })
})

describe('atomicScrollAdjustment', () => {
    const originalRequestAnimationFrame = globalThis.requestAnimationFrame
    const originalCancelAnimationFrame = globalThis.cancelAnimationFrame
    let rafCallbacks: FrameRequestCallback[]
    let nextRafId: number

    beforeEach(() => {
        rafCallbacks = []
        nextRafId = 1
        globalThis.requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
            rafCallbacks.push(callback)
            return nextRafId++
        })
        globalThis.cancelAnimationFrame = vi.fn()
    })

    afterEach(() => {
        globalThis.requestAnimationFrame = originalRequestAnimationFrame
        globalThis.cancelAnimationFrame = originalCancelAnimationFrame
    })

    function flushNextFrame(): void {
        const callback = rafCallbacks.shift()
        expect(callback).toBeDefined()
        callback!(performance.now())
    }

    it('scheduleAtomicScrollAdjustmentFlush 合并 pending delta 并双 RAF 解锁', () => {
        const viewport = document.createElement('div')
        viewport.scrollTop = 100
        const scrollTo = vi.fn((options?: ScrollToOptions | number, y?: number) => {
            if (typeof options === 'number') {
                viewport.scrollTop = y ?? viewport.scrollTop
                return
            }
            viewport.scrollTop = options?.top ?? viewport.scrollTop
        })
        viewport.scrollTo = scrollTo as typeof viewport.scrollTo
        const refs = {
            viewportRef: { current: viewport },
            flushRafRef: { current: null as number | null },
            pendingDeltaRef: { current: 25 },
            ignoreScrollEventRef: { current: false },
            unlockAdjustingRafRef: { current: null as number | null },
        }

        scheduleAtomicScrollAdjustmentFlush(refs)
        scheduleAtomicScrollAdjustmentFlush(refs)
        expect(globalThis.requestAnimationFrame).toHaveBeenCalledTimes(1)

        flushNextFrame()
        expect(scrollTo).toHaveBeenCalledWith({ top: 125, behavior: 'auto' })
        expect(refs.pendingDeltaRef.current).toBe(0)
        expect(refs.ignoreScrollEventRef.current).toBe(true)

        flushNextFrame()
        flushNextFrame()
        expect(refs.unlockAdjustingRafRef.current).toBeNull()
        expect(refs.ignoreScrollEventRef.current).toBe(false)
    })

    it('scheduleAtomicScrollAdjustmentFlush 在无 viewport 或 delta 太小时清空待调整量', () => {
        const refs = {
            viewportRef: { current: null as HTMLElement | null },
            flushRafRef: { current: null as number | null },
            pendingDeltaRef: { current: 10 },
            ignoreScrollEventRef: { current: false },
            unlockAdjustingRafRef: { current: null as number | null },
        }

        scheduleAtomicScrollAdjustmentFlush(refs)
        flushNextFrame()
        expect(refs.pendingDeltaRef.current).toBe(0)

        const viewport = document.createElement('div')
        viewport.scrollTo = vi.fn()
        refs.viewportRef.current = viewport
        refs.pendingDeltaRef.current = 0.05
        scheduleAtomicScrollAdjustmentFlush(refs)
        flushNextFrame()
        expect(viewport.scrollTo).not.toHaveBeenCalled()
        expect(refs.pendingDeltaRef.current).toBe(0)
    })
})
