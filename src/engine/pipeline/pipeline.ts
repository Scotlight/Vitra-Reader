import { BaseParser } from '../core/baseParser';
import { detectFormat } from '../core/formatDetector';
import {
  Azw3Parser,
  AzwParser,
  EpubParser,
  Fb2Parser,
  HtmlParser,
  MdParser,
  MobiParser,
  PdfParser,
  TxtParser,
  XmlParser,
} from '../parsers/providerParsers';
import { DocxParser } from '../parsers/docxParser';
import {
  CbzParser,
  CbtParser,
  CbrParser,
  Cb7Parser,
} from '../parsers/comicParser';
import type {
  ParsedBook,
  EngineBookFormat,
  ParsedBookMetadata,
  BookSection,
} from '../types/book';

const DEFAULT_PREVIEW_SECTIONS = 5;
const PREVIEW_TEXT_LIMIT = 180;

function isPreviewAbortLikeError(error: unknown): boolean {
  const text = String(error instanceof Error ? error.message : error || '').toLowerCase();
  return text.includes('preview canceled')
    || text.includes('load canceled')
    || text.includes('aborted')
    || text.includes('canceled');
}

function shouldLogPreviewDebug(): boolean {
  if (!import.meta.env.DEV) return false;
  return Boolean((globalThis as typeof globalThis & { __VITRA_DEBUG_PIPELINE_PREVIEW__?: unknown }).__VITRA_DEBUG_PIPELINE_PREVIEW__);
}

function recoverPreviewFailure(stage: 'preview' | 'warmup', error: unknown): readonly PreviewSection[] {
  if (!isPreviewAbortLikeError(error) && shouldLogPreviewDebug()) {
    console.debug(`[BookPipeline] ${stage} skipped after recoverable preview error:`, error);
  }
  return [];
}

export const SUPPORTED_BOOK_FORMATS: readonly EngineBookFormat[] = [
  'EPUB', 'MOBI', 'AZW3', 'AZW',
  'PDF', 'DJVU',
  'TXT', 'FB2', 'DOCX', 'MD',
  'HTML', 'HTM', 'XML', 'XHTML', 'MHTML',
  'CBZ', 'CBT', 'CBR', 'CB7',
];

export interface PreviewSection {
  readonly id: string | number;
  readonly href: string;
  readonly excerpt: string;
}

export interface OpenRequest {
  readonly buffer: ArrayBuffer;
  readonly filename: string;
  readonly previewCount?: number;
}

export interface OpenHandle {
  readonly format: EngineBookFormat;
  readonly metadata: Promise<ParsedBookMetadata>;
  readonly preview: Promise<readonly PreviewSection[]>;
  readonly ready: Promise<ParsedBook>;
  readonly cancel: () => void;
}

type ParserFactory = (buffer: ArrayBuffer, filename: string) => BaseParser;

const PARSER_FACTORIES = {
  EPUB: (buffer, filename) => new EpubParser(buffer, filename),
  PDF: (buffer, filename) => new PdfParser(buffer, filename),
  TXT: (buffer, filename) => new TxtParser(buffer, filename),
  MOBI: (buffer, filename) => new MobiParser(buffer, filename),
  AZW: (buffer, filename) => new AzwParser(buffer, filename),
  AZW3: (buffer, filename) => new Azw3Parser(buffer, filename),
  HTML: (buffer, filename) => new HtmlParser(buffer, filename, 'HTML'),
  HTM: (buffer, filename) => new HtmlParser(buffer, filename, 'HTM'),
  XHTML: (buffer, filename) => new HtmlParser(buffer, filename, 'XHTML'),
  MHTML: (buffer, filename) => new HtmlParser(buffer, filename, 'MHTML'),
  XML: (buffer, filename) => new XmlParser(buffer, filename),
  MD: (buffer, filename) => new MdParser(buffer, filename),
  FB2: (buffer, filename) => new Fb2Parser(buffer, filename),
  DOCX: (buffer, filename) => new DocxParser(buffer, filename),
  CBZ: (buffer, filename) => new CbzParser(buffer, filename),
  CBT: (buffer, filename) => new CbtParser(buffer, filename),
  CBR: (buffer, filename) => new CbrParser(buffer, filename),
  CB7: (buffer, filename) => new Cb7Parser(buffer, filename),
} satisfies Partial<Record<EngineBookFormat, ParserFactory>>;

export class BookPipeline {
  async open(request: OpenRequest): Promise<OpenHandle> {
    const format = await detectFormat(request.buffer, request.filename);
    const signaler = new AbortController();
    const parser = this.createParser(format, request);
    const ready = this.parseBook(parser, signaler.signal);
    const metadata = ready.then((book) => book.metadata);
    const preview = this.buildPreview(ready, request.previewCount ?? DEFAULT_PREVIEW_SECTIONS, signaler.signal)
      .catch((error) => recoverPreviewFailure('preview', error));

    return {
      format,
      metadata,
      preview,
      ready,
      cancel: () => signaler.abort(),
    };
  }

  private createParser(format: EngineBookFormat, request: OpenRequest): BaseParser {
    const { buffer, filename } = request;
    if (format === 'DJVU') {
      throw new Error('BookPipeline: DJVU support requires optional dependency "djvu.js" (GPL-3.0). Install it and import DjvuParser manually.');
    }
    const createParser = PARSER_FACTORIES[format];
    if (!createParser) {
      throw new Error(`BookPipeline: parser not implemented for format "${format}"`);
    }
    return createParser(buffer, filename);
  }

  private async parseBook(parser: BaseParser, signal: AbortSignal): Promise<ParsedBook> {
    if (signal.aborted) throw new Error('BookPipeline: load canceled before parse');
    const parsed = await parser.parse();
    if (signal.aborted) {
      parsed.destroy();
      throw new Error('BookPipeline: load canceled after parse');
    }
    return parsed;
  }

  private async buildPreview(
    ready: Promise<ParsedBook>,
    count: number,
    signal: AbortSignal,
  ): Promise<readonly PreviewSection[]> {
    const book = await ready;
    if (book.sections.length === 0) {
      return [];
    }

    const targetCount = Math.max(1, count);
    const firstSection = book.sections[0];
    const immediate = await readPreviewSections([firstSection], signal);
    const warmupSections = book.sections.slice(1, targetCount);
    schedulePreviewWarmup(warmupSections, signal);
    return immediate;
  }
}

async function readPreviewSections(
  sections: readonly BookSection[],
  signal: AbortSignal,
): Promise<readonly PreviewSection[]> {
  const preview: PreviewSection[] = [];
  for (const section of sections) {
    if (signal.aborted) throw new Error('BookPipeline: preview canceled');
    try {
      const loaded = await section.load();
      const html = await toHtmlContent(loaded);
      preview.push({
        id: section.id,
        href: section.href,
        excerpt: toExcerpt(html),
      });
    } finally {
      section.unload();
    }
  }
  return preview;
}

function toExcerpt(html: string): string {
  const text = html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.slice(0, PREVIEW_TEXT_LIMIT);
}

async function toHtmlContent(loadedContent: string): Promise<string> {
  if (!looksLikeBlobUrl(loadedContent)) {
    return loadedContent;
  }

  const response = await fetch(loadedContent);
  if (!response.ok) {
    throw new Error(`BookPipeline: failed to read section blob (${response.status})`);
  }
  return response.text();
}

function looksLikeBlobUrl(value: string): boolean {
  return /^blob:/i.test(value);
}

function schedulePreviewWarmup(
  sections: readonly BookSection[],
  signal: AbortSignal,
): void {
  if (sections.length === 0) return;

  const runWarmup = async () => {
    for (const section of sections) {
      if (signal.aborted) return;
      try {
        const loaded = await section.load();
        if (looksLikeBlobUrl(loaded)) {
          await toHtmlContent(loaded);
        }
      } finally {
        section.unload();
      }
    }
  };

  const idleScheduler = (globalThis as {
    requestIdleCallback?: (handler: () => void) => number;
  }).requestIdleCallback;

  const launchWarmup = () => {
    void runWarmup().catch((error) => {
      recoverPreviewFailure('warmup', error);
    });
  };

  if (typeof idleScheduler === 'function') {
    idleScheduler(() => {
      launchWarmup();
    });
    return;
  }

  window.setTimeout(() => {
    launchWarmup();
  }, 0);
}
