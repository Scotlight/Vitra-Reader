import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { centerActiveTocItem, scheduleCenterActiveToc } from '@/components/Reader/tocAutoScroll'

// 用 dataset 驱动 getBoundingClientRect：data-rect-top / data-rect-height 决定几何
function installRectMock(): () => void {
    const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'getBoundingClientRect')
    Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
        configurable: true,
        value(this: HTMLElement): DOMRect {
            const top = Number(this.dataset.rectTop ?? '0')
            const height = Number(this.dataset.rectHeight ?? '0')
            return {
                top, height, bottom: top + height, left: 0, right: 0, width: 0, x: 0, y: top,
                toJSON() { /* noop */ },
            } as DOMRect
        },
    })
    return () => {
        if (original) Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', original)
    }
}

interface BuildOptions {
    containerHeight: number
    scrollTop?: number
    activeTop?: number
    activeHeight?: number
    withActive?: boolean
}

function buildContainer(opts: BuildOptions): { container: HTMLDivElement; scrollTo: ReturnType<typeof vi.fn> } {
    const container = document.createElement('div')
    container.dataset.rectTop = '0'
    container.dataset.rectHeight = String(opts.containerHeight)
    container.scrollTop = opts.scrollTop ?? 0
    const scrollTo = vi.fn()
    container.scrollTo = scrollTo as unknown as typeof container.scrollTo

    const plain = document.createElement('button')
    plain.dataset.rectTop = '0'
    plain.dataset.rectHeight = '40'
    container.appendChild(plain)

    if (opts.withActive ?? true) {
        const active = document.createElement('button')
        active.setAttribute('data-toc-active', 'true')
        active.dataset.rectTop = String(opts.activeTop ?? 0)
        active.dataset.rectHeight = String(opts.activeHeight ?? 40)
        container.appendChild(active)
    }

    document.body.appendChild(container)
    return { container, scrollTo }
}

describe('tocAutoScroll', () => {
    let restoreRect: () => void

    beforeEach(() => {
        restoreRect = installRectMock()
    })

    afterEach(() => {
        restoreRect()
        document.body.innerHTML = ''
        vi.unstubAllGlobals()
    })

    describe('centerActiveTocItem', () => {
        it('active 在中部偏下时滚到容器垂直中部', () => {
            const { container, scrollTo } = buildContainer({ containerHeight: 240, scrollTop: 0, activeTop: 400, activeHeight: 40 })
            expect(centerActiveTocItem(container)).toBe(true)
            // 0 + (400 - 0) - 240/2 + 40/2 = 300
            expect(scrollTo).toHaveBeenCalledWith({ top: 300, behavior: 'auto' })
        })

        it('active 在顶部附近时 targetTop 被 clamp 到 0（不强制下移）', () => {
            const { container, scrollTo } = buildContainer({ containerHeight: 240, scrollTop: 0, activeTop: 10, activeHeight: 40 })
            expect(centerActiveTocItem(container)).toBe(true)
            // 0 + 10 - 120 + 20 = -90 → 0
            expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'auto' })
        })

        it('无 active 项时返回 false 且不滚动', () => {
            const { container, scrollTo } = buildContainer({ containerHeight: 240, withActive: false })
            expect(centerActiveTocItem(container)).toBe(false)
            expect(scrollTo).not.toHaveBeenCalled()
        })

        it('容器高度为 0（未就绪）时返回 false 不滚动', () => {
            const { container, scrollTo } = buildContainer({ containerHeight: 0, activeTop: 400, activeHeight: 40 })
            expect(centerActiveTocItem(container)).toBe(false)
            expect(scrollTo).not.toHaveBeenCalled()
        })
    })

    describe('scheduleCenterActiveToc', () => {
        let rafQueue: Array<{ id: number; cb: FrameRequestCallback }>
        let rafSeq: number

        const flushFrame = (): void => {
            const frame = rafQueue.shift()
            if (frame) frame.cb(0)
        }

        beforeEach(() => {
            rafQueue = []
            rafSeq = 0
            vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback): number => {
                const id = ++rafSeq
                rafQueue.push({ id, cb })
                return id
            })
            vi.stubGlobal('cancelAnimationFrame', (id: number): void => {
                rafQueue = rafQueue.filter((r) => r.id !== id)
            })
        })

        it('首帧容器未就绪、后续就绪时最终命中并只滚一次', () => {
            const { container, scrollTo } = buildContainer({ containerHeight: 0, scrollTop: 0, activeTop: 400, activeHeight: 40 })
            scheduleCenterActiveToc(() => container)

            flushFrame() // 首帧 height=0 未就绪
            expect(scrollTo).not.toHaveBeenCalled()

            container.dataset.rectHeight = '240' // 就绪
            flushFrame() // 命中
            expect(scrollTo).toHaveBeenCalledTimes(1)
            expect(scrollTo).toHaveBeenCalledWith({ top: 300, behavior: 'auto' })

            flushFrame() // 命中后不应再排帧
            expect(scrollTo).toHaveBeenCalledTimes(1)
        })

        it('cancel 阻止未决帧执行', () => {
            const { container, scrollTo } = buildContainer({ containerHeight: 0, activeTop: 400, activeHeight: 40 })
            const cancel = scheduleCenterActiveToc(() => container)

            flushFrame() // 首帧未就绪，排了下一帧
            cancel()
            container.dataset.rectHeight = '240'
            flushFrame() // 已被 cancel 清空，无执行
            expect(scrollTo).not.toHaveBeenCalled()
        })
    })
})
