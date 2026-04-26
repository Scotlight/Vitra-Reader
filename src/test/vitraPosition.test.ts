import { describe, it, expect, beforeEach } from 'vitest'
import { serializePosition, deserializePosition } from '@/engine/render/vitraPosition'

function makeRoot(html: string): HTMLElement {
    const div = document.createElement('div')
    div.innerHTML = html
    document.body.appendChild(div)
    return div
}

beforeEach(() => {
    document.body.innerHTML = ''
})

describe('serializePosition', () => {
    it('对文本节点生成有效的 domPath', () => {
        const root = makeRoot('<p>Hello world</p>')
        const textNode = root.querySelector('p')!.firstChild!
        const pos = serializePosition(root, textNode, 5, 0)
        expect(pos).not.toBeNull()
        expect(pos!.domPath).toHaveLength(2) // p:0, #text:0
        expect(pos!.textOffset).toBe(5)
        expect(pos!.spineIndex).toBe(0)
    })

    it('捕获前后上下文', () => {
        const root = makeRoot('<p>AAAA target BBBB</p>')
        const textNode = root.querySelector('p')!.firstChild!
        const pos = serializePosition(root, textNode, 5, 0)
        expect(pos).not.toBeNull()
        expect(pos!.contextBefore).toContain('AAAA')
        expect(pos!.contextAfter).toContain('target')
    })

    it('节点不在 root 内返回 null', () => {
        const root = makeRoot('<p>text</p>')
        const outside = document.createElement('span')
        outside.textContent = 'outside'
        const pos = serializePosition(root, outside, 0, 0)
        expect(pos).toBeNull()
    })
})

describe('deserializePosition — 精确匹配', () => {
    it('精确恢复文本节点位置', () => {
        const root = makeRoot('<p>Hello world</p>')
        const textNode = root.querySelector('p')!.firstChild!
        const pos = serializePosition(root, textNode, 6, 0)!
        const result = deserializePosition(root, pos)
        expect(result).not.toBeNull()
        expect(result!.accuracy).toBe('exact')
        expect(result!.offset).toBe(6)
    })

    it('偏移超出范围时夹紧到文本长度', () => {
        const root = makeRoot('<p>Hi</p>')
        const textNode = root.querySelector('p')!.firstChild!
        const pos = serializePosition(root, textNode, 0, 0)!
        // 手动设置超大偏移
        pos.textOffset = 9999
        const result = deserializePosition(root, pos)
        expect(result).not.toBeNull()
        expect(result!.offset).toBeLessThanOrEqual(2) // 'Hi'.length = 2
    })

    it('多层嵌套 DOM 精确定位', () => {
        const root = makeRoot('<div><section><p>深层文本</p></section></div>')
        const textNode = root.querySelector('p')!.firstChild!
        const pos = serializePosition(root, textNode, 2, 1)!
        const result = deserializePosition(root, pos)
        expect(result).not.toBeNull()
        expect(result!.accuracy).toBe('exact')
    })
})

describe('deserializePosition — 模糊匹配回退', () => {
    it('domPath 失效时通过上下文文本模糊恢复', () => {
        const root = makeRoot('<p>这是一段足够长的前文内容 锚定词在这里 这是后文内容足够长</p>')
        const textNode = root.querySelector('p')!.firstChild!
        const pos = serializePosition(root, textNode, 12, 0)!

        // 破坏 domPath 使精确路径失效（childIndex 越界）
        pos.domPath = ['p:99', '#text:0']

        const result = deserializePosition(root, pos)
        expect(result).not.toBeNull()
        expect(result!.accuracy).toBe('fuzzy')
    })

    it('上下文不足时返回 null', () => {
        const root = makeRoot('<p>ab</p>')
        const textNode = root.querySelector('p')!.firstChild!
        const pos = serializePosition(root, textNode, 0, 0)!
        // 清空上下文
        pos.contextBefore = ''
        pos.contextAfter = ''
        // 破坏 domPath
        pos.domPath = ['nonexistent:99']
        const result = deserializePosition(root, pos)
        expect(result).toBeNull()
    })
})
