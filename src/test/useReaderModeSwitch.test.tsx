import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RefObject } from 'react'
import type { ContentProvider } from '@/engine/core/contentProvider'
import type { PaginatedReaderHandle } from '@/components/Reader/PaginatedReaderView'
import type { ScrollReaderHandle } from '@/components/Reader/ScrollReaderView'
import { useReaderModeSwitch } from '@/components/Reader/useReaderModeSwitch'
import type { ReaderModePositionSnapshot } from '@/components/Reader/readerModeSwitchPosition'

const provider = {
    getSpineItems: () => [
        { id: 'c0', href: 'c0.xhtml' },
        { id: 'c1', href: 'c1.xhtml' },
        { id: 'c2', href: 'c2.xhtml' },
    ],
    getSpineIndexByHref: (href: string) => href === 'c1.xhtml' ? 1 : -1,
} as unknown as ContentProvider

function refOf<T>(current: T | null): RefObject<T | null> {
    return { current }
}

describe('useReaderModeSwitch', () => {
    afterEach(() => {
        cleanup()
        vi.clearAllMocks()
    })

    it('切换翻页模式时优先使用当前 reader 暴露的实时位置快照', () => {
        const liveSnapshot: ReaderModePositionSnapshot = {
            chapterProgress: 0.25,
            position: 320,
            sourceMode: 'scrolled-continuous',
            spineIndex: 2,
        }
        const updatePageTurnMode = vi.fn()
        const scrollReaderRef = refOf<ScrollReaderHandle>({
            getPosition: vi.fn(() => liveSnapshot),
            jumpToSpine: vi.fn(),
        })
        const paginatedReaderRef = refOf<PaginatedReaderHandle>(null)
        const { result } = renderHook(() => useReaderModeSwitch({
            bookId: 'book-1',
            currentProgress: 0.5,
            currentSectionHref: 'c1.xhtml',
            effectivePageTurnMode: 'scrolled-continuous',
            isScrollMode: true,
            pageTurnMode: 'scrolled-continuous',
            paginatedInitialSpineIndex: 0,
            paginatedReaderRef,
            provider,
            scrollInitialSpineIndex: 0,
            scrollReaderRef,
            updatePageTurnMode,
        }))

        act(() => {
            result.current.handlePageTurnModeChange('paginated-single')
        })

        expect(updatePageTurnMode).toHaveBeenCalledWith('paginated-single')
        expect(result.current.modeSwitchAnchor).toEqual({
            serial: 1,
            snapshot: liveSnapshot,
        })
    })

    it('相同模式不会生成锚点，也不会重复写设置', () => {
        const updatePageTurnMode = vi.fn()
        const { result } = renderHook(() => useReaderModeSwitch({
            bookId: 'book-1',
            currentProgress: 0.5,
            currentSectionHref: 'c1.xhtml',
            effectivePageTurnMode: 'paginated-single',
            isScrollMode: false,
            pageTurnMode: 'paginated-single',
            paginatedInitialSpineIndex: 0,
            paginatedReaderRef: refOf<PaginatedReaderHandle>(null),
            provider,
            scrollInitialSpineIndex: 0,
            scrollReaderRef: refOf<ScrollReaderHandle>(null),
            updatePageTurnMode,
        }))

        act(() => {
            result.current.handlePageTurnModeChange('paginated-single')
        })

        expect(updatePageTurnMode).not.toHaveBeenCalled()
        expect(result.current.modeSwitchAnchor).toBeNull()
    })

    it('实时快照不可用时用当前目录章节生成兜底位置', () => {
        const updatePageTurnMode = vi.fn()
        const scrollReaderRef = refOf<ScrollReaderHandle>({
            getPosition: vi.fn(() => null),
            jumpToSpine: vi.fn(),
        })
        const { result } = renderHook(() => useReaderModeSwitch({
            bookId: 'book-1',
            currentProgress: 0.5,
            currentSectionHref: 'c1.xhtml',
            effectivePageTurnMode: 'scrolled-continuous',
            isScrollMode: true,
            pageTurnMode: 'scrolled-continuous',
            paginatedInitialSpineIndex: 0,
            paginatedReaderRef: refOf<PaginatedReaderHandle>(null),
            provider,
            scrollInitialSpineIndex: 0,
            scrollReaderRef,
            updatePageTurnMode,
        }))

        act(() => {
            result.current.handlePageTurnModeChange('paginated-single')
        })

        expect(result.current.modeSwitchAnchor?.snapshot).toEqual({
            chapterProgress: 0.5,
            position: 0,
            sourceMode: 'scrolled-continuous',
            spineIndex: 1,
        })
    })
})
