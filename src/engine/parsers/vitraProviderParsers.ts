import type {
  ContentProvider,
  SpineItemInfo,
  TocItem,
} from '../core/contentProvider';
import { stripBookExtension } from '../core/contentProvider';
import {
  createProviderForBackedFormat,
  parseMetadataForBackedFormat,
  type ProviderBackedFormat,
} from '../core/providerRegistry';
import { VitraBaseParser } from '../core/vitraBaseParser';
import {
  searchBookIndex,
  clearBookIndex,
} from '../cache/searchIndexCache';
import { createProviderSections } from './providerSectionFactory';
import type {
  VitraBook,
  VitraBookFormat,
  VitraBookMetadata,
  VitraBookSection,
  VitraSearchResult,
  VitraTocItem,
} from '../types/vitraBook';

type ProviderCompatibleFormat =
  | 'EPUB'
  | 'PDF'
  | 'TXT'
  | 'MOBI'
  | 'AZW'
  | 'AZW3'
  | 'HTML'
  | 'HTM'
  | 'XHTML'
  | 'XML'
  | 'MHTML'
  | 'MD'
  | 'FB2';

const PROVIDER_FORMAT_MAP: Record<ProviderCompatibleFormat, ProviderBackedFormat> = {
  EPUB: 'epub',
  PDF: 'pdf',
  TXT: 'txt',
  MOBI: 'mobi',
  AZW: 'azw',
  AZW3: 'azw3',
  HTML: 'html',
  HTM: 'html',
  XHTML: 'html',
  XML: 'xml',
  MHTML: 'html',
  MD: 'md',
  FB2: 'fb2',
};

const PRE_PAGINATED_FORMATS: ReadonlySet<VitraBookFormat> = new Set(['PDF']);

interface RawMetadata {
  readonly title?: string;
  readonly author?: string;
  readonly description?: string;
  readonly cover?: unknown;
  readonly publisher?: string;
  readonly language?: string;
}

export class VitraProviderBackedParser extends VitraBaseParser {
  private readonly format: ProviderCompatibleFormat;

  constructor(buffer: ArrayBuffer, filename: string, format: ProviderCompatibleFormat) {
    super(buffer, filename);
    this.format = format;
  }

  async parse(): Promise<VitraBook> {
    const providerFormat = PROVIDER_FORMAT_MAP[this.format];
    // Provider 和 metadata 解析器只读 buffer，无需复制
    // 直接传递原始 buffer 避免大文件（如 PDF）的 CPU 密集型复制操作
    const [provider, rawMetadata] = await Promise.all([
      createProviderForBackedFormat(providerFormat, this.buffer),
      parseMetadataForBackedFormat(providerFormat, this.buffer, this.filename),
    ]);

    await provider.init();
    const metadata = normalizeMetadata(rawMetadata as RawMetadata, this.filename);
    const coverBlob = toCoverBlob((rawMetadata as RawMetadata).cover);
    const spineItems = provider.getSpineItems();
    const toc = buildTocWithFallback(provider.getToc(), spineItems);
    const bookId = `vitra-${this.filename}`;
    const { sections, releaseAll } = createProviderSections({
      spineItems,
      provider,
      bookId,
      format: this.format,
    });

    return createBookObject({
      format: this.format,
      metadata: { ...metadata, cover: coverBlob },
      toc,
      sections,
      provider,
      coverBlob,
      releaseSections: releaseAll,
      bookId,
    });
  }
}

export class VitraEpubParser extends VitraProviderBackedParser {
  constructor(buffer: ArrayBuffer, filename: string) { super(buffer, filename, 'EPUB'); }
}
export class VitraPdfParser extends VitraProviderBackedParser {
  constructor(buffer: ArrayBuffer, filename: string) { super(buffer, filename, 'PDF'); }
}
export class VitraTxtParser extends VitraProviderBackedParser {
  constructor(buffer: ArrayBuffer, filename: string) { super(buffer, filename, 'TXT'); }
}
export class VitraMobiParser extends VitraProviderBackedParser {
  constructor(buffer: ArrayBuffer, filename: string) { super(buffer, filename, 'MOBI'); }
}
export class VitraAzwParser extends VitraProviderBackedParser {
  constructor(buffer: ArrayBuffer, filename: string) { super(buffer, filename, 'AZW'); }
}
export class VitraAzw3Parser extends VitraProviderBackedParser {
  constructor(buffer: ArrayBuffer, filename: string) { super(buffer, filename, 'AZW3'); }
}
export class VitraHtmlParser extends VitraProviderBackedParser {
  constructor(buffer: ArrayBuffer, filename: string, format: 'HTML' | 'HTM' | 'XHTML' | 'MHTML' = 'HTML') {
    super(buffer, filename, format);
  }
}
export class VitraXmlParser extends VitraProviderBackedParser {
  constructor(buffer: ArrayBuffer, filename: string) { super(buffer, filename, 'XML'); }
}
export class VitraMdParser extends VitraProviderBackedParser {
  constructor(buffer: ArrayBuffer, filename: string) { super(buffer, filename, 'MD'); }
}
export class VitraFb2Parser extends VitraProviderBackedParser {
  constructor(buffer: ArrayBuffer, filename: string) { super(buffer, filename, 'FB2'); }
}

function normalizeMetadata(raw: RawMetadata, filename: string): VitraBookMetadata {
  const fallbackTitle = stripBookExtension(filename);
  const title = (raw.title || '').trim() || fallbackTitle || 'Untitled';
  const author = normalizeAuthor(raw.author);
  return {
    title,
    author,
    description: raw.description || '',
    publisher: raw.publisher || undefined,
    language: raw.language || undefined,
    cover: null,
  };
}

function normalizeAuthor(author: string | undefined): readonly string[] {
  const raw = (author || '').trim();
  if (!raw) return ['未知作者'];
  const parts = raw.split(/[,;/、，]/g).map((item) => item.trim()).filter(Boolean);
  return parts.length > 0 ? parts : [raw];
}

function toCoverBlob(cover: unknown): Blob | null {
  if (typeof cover !== 'string') return null;
  if (!cover.startsWith('data:')) return null;

  const splitIndex = cover.indexOf(',');
  if (splitIndex < 0) return null;
  const head = cover.slice(0, splitIndex);
  const payload = cover.slice(splitIndex + 1);
  const mimeMatch = head.match(/^data:([^;]+);base64$/i);
  if (!mimeMatch) return null;

  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mimeMatch[1] || 'application/octet-stream' });
}

function normalizeToc(items: readonly TocItem[]): readonly VitraTocItem[] {
  return items.map((item) => ({
    label: item.label,
    href: item.href,
    children: item.subitems ? normalizeToc(item.subitems) : [],
  }));
}

function buildTocWithFallback(
  items: readonly TocItem[],
  spineItems: readonly SpineItemInfo[],
): readonly VitraTocItem[] {
  const normalized = normalizeToc(items).filter((item) => item.href && item.label);
  if (normalized.length > 0) {
    return normalized;
  }
  return spineItems.map((spine, index) => ({
    label: labelFromSpineHref(spine.href, index),
    href: spine.href,
    children: [],
  }));
}

function labelFromSpineHref(href: string, index: number): string {
  const fallback = `Chapter ${index + 1}`;
  if (!href) return fallback;
  const [pathPart] = href.split('#', 2);
  const filePart = pathPart.split('/').pop() || '';
  const decoded = decodeSafe(filePart);
  const withoutExt = decoded.replace(/\.[^.]+$/, '');
  const cleaned = withoutExt
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || fallback;
}

function decodeSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

interface CreateBookObjectInput {
  readonly format: VitraBookFormat;
  readonly metadata: VitraBookMetadata;
  readonly toc: readonly VitraTocItem[];
  readonly sections: readonly VitraBookSection[];
  readonly provider: ContentProvider;
  readonly coverBlob: Blob | null;
  readonly releaseSections: () => void;
  readonly bookId: string;
}

function createBookObject(input: CreateBookObjectInput): VitraBook {
  const isAssetUrlAvailable = input.provider.isAssetUrlAvailable
    ? (url: string) => input.provider.isAssetUrlAvailable?.(url) ?? true
    : undefined
  const releaseAssetSession = input.provider.releaseAssetSession
    ? () => input.provider.releaseAssetSession?.()
    : undefined

  return {
    format: input.format,
    metadata: input.metadata,
    toc: input.toc,
    sections: input.sections,
    layout: PRE_PAGINATED_FORMATS.has(input.format) ? 'pre-paginated' : 'reflowable',
    direction: 'auto',
    resolveHref: (href: string) => resolveHref(href, input.provider),
    getCover: async () => input.coverBlob,
    isAssetUrlAvailable,
    releaseAssetSession,
    search: (keyword: string): VitraSearchResult[] => searchBookIndex(input.bookId, keyword),
    destroy: () => {
      input.releaseSections();
      clearBookIndex(input.bookId);
      input.provider.destroy();
    },
  };
}

function resolveHref(
  href: string,
  provider: ContentProvider,
): { index: number; anchor?: string } | null {
  if (!href) return null;
  const [rawHref, anchor] = href.split('#', 2);
  const baseHref = rawHref || href;
  const index = provider.getSpineIndexByHref(baseHref);
  if (index < 0) return null;
  return { index, anchor: anchor || undefined };
}
