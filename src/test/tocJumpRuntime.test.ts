import { afterEach, describe, expect, it, vi } from 'vitest'
import {
    commitTocJumpTarget,
    prepareTocJumpRuntime,
} from '@/components/Reader/scrollReader/tocJumpRuntime'
import type { SpineItemInfo } from '@/engine/core/contentProvider'

describe('tocJumpRuntime', () => {
    afterEach(() => {
        vi.useRealTimers()
    })

    it('准备跳转时停止惯性、取消预取并清理定时器', () => {
        vi.useFakeTimers()
        const scrollIdleTimer = window.setTimeout(() => undefined, 100)
        const progressTimer = window.setTimeout(() => undefined, 200)
        const cancelIdlePrefetch = vi.fn()
        const stop = vi.fn()
        const refs = {
            isUserScrollingRef: { current: true },
            scrollIdleTimerRef: { current: scrollIdleTimer as number | null },
            pendingSearchTextRef: { current: null as string | null },
            initialScrollDone: { current: false },
            progressTimerRef: { current: progressTimer as number | null },
        }

        prepareTocJumpRuntime({
            searchText: 'target',
            cancelIdlePrefetch,
            stop,
            ...refs,
        })

        expect(cancelIdlePrefetch).toHaveBeenCalledTimes(1)
        expect(stop).toHaveBeenCalledTimes(1)
        expect(refs.isUserScrollingRef.current).toBe(false)
        expect(refs.scrollIdleTimerRef.current).toBeNull()
        expect(refs.progressTimerRef.current).toBeNull()
        expect(refs.pendingSearchTextRef.current).toBe('target')
        expect(refs.initialScrollDone.current).toBe(true)
    })

    it('空搜索文本会清空 pendingSearchText', () => {
        const refs = {
            isUserScrollingRef: { current: true },
            scrollIdleTimerRef: { current: null as number | null },
            pendingSearchTextRef: { current: 'old' as string | null },
            initialScrollDone: { current: false },
            progressTimerRef: { current: null as number | null },
        }

        prepareTocJumpRuntime({
            cancelIdlePrefetch: vi.fn(),
            stop: vi.fn(),
            ...refs,
        })

        expect(refs.pendingSearchTextRef.current).toBeNull()
    })

    it('提交跳转目标时同步当前章节与章节变更回调', () => {
        const setCurrentSpineIndex = vi.fn()
        const onChapterChange = vi.fn()
        const spineItems: SpineItemInfo[] = [
            { index: 0, href: 'a.xhtml', id: 'a', linear: true },
            { index: 1, href: 'b.xhtml', id: 'b', linear: true },
        ]
        const lastKnownAnchorIndexRef = { current: 0 }

        commitTocJumpTarget({
            targetSpineIndex: 1,
            spineItemsRef: { current: spineItems },
            lastKnownAnchorIndexRef,
            setCurrentSpineIndex,
            onChapterChange,
        })

        expect(setCurrentSpineIndex).toHaveBeenCalledWith(1)
        expect(lastKnownAnchorIndexRef.current).toBe(1)
        expect(onChapterChange).toHaveBeenCalledWith('b', 'b.xhtml')
    })

    it('目标 spine 不存在时不触发章节变更回调', () => {
        const onChapterChange = vi.fn()

        commitTocJumpTarget({
            targetSpineIndex: 4,
            spineItemsRef: { current: [] },
            lastKnownAnchorIndexRef: { current: 0 },
            setCurrentSpineIndex: vi.fn(),
            onChapterChange,
        })

        expect(onChapterChange).not.toHaveBeenCalled()
    })
})
