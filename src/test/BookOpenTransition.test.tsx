import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, act, cleanup } from '@testing-library/react'
import {
    BookOpenTransition,
    emitBookOpen,
    emitBookClose,
    emitReaderReady,
} from '@/components/Library/BookOpenTransition'

// matchMedia mock：默认走手机端，让组件渲染
const createMatchMedia = (matches: boolean) => (query: string) => ({
    matches,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    onchange: null,
    dispatchEvent: vi.fn(),
})

const sampleRect = { top: 100, left: 50, width: 120, height: 160 }
const sampleCover = 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='

describe('BookOpenTransition', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        window.matchMedia = createMatchMedia(true) as never
    })

    afterEach(() => {
        cleanup()
        vi.useRealTimers()
    })

    it('手机端 idle 状态不渲染', () => {
        const { container } = render(<BookOpenTransition />)
        expect(container.firstChild).toBeNull()
    })

    it('桌面端（非窄屏）忽略 book:open 事件', () => {
        window.matchMedia = createMatchMedia(false) as never
        const { container } = render(<BookOpenTransition />)
        act(() => {
            emitBookOpen({ bookId: 'b1', cover: sampleCover, cardRect: sampleRect })
        })
        expect(container.firstChild).toBeNull()
    })

    it('book:open → entering → holding → reader:ready → exiting → idle', () => {
        const { container } = render(<BookOpenTransition />)

        act(() => {
            emitBookOpen({ bookId: 'b1', cover: sampleCover, cardRect: sampleRect })
        })
        // 进入 entering，overlay 已挂载
        expect(container.querySelector('[data-book-open-transition]')).not.toBeNull()
        expect(container.querySelector('[data-book-open-transition]')?.getAttribute('data-book-open-transition')).toBe('entering')

        // entering 380ms 后 → holding
        act(() => { vi.advanceTimersByTime(400) })
        expect(container.querySelector('[data-book-open-transition]')?.getAttribute('data-book-open-transition')).toBe('holding')

        // ready 事件 → MIN_HOLD 200ms 后 → exiting
        act(() => { emitReaderReady('b1') })
        act(() => { vi.advanceTimersByTime(250) })
        expect(container.querySelector('[data-book-open-transition]')?.getAttribute('data-book-open-transition')).toBe('exiting')

        // exiting 280ms 后 → idle，组件卸载
        act(() => { vi.advanceTimersByTime(300) })
        expect(container.firstChild).toBeNull()
    })

    it('book:close 触发 returning 阶段，结束后回到 idle', () => {
        const { container } = render(<BookOpenTransition />)
        act(() => {
            emitBookOpen({ bookId: 'b1', cover: sampleCover, cardRect: sampleRect })
        })
        act(() => { vi.advanceTimersByTime(400) }) // entering → holding
        act(() => { emitReaderReady('b1') })
        act(() => { vi.advanceTimersByTime(100) }) // 还没 exiting
        act(() => {
            emitBookClose({ bookId: 'b1', cardRect: sampleRect })
        })
        expect(container.querySelector('[data-book-open-transition]')?.getAttribute('data-book-open-transition')).toBe('returning')
        act(() => { vi.advanceTimersByTime(400) })
        expect(container.firstChild).toBeNull()
    })

    it('reader:ready 的 bookId 不匹配时不推进状态', () => {
        const { container } = render(<BookOpenTransition />)
        act(() => {
            emitBookOpen({ bookId: 'b1', cover: sampleCover, cardRect: sampleRect })
        })
        act(() => { vi.advanceTimersByTime(400) }) // entering → holding
        act(() => { emitReaderReady('other-book') })
        // 应该还在 holding
        expect(container.querySelector('[data-book-open-transition]')?.getAttribute('data-book-open-transition')).toBe('holding')
    })
})
