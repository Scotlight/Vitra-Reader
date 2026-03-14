import { describe, it, expect, beforeEach } from 'vitest'
import {
    findTextInDOM,
    findTextAcrossSegments,
    highlightRange,
    removeHighlight,
    createHighlightDescriptor,
    restoreHighlightsAfterHydration,
} from '../utils/textFinder'

function makeContainer(html: string): HTMLElement {
    const div = document.createElement('div')
    div.innerHTML = html
    document.body.appendChild(div)
    return div
}

beforeEach(() => {
    document.body.innerHTML = ''
})

describe('findTextInDOM', () => {
    it('单节点精确匹配', () => {
        const el = makeContainer('<p>Hello world</p>')
        const range = findTextInDOM(el, 'world')
        expect(range).not.toBeNull()
        expect(range!.toString()).toBe('world')
    })

    it('跨文本节点匹配', () => {
        const el = makeContainer('<p>foo</p><p>bar</p>')
        const range = findTextInDOM(el, 'foobar')
        expect(range).not.toBeNull()
    })

    it('空字符串返回 null', () => {
        const el = makeContainer('<p>text</p>')
        expect(findTextInDOM(el, '')).toBeNull()
    })

    it('找不到返回 null', () => {
        const el = makeContainer('<p>hello</p>')
        expect(findTextInDOM(el, 'xyz')).toBeNull()
    })

    it('空白规范化匹配', () => {
        const el = makeContainer('<p>foo   bar</p>')
        const range = findTextInDOM(el, 'foo bar')
        expect(range).not.toBeNull()
    })
})

describe('findTextAcrossSegments', () => {
    it('单段内匹配', () => {
        const seg = makeContainer('<p>hello world</p>')
        const result = findTextAcrossSegments([seg], 'hello')
        expect(result).not.toBeNull()
        expect(result!.length).toBeGreaterThan(0)
    })

    it('跨两个段匹配', () => {
        const seg1 = makeContainer('<p>first part </p>')
        const seg2 = makeContainer('<p>second part</p>')
        const result = findTextAcrossSegments([seg1, seg2], 'first part second part')
        expect(result).not.toBeNull()
    })

    it('空段数组返回 null', () => {
        expect(findTextAcrossSegments([], 'text')).toBeNull()
    })

    it('空搜索词返回 null', () => {
        const seg = makeContainer('<p>text</p>')
        expect(findTextAcrossSegments([seg], '')).toBeNull()
    })
})

describe('highlightRange / removeHighlight', () => {
    it('高亮后容器中存在 mark 元素', () => {
        const el = makeContainer('<p>Hello world</p>')
        const range = findTextInDOM(el, 'world')!
        highlightRange(range, 'h1', 'yellow')
        const mark = el.querySelector('mark[data-highlight-id="h1"]')
        expect(mark).not.toBeNull()
        expect(mark!.textContent).toBe('world')
    })

    it('重复高亮不产生嵌套 mark', () => {
        const el = makeContainer('<p>Hello world</p>')
        const range = findTextInDOM(el, 'world')!
        highlightRange(range, 'h1', 'yellow')
        const range2 = findTextInDOM(el, 'world')!
        highlightRange(range2, 'h1', 'yellow')
        const marks = el.querySelectorAll('mark[data-highlight-id="h1"]')
        expect(marks.length).toBe(1)
    })

    it('removeHighlight 恢复原始文本结构', () => {
        const el = makeContainer('<p>Hello world</p>')
        const range = findTextInDOM(el, 'world')!
        highlightRange(range, 'h1', 'yellow')
        removeHighlight(el, 'h1')
        expect(el.querySelector('mark')).toBeNull()
        expect(el.textContent).toContain('world')
    })
})

describe('createHighlightDescriptor / restoreHighlightsAfterHydration', () => {
    it('创建描述符后包含正确的文本和上下文', () => {
        const el = makeContainer('<p>before target after</p>')
        const range = findTextInDOM(el, 'target')!
        highlightRange(range, 'h1', 'yellow')
        const desc = createHighlightDescriptor(el, 'h1', 'yellow')
        expect(desc).not.toBeNull()
        expect(desc!.text).toBe('target')
        expect(desc!.contextBefore).toContain('before')
        expect(desc!.contextAfter).toContain('after')
    })

    it('水合重建后可恢复高亮', () => {
        const el = makeContainer('<p>before target after</p>')
        const range = findTextInDOM(el, 'target')!
        highlightRange(range, 'h1', 'yellow')
        const desc = createHighlightDescriptor(el, 'h1', 'yellow')!

        // 模拟 DOM 重建（水合）
        removeHighlight(el, 'h1')
        el.innerHTML = '<p>before target after</p>'

        restoreHighlightsAfterHydration(el, [desc])
        expect(el.querySelector('mark[data-highlight-id="h1"]')).not.toBeNull()
    })

    it('已存在高亮时不重复恢复', () => {
        const el = makeContainer('<p>before target after</p>')
        const range = findTextInDOM(el, 'target')!
        highlightRange(range, 'h1', 'yellow')
        const desc = createHighlightDescriptor(el, 'h1', 'yellow')!
        // 不清除直接再次恢复
        restoreHighlightsAfterHydration(el, [desc])
        const marks = el.querySelectorAll('mark[data-highlight-id="h1"]')
        expect(marks.length).toBe(1)
    })
})
