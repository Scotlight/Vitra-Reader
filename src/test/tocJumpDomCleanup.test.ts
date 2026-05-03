import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
    releaseMediaResources: vi.fn((element: HTMLElement) => {
        element.replaceChildren()
    }),
    segmentRelease: vi.fn((element: HTMLElement) => {
        element.replaceChildren()
    }),
}))

vi.mock('@/utils/mediaResourceCleanup', () => ({
    releaseMediaResources: mocks.releaseMediaResources,
}))

vi.mock('@/components/Reader/ShadowRenderer', () => ({
    segmentPool: {
        release: mocks.segmentRelease,
    },
}))

describe('tocJumpDomCleanup', () => {
    afterEach(() => {
        document.body.innerHTML = ''
        vi.clearAllMocks()
    })

    it('清理已挂载章节 DOM、虚拟运行时、段池和媒体资源', async () => {
        const { clearMountedChapterDom } = await import('@/components/Reader/scrollReader/tocJumpDomCleanup')
        const cleanupVirtualChapterRuntime = vi.fn()
        const resetResizeObservers = vi.fn()
        const listEl = document.createElement('div')
        listEl.innerHTML = `
            <article data-chapter-id="ch-1">
                <section data-shadow-segment-index="0"><img src="blob:a" /></section>
            </article>
            <article data-chapter-id="ch-2">
                <section data-shadow-segment-index="1"></section>
                <section data-shadow-segment-index="2"></section>
            </article>
        `
        document.body.appendChild(listEl)

        clearMountedChapterDom({
            listEl,
            cleanupVirtualChapterRuntime,
            resetResizeObservers,
        })

        expect(resetResizeObservers).toHaveBeenCalledTimes(1)
        expect(cleanupVirtualChapterRuntime).toHaveBeenCalledWith('ch-1')
        expect(cleanupVirtualChapterRuntime).toHaveBeenCalledWith('ch-2')
        expect(mocks.segmentRelease).toHaveBeenCalledTimes(3)
        expect(mocks.releaseMediaResources).toHaveBeenCalledTimes(2)
        expect(listEl.querySelectorAll('[data-chapter-id]')).toHaveLength(0)
    })

    it('没有章节节点时只重置 resize observer', async () => {
        const { clearMountedChapterDom } = await import('@/components/Reader/scrollReader/tocJumpDomCleanup')
        const resetResizeObservers = vi.fn()

        clearMountedChapterDom({
            listEl: document.createElement('div'),
            cleanupVirtualChapterRuntime: vi.fn(),
            resetResizeObservers,
        })

        expect(resetResizeObservers).toHaveBeenCalledTimes(1)
        expect(mocks.segmentRelease).not.toHaveBeenCalled()
        expect(mocks.releaseMediaResources).not.toHaveBeenCalled()
    })
})
