import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { VitraBook, VitraBookSection } from '@/engine/types/vitraBook'

const mocks = vi.hoisted(() => ({
  detectFormatMock: vi.fn(),
  parseMock: vi.fn(),
}))

vi.mock('@/engine/core/vitraFormatDetector', () => ({
  detectVitraFormat: mocks.detectFormatMock,
}))

vi.mock('@/engine/core/vitraBaseParser', () => ({
  VitraBaseParser: class {},
}))

vi.mock('@/engine/parsers/vitraProviderParsers', () => {
  class MockParser {
    parse = mocks.parseMock
  }
  return {
    VitraAzw3Parser: MockParser,
    VitraAzwParser: MockParser,
    VitraEpubParser: MockParser,
    VitraFb2Parser: MockParser,
    VitraHtmlParser: MockParser,
    VitraMdParser: MockParser,
    VitraMobiParser: MockParser,
    VitraPdfParser: MockParser,
    VitraTxtParser: MockParser,
    VitraXmlParser: MockParser,
  }
})

vi.mock('@/engine/parsers/vitraDocxParser', () => {
  class MockParser {
    parse = mocks.parseMock
  }
  return { VitraDocxParser: MockParser }
})

vi.mock('@/engine/parsers/vitraComicParser', () => {
  class MockParser {
    parse = mocks.parseMock
  }
  return {
    VitraCbzParser: MockParser,
    VitraCbtParser: MockParser,
    VitraCbrParser: MockParser,
    VitraCb7Parser: MockParser,
  }
})

import { VitraPipeline } from '@/engine/pipeline/vitraPipeline'

function createBook(sections: readonly VitraBookSection[]): VitraBook {
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

function createSection(id: string, load: () => Promise<string>): VitraBookSection {
  return {
    id,
    href: id,
    load,
    unload: vi.fn(),
    size: 1,
  }
}

describe('VitraPipeline preview resilience', () => {
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

    const pipeline = new VitraPipeline()
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

    const pipeline = new VitraPipeline()
    const handle = await pipeline.open({ buffer: new ArrayBuffer(8), filename: 'sample.pdf', previewCount: 2 })

    await expect(handle.preview).resolves.toEqual([
      { id: 's1', href: 's1', excerpt: 'preview ok' },
    ])

    await vi.runAllTimersAsync()
    expect(firstSection.unload).toHaveBeenCalledTimes(1)
    expect(secondSection.unload).toHaveBeenCalledTimes(1)
  })
})
