import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useVirtualChapterRuntime, type VirtualChapterRuntime } from '@/components/Reader/scrollReader/useVirtualChapterRuntime'
import type { ChapterMetaVector } from '@/engine/types/vectorRender'

function createRuntime(vector: ChapterMetaVector): VirtualChapterRuntime {
    const chapterEl = document.createElement('section')
    const contentEl = document.createElement('div')
    chapterEl.appendChild(contentEl)
    return {
        chapterId: vector.chapterId,
        spineIndex: vector.spineIndex,
        chapterEl,
        contentEl,
        vector,
        activeSegmentEls: new Map(),
    }
}

describe('useVirtualChapterRuntime', () => {
    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('越界 segmentIndex 只记录警告并跳过挂载', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const { result } = renderHook(() => useVirtualChapterRuntime({
            observeResizeNode: vi.fn(),
            unobserveResizeNode: vi.fn(),
        }))
        const runtime = createRuntime({
            chapterId: 'ch-1',
            spineIndex: 1,
            segments: [],
            totalEstimatedHeight: 0,
            totalMeasuredHeight: 0,
            fullyMeasured: false,
        })

        act(() => {
            result.current.mountVirtualSegment(runtime, 999)
        })

        expect(runtime.activeSegmentEls.size).toBe(0)
        expect(warnSpy).toHaveBeenCalledWith(
            '[VirtualChapterRuntime] segmentIndex=999 越界，segments.length=0',
        )
    })
})
