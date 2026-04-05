import { describe, expect, it } from 'vitest'
import { resolveScrollSelectionState } from '../components/Reader/scrollSelectionState'

function createRect(left: number, top: number, width: number, height: number): DOMRect {
    return {
        x: left,
        y: top,
        left,
        top,
        width,
        height,
        right: left + width,
        bottom: top + height,
        toJSON() {
            return {}
        },
    } as DOMRect
}

describe('scrollSelectionState', () => {
    it('解析选择文本、菜单坐标和章节索引', () => {
        const viewport = document.createElement('div')
        const chapter = document.createElement('div')
        chapter.setAttribute('data-chapter-id', 'ch-3')
        const paragraph = document.createElement('p')
        const textNode = document.createTextNode('hello world')
        paragraph.appendChild(textNode)
        chapter.appendChild(paragraph)
        viewport.appendChild(chapter)
        document.body.appendChild(viewport)

        const selection = window.getSelection()
        const range = document.createRange()
        range.setStart(textNode, 0)
        range.setEnd(textNode, 5)
        Object.defineProperty(range, 'getBoundingClientRect', {
            value: () => createRect(10, 20, 30, 8),
        })
        selection?.removeAllRanges()
        selection?.addRange(range)

        expect(resolveScrollSelectionState(selection, viewport)).toEqual({
            spineIndex: 3,
            text: 'hello',
            x: 25,
            y: 10,
        })
    })

    it('空选择返回空值', () => {
        const selection = window.getSelection()
        selection?.removeAllRanges()
        expect(resolveScrollSelectionState(selection, document.createElement('div'))).toBeNull()
    })

    it('无章节祖先时 spineIndex 为 -1', () => {
        const viewport = document.createElement('div')
        const textNode = document.createTextNode('plain text')
        viewport.appendChild(textNode)
        document.body.appendChild(viewport)

        const selection = window.getSelection()
        const range = document.createRange()
        range.setStart(textNode, 0)
        range.setEnd(textNode, 5)
        Object.defineProperty(range, 'getBoundingClientRect', {
            value: () => createRect(0, 10, 20, 6),
        })
        selection?.removeAllRanges()
        selection?.addRange(range)

        expect(resolveScrollSelectionState(selection, viewport)?.spineIndex).toBe(-1)
    })
})
