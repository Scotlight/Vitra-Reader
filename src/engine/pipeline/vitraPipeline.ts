import { VitraBaseParser } from '../core/vitraBaseParser';
import { detectVitraFormat } from '../core/vitraFormatDetector';
import {
  VitraAzw3Parser,
  VitraAzwParser,
  VitraEpubParser,
  VitraFb2Parser,
  VitraHtmlParser,
  VitraMdParser,
  VitraMobiParser,
  VitraPdfParser,
  VitraTxtParser,
  VitraXmlParser,
} from '../parsers/vitraProviderParsers';
import { VitraDocxParser } from '../parsers/vitraDocxParser';
import {
  VitraCbzParser,
  VitraCbtParser,
  VitraCbrParser,
  VitraCb7Parser,
} from '../parsers/vitraComicParser';
import type {
  VitraBook,
  VitraBookFormat,
  VitraBookMetadata,
  VitraBookSection,
} from '../types/vitraBook';

const DEFAULT_PREVIEW_SECTIONS = 5;
const PREVIEW_TEXT_LIMIT = 180;

export const VITRA_SUPPORTED_FORMATS: readonly VitraBookFormat[] = [
  'EPUB', 'MOBI', 'AZW3', 'AZW',
  'PDF', 'DJVU',
  'TXT', 'FB2', 'DOCX', 'MD',
  'HTML', 'HTM', 'XML', 'XHTML', 'MHTML',
  'CBZ', 'CBT', 'CBR', 'CB7',
];

export interface VitraPreviewSection {
  readonly id: string | number;
  readonly href: string;
  readonly excerpt: string;
}

export interface VitraOpenRequest {
  readonly buffer: ArrayBuffer;
  readonly filename: string;
  readonly previewCount?: number;
}

export interface VitraOpenHandle {
  readonly format: VitraBookFormat;
  readonly metadata: Promise<VitraBookMetadata>;
  readonly preview: Promise<readonly VitraPreviewSection[]>;
  readonly ready: Promise<VitraBook>;
  readonly cancel: () => void;
}

export class VitraPipeline {
  async open(request: VitraOpenRequest): Promise<VitraOpenHandle> {
    const format = await detectVitraFormat(request.buffer, request.filename);
    const signaler = new AbortController();
    const parser = this.createParser(format, request);
    const ready = this.parseBook(parser, signaler.signal);
    const metadata = ready.then((book) => book.metadata);
    const preview = this.buildPreview(ready, request.previewCount ?? DEFAULT_PREVIEW_SECTIONS, signaler.signal);

    return {
      format,
      metadata,
      preview,
      ready,
      cancel: () => signaler.abort(),
    };
  }

  private createParser(format: VitraBookFormat, request: VitraOpenRequest): VitraBaseParser {
    const { buffer, filename } = request;
    switch (format) {
      case 'EPUB': return new VitraEpubParser(buffer, filename);
      case 'PDF': return new VitraPdfParser(buffer, filename);
      case 'TXT': return new VitraTxtParser(buffer, filename);
      case 'MOBI': return new VitraMobiParser(buffer, filename);
      case 'AZW': return new VitraAzwParser(buffer, filename);
      case 'AZW3': return new VitraAzw3Parser(buffer, filename);
      case 'HTML': return new VitraHtmlParser(buffer, filename, 'HTML');
      case 'HTM': return new VitraHtmlParser(buffer, filename, 'HTM');
      case 'XHTML': return new VitraHtmlParser(buffer, filename, 'XHTML');
      case 'MHTML': return new VitraHtmlParser(buffer, filename, 'MHTML');
      case 'XML': return new VitraXmlParser(buffer, filename);
      case 'MD': return new VitraMdParser(buffer, filename);
      case 'FB2': return new VitraFb2Parser(buffer, filename);
      case 'DJVU':
        throw new Error('VitraPipeline: DJVU support requires optional dependency "djvu.js" (GPL-3.0). Install it and import VitraDjvuParser manually.');
      case 'DOCX': return new VitraDocxParser(buffer, filename);
      case 'CBZ': return new VitraCbzParser(buffer, filename);
      case 'CBT': return new VitraCbtParser(buffer, filename);
      case 'CBR': return new VitraCbrParser(buffer, filename);
      case 'CB7': return new VitraCb7Parser(buffer, filename);
      default:
        throw new Error(`VitraPipeline: parser not implemented for format "${format}"`);
    }
  }

  private async parseBook(parser: VitraBaseParser, signal: AbortSignal): Promise<VitraBook> {
    if (signal.aborted) throw new Error('VitraPipeline: load canceled before parse');
    const parsed = await parser.parse();
    if (signal.aborted) {
      parsed.destroy();
      throw new Error('VitraPipeline: load canceled after parse');
    }
    return parsed;
  }

  private async buildPreview(
    ready: Promise<VitraBook>,
    count: number,
    signal: AbortSignal,
  ): Promise<readonly VitraPreviewSection[]> {
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
  sections: readonly VitraBookSection[],
  signal: AbortSignal,
): Promise<readonly VitraPreviewSection[]> {
  const preview: VitraPreviewSection[] = [];
  for (const section of sections) {
    if (signal.aborted) throw new Error('VitraPipeline: preview canceled');
    const loaded = await section.load();
    const html = await toHtmlContent(loaded);
    section.unload();
    preview.push({
      id: section.id,
      href: section.href,
      excerpt: toExcerpt(html),
    });
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
    throw new Error(`VitraPipeline: failed to read section blob (${response.status})`);
  }
  return response.text();
}

function looksLikeBlobUrl(value: string): boolean {
  return /^blob:/i.test(value);
}

function schedulePreviewWarmup(
  sections: readonly VitraBookSection[],
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

  if (typeof idleScheduler === 'function') {
    idleScheduler(() => {
      void runWarmup();
    });
    return;
  }

  window.setTimeout(() => {
    void runWarmup();
  }, 0);
}
