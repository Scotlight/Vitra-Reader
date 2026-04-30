import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
    releaseMediaResourcesMock: vi.fn((container: HTMLElement) => {
        container.replaceChildren()
    }),
}))

vi.mock('@/utils/mediaResourceCleanup', () => ({
    releaseMediaResources: mocks.releaseMediaResourcesMock,
}))

import { mountPaginatedChapterNode } from '@/components/Reader/paginatedReader/paginatedChapterMount'

describe('paginatedChapterMount', () => {
    beforeEach(() => {
        mocks.releaseMediaResourcesMock.mockClear()
    })

    it('同一个章节节点已独占挂载时不会清空容器', () => {
        const container = document.createElement('div')
        const chapterNode = document.createElement('article')
        chapterNode.innerHTML = '<img src="blob:cover" alt="cover" />'
        container.appendChild(chapterNode)

        const result = mountPaginatedChapterNode(container, chapterNode)

        expect(result).toBe('already-mounted')
        expect(mocks.releaseMediaResourcesMock).not.toHaveBeenCalled()
        expect(container.firstElementChild).toBe(chapterNode)
        expect(chapterNode.querySelector('img')?.getAttribute('src')).toBe('blob:cover')
    })

    it('新章节节点挂载前会清理旧容器内容', () => {
        const container = document.createElement('div')
        const oldNode = document.createElement('article')
        const nextNode = document.createElement('article')
        container.appendChild(oldNode)

        const result = mountPaginatedChapterNode(container, nextNode)

        expect(result).toBe('mounted')
        expect(mocks.releaseMediaResourcesMock).toHaveBeenCalledTimes(1)
        expect(container.children).toHaveLength(1)
        expect(container.firstElementChild).toBe(nextNode)
    })
})
