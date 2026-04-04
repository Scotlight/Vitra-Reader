import { describe, it, expect } from 'vitest'
import { scanHtmlBySaxStream, consumeMediaOffsetInRange, streamHtmlBySaxStream } from '../engine/render/htmlSaxStream'

describe('scanHtmlBySaxStream — 块边界检测', () => {
    it('空字符串返回空数组', () => {
        const result = scanHtmlBySaxStream('')
        expect(result.blockBoundaryOffsets).toHaveLength(0)
        expect(result.mediaTagOffsets).toHaveLength(0)
    })

    it('单个 </p> 产生一个块边界', () => {
        const html = '<p>hello</p>'
        const result = scanHtmlBySaxStream(html)
        expect(result.blockBoundaryOffsets).toHaveLength(1)
    })

    it('多个块级闭合标签产生对应边界数', () => {
        const html = '<p>a</p><div>b</div><h1>c</h1>'
        const result = scanHtmlBySaxStream(html)
        expect(result.blockBoundaryOffsets).toHaveLength(3)
    })

    it('开标签不计入块边界', () => {
        const html = '<p>text'
        const result = scanHtmlBySaxStream(html)
        expect(result.blockBoundaryOffsets).toHaveLength(0)
    })

    it('非块级标签不计入块边界', () => {
        const html = '<span>a</span><em>b</em>'
        const result = scanHtmlBySaxStream(html)
        expect(result.blockBoundaryOffsets).toHaveLength(0)
    })
})

describe('scanHtmlBySaxStream — 媒体标签检测', () => {
    it('img 标签产生媒体偏移', () => {
        const html = '<p>text</p><img src="a.jpg">'
        const result = scanHtmlBySaxStream(html)
        expect(result.mediaTagOffsets).toHaveLength(1)
    })

    it('svg 标签产生媒体偏移', () => {
        const html = '<svg><path/></svg>'
        const result = scanHtmlBySaxStream(html)
        expect(result.mediaTagOffsets).toHaveLength(1)
    })

    it('多个媒体标签全部检测', () => {
        const html = '<img src="a.jpg"><img src="b.jpg"><video src="c.mp4">'
        const result = scanHtmlBySaxStream(html)
        expect(result.mediaTagOffsets).toHaveLength(3)
    })

    it('媒体标签偏移记录开标签起始位置', () => {
        const html = '<p>x</p><img src="y.png">'
        const result = scanHtmlBySaxStream(html)
        expect(result.mediaTagOffsets[0]).toBe(html.indexOf('<img'))
    })
})

describe('scanHtmlBySaxStream — 特殊字符与容错', () => {
    it('非闭合标签不崩溃', () => {
        const html = '<p>unclosed'
        expect(() => scanHtmlBySaxStream(html)).not.toThrow()
    })

    it('带属性的标签正确解析', () => {
        const html = '<p class="foo" id="bar">text</p>'
        const result = scanHtmlBySaxStream(html)
        expect(result.blockBoundaryOffsets).toHaveLength(1)
    })

    it('属性值中含 > 不导致提前截断', () => {
        const html = '<img alt="a>b" src="x.jpg"><p>text</p>'
        expect(() => scanHtmlBySaxStream(html)).not.toThrow()
    })

    it('注释和 doctype 不计入块边界', () => {
        const html = '<!DOCTYPE html><!-- comment --><p>x</p>'
        const result = scanHtmlBySaxStream(html)
        expect(result.blockBoundaryOffsets).toHaveLength(1)
    })
})

describe('consumeMediaOffsetInRange', () => {
    it('范围内有媒体返回 true', () => {
        const offsets = [10, 20, 30]
        const cursor = { value: 0 }
        expect(consumeMediaOffsetInRange(offsets, 5, 25, cursor)).toBe(true)
    })

    it('范围内无媒体返回 false', () => {
        const offsets = [10, 20, 30]
        const cursor = { value: 0 }
        expect(consumeMediaOffsetInRange(offsets, 0, 5, cursor)).toBe(false)
    })

    it('游标向前推进跳过范围外偏移', () => {
        const offsets = [5, 15, 25]
        const cursor = { value: 0 }
        consumeMediaOffsetInRange(offsets, 0, 10, cursor)
        expect(cursor.value).toBe(1)
        consumeMediaOffsetInRange(offsets, 10, 20, cursor)
        expect(cursor.value).toBe(2)
    })

    it('空偏移数组返回 false', () => {
        const cursor = { value: 0 }
        expect(consumeMediaOffsetInRange([], 0, 100, cursor)).toBe(false)
    })
})

describe('streamHtmlBySaxStream', () => {
    it('流式回调结果与聚合扫描一致', () => {
        const html = '<p>a</p><img src="a.jpg"><div>b</div><video src="c.mp4"></video>'
        const blockBoundaryOffsets: number[] = []
        const mediaTagOffsets: number[] = []

        streamHtmlBySaxStream(html, {
            onBlockBoundary(offset) {
                blockBoundaryOffsets.push(offset)
            },
            onMediaTag(offset) {
                mediaTagOffsets.push(offset)
            },
        })

        const aggregated = scanHtmlBySaxStream(html)
        expect(blockBoundaryOffsets).toEqual(aggregated.blockBoundaryOffsets)
        expect(mediaTagOffsets).toEqual(aggregated.mediaTagOffsets)
    })

    it('回调返回 false 时提前停止扫描', () => {
        const html = '<p>a</p><p>b</p><p>c</p>'
        const blockBoundaryOffsets: number[] = []

        streamHtmlBySaxStream(html, {
            onBlockBoundary(offset) {
                blockBoundaryOffsets.push(offset)
                return false
            },
        })

        expect(blockBoundaryOffsets).toHaveLength(1)
    })
})
