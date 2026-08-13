import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ReaderToast, emitReaderToast } from '@/components/Reader/ReaderToast'

describe('ReaderToast', () => {
    beforeEach(() => {
        vi.useFakeTimers()
    })

    afterEach(() => {
        cleanup()
        vi.useRealTimers()
    })

    it('事件触发显示，2 秒后自动消失', () => {
        render(<ReaderToast />)
        expect(screen.queryByRole('status')).not.toBeInTheDocument()

        act(() => {
            emitReaderToast('书签功能即将上线')
        })
        expect(screen.getByRole('status')).toHaveTextContent('书签功能即将上线')

        act(() => {
            vi.advanceTimersByTime(2100)
        })
        expect(screen.queryByRole('status')).not.toBeInTheDocument()
    })

    it('连续两条消息重置消失计时', () => {
        render(<ReaderToast />)

        act(() => {
            emitReaderToast('第一条')
        })
        act(() => {
            vi.advanceTimersByTime(1500)
        })
        act(() => {
            emitReaderToast('第二条')
        })
        // 第一条的 1.5s 已过，但第二条重开 2s 窗口
        act(() => {
            vi.advanceTimersByTime(1000)
        })
        expect(screen.getByRole('status')).toHaveTextContent('第二条')

        act(() => {
            vi.advanceTimersByTime(1100)
        })
        expect(screen.queryByRole('status')).not.toBeInTheDocument()
    })

    it('空消息与非法 detail 不显示', () => {
        render(<ReaderToast />)

        act(() => {
            emitReaderToast('')
            window.dispatchEvent(new CustomEvent('reader:toast', { detail: { message: 42 } }))
            window.dispatchEvent(new CustomEvent('reader:toast'))
        })
        expect(screen.queryByRole('status')).not.toBeInTheDocument()
    })
})
