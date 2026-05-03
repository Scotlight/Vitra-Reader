import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ParsedBook, BookSection } from '@/engine/types/book'

const mocks = vi.hoisted(() => ({
  detectFormatMock: vi.fn(),
  parseMock: vi.fn(),
}))

vi.mock('@/engine/core/formatDetector', () => ({
  detectFormat: mocks.detectFormatMock,
}))

vi.mock('@/engine/core/baseParser', () => ({
  BaseParser: class {},
}))

vi.mock('@/engine/parsers/providerParsers', () => {
  class MockParser {
    parse = mocks.parseMock
  }
  return {
    Azw3Parser: MockParser,
    AzwParser: MockParser,
    EpubParser: MockParser,
    Fb2Parser: MockParser,
    HtmlParser: MockParser,
    MdParser: MockParser,
    MobiParser: MockParser,
    PdfParser: MockParser,
    TxtParser: MockParser,
    XmlParser: MockParser,
  }
})

vi.mock('@/engine/parsers/docxParser', () => {
  class MockParser {
    parse = mocks.parseMock
  }
  return { DocxParser: MockParser }
})

vi.mock('@/engine/parsers/comicParser', () => {
  class MockParser {
    parse = mocks.parseMock
  }
  return {
    CbzParser: MockParser,
    CbtParser: MockParser,
    CbrParser: MockParser,
    Cb7Parser: MockParser,
  }
})

import { BookPipeline } from '@/engine/pipeline/pipeline'

function createBook(sections: readonly BookSection[]): ParsedBook {
  return {
    format: 'PDF',
    metadata: { title: 'Smoke', author: [] },
    sections,
    toc: [],
    layout: 'pre-paginated',
    direction: 'ltr',
    resolveHref: () => null,
    getCover: async () => null,
    destroy: () => undefined,
    search: () => [],
  }
}

function createSection(id: string, load: () => Promise<string>): BookSection {
  return {
    id,
    href: id,
    load,
    unload: vi.fn(),
    size: 1,
  }
}

describe('BookPipeline preview resilience', () => {
  beforeEach(() => {
    mocks.detectFormatMock.mockReset()
    mocks.parseMock.mockReset()
    mocks.detectFormatMock.mockResolvedValue('PDF')
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('将首段预览失败降级为空数组，而不是抛出未处理 Promise', async () => {
    const firstSection = createSection('s1', async () => {
      throw new Error('preview failed')
    })
    mocks.parseMock.mockResolvedValue(createBook([firstSection]))

    const pipeline = new BookPipeline()
    const handle = await pipeline.open({ buffer: new ArrayBuffer(8), filename: 'sample.pdf' })

    await expect(handle.preview).resolves.toEqual([])
    expect(firstSection.unload).toHaveBeenCalledTimes(1)
    await expect(handle.ready).resolves.toMatchObject({ format: 'PDF' })
  })

  it('后台 warmup 失败不会污染控制台或打断预览结果', async () => {
    vi.useFakeTimers()
    const firstSection = createSection('s1', async () => '<p>preview ok</p>')
    const secondSection = createSection('s2', async () => {
      throw new Error('warmup failed')
    })
    mocks.parseMock.mockResolvedValue(createBook([firstSection, secondSection]))

    const pipeline = new BookPipeline()
    const handle = await pipeline.open({ buffer: new ArrayBuffer(8), filename: 'sample.pdf', previewCount: 2 })

    await expect(handle.preview).resolves.toEqual([
      { id: 's1', href: 's1', excerpt: 'preview ok' },
    ])

    await vi.runAllTimersAsync()
    expect(firstSection.unload).toHaveBeenCalledTimes(1)
    expect(secondSection.unload).toHaveBeenCalledTimes(1)
  })
})
