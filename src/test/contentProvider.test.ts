import { describe, it, expect } from 'vitest'
import { detectFormat, stripBookExtension } from '@/engine/core/contentProvider'

describe('detectFormat', () => {
    it('epub 扩展名识别', () => {
        expect(detectFormat('book.epub')).toBe('epub')
    })

    it('pdf 扩展名识别', () => {
        expect(detectFormat('doc.pdf')).toBe('pdf')
    })

    it('txt 扩展名识别', () => {
        expect(detectFormat('note.txt')).toBe('txt')
    })

    it('mobi 扩展名识别', () => {
        expect(detectFormat('book.mobi')).toBe('mobi')
    })

    it('azw3 扩展名识别', () => {
        expect(detectFormat('book.azw3')).toBe('azw3')
    })

    it('epub magic bytes 优先于扩展名', () => {
        // epub 是 zip，magic: PK\x03\x04
        const epubMagic = new Uint8Array([0x50, 0x4B, 0x03, 0x04, 0x00])
        expect(detectFormat('file.txt', epubMagic)).toBe('epub')
    })

    it('pdf magic bytes 优先于扩展名', () => {
        // %PDF-
        const pdfMagic = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2D])
        expect(detectFormat('file.epub', pdfMagic)).toBe('pdf')
    })

    it('大小写扩展名不影响结果', () => {
        expect(detectFormat('BOOK.EPUB')).toBe('epub')
        expect(detectFormat('BOOK.PDF')).toBe('pdf')
    })
})

describe('stripBookExtension', () => {
    it('移除 epub 扩展名', () => {
        expect(stripBookExtension('深夜书店.epub')).toBe('深夜书店')
    })

    it('移除 pdf 扩展名', () => {
        expect(stripBookExtension('report.pdf')).toBe('report')
    })

    it('无扩展名时原样返回', () => {
        expect(stripBookExtension('noext')).toBe('noext')
    })

    it('不移除非书籍扩展名', () => {
        expect(stripBookExtension('image.png')).toBe('image.png')
    })
})
