import { describe, it, expect } from 'vitest'
import { stripBookExtension } from '@/engine/core/contentProvider'

describe('stripBookExtension', () => {
    it('移除 epub 扩展名', () => {
        expect(stripBookExtension('深夜书店.epub')).toBe('深夜书店')
    })

    it('移除 pdf 扩展名', () => {
        expect(stripBookExtension('report.pdf')).toBe('report')
    })

    it('移除文档与漫画扩展名', () => {
        expect(stripBookExtension('manual.docx')).toBe('manual')
        expect(stripBookExtension('archive.djvu')).toBe('archive')
        expect(stripBookExtension('archive.djv')).toBe('archive')
        expect(stripBookExtension('panel.cbz')).toBe('panel')
    })

    it('移除 html 相关扩展名', () => {
        expect(stripBookExtension('chapter.xhtml')).toBe('chapter')
        expect(stripBookExtension('saved.mhtml')).toBe('saved')
    })

    it('无扩展名时原样返回', () => {
        expect(stripBookExtension('noext')).toBe('noext')
    })

    it('不移除非书籍扩展名', () => {
        expect(stripBookExtension('image.png')).toBe('image.png')
    })
})
