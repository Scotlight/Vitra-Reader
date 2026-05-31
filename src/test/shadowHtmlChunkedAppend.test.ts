import { afterEach, describe, expect, it } from 'vitest'
import {
    appendHtmlContentChunked,
    appendHtmlFragmentsChunked,
} from '@/components/Reader/shadowRenderer/htmlChunkedAppend'

describe('htmlChunkedAppend', () => {
    afterEach(() => {
        document.body.innerHTML = ''
    })

    it('多节点 HTML 按序完整追加，数量/顺序/文本一致', async () => {
        const container = document.createElement('div')
        await appendHtmlContentChunked(container, '<p>一</p><p>二</p><p>三</p>')

        const ps = container.querySelectorAll('p')
        expect(ps).toHaveLength(3)
        expect([...ps].map((p) => p.textContent)).toEqual(['一', '二', '三'])
    })

    it('节点数超过 batchSize 时分批仍完整且保持顺序', async () => {
        const container = document.createElement('div')
        const html = Array.from({ length: 5 }, (_, i) => `<p>${i}</p>`).join('')
        // 传入极小 batchSize 强制走多批分支
        await appendHtmlContentChunked(container, html, 2)

        const ps = container.querySelectorAll('p')
        expect(ps).toHaveLength(5)
        expect([...ps].map((p) => p.textContent)).toEqual(['0', '1', '2', '3', '4'])
    })

    it('移动原节点而非克隆：内层子孙结构完整保留', async () => {
        const container = document.createElement('div')
        await appendHtmlContentChunked(container, '<div class="wrap"><span>深</span><b>层</b></div>')

        const wrap = container.querySelector('.wrap')
        expect(wrap).not.toBeNull()
        expect(wrap?.querySelector('span')?.textContent).toBe('深')
        expect(wrap?.querySelector('b')?.textContent).toBe('层')
    })

    it('空 HTML 走 textContent 回退分支，不抛错', async () => {
        const container = document.createElement('div')
        await expect(appendHtmlContentChunked(container, '')).resolves.toBeUndefined()
        expect(container.textContent).toBe('')
    })

    it('appendHtmlFragmentsChunked 多段按顺序拼接', async () => {
        const container = document.createElement('div')
        await appendHtmlFragmentsChunked(container, ['<p>A</p>', '<p>B</p>', '<p>C</p>'])

        const ps = container.querySelectorAll('p')
        expect(ps).toHaveLength(3)
        expect([...ps].map((p) => p.textContent)).toEqual(['A', 'B', 'C'])
    })
})
