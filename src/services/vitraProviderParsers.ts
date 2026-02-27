import type {
  BookFormat as ProviderBookFormat,
  ContentProvider,
  SpineItemInfo,
  TocItem,
} from './contentProvider';
import { stripBookExtension } from './contentProvider';
import { createContentProvider, parseBookMetadata } from './contentProviderFactory';
import { VitraBaseParser } from './vitraBaseParser';
import {
  upsertChapterIndex,
  searchBookIndex,
  clearBookIndex,
} from './searchIndexCache';
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

const PROVIDER_FORMAT_MAP: Record<ProviderCompatibleFormat, ProviderBookFormat> = {
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
    const providerData = this.buffer.slice(0);
    const metadataData = this.buffer.slice(0);
    const [provider, rawMetadata] = await Promise.all([
      createContentProvider(providerFormat, providerData),
      parseBookMetadata(providerFormat, metadataData, this.filename),
    ]);

    await provider.init();
    const metadata = normalizeMetadata(rawMetadata as RawMetadata, this.filename);
    const coverBlob = toCoverBlob((rawMetadata as RawMetadata).cover);
    const spineItems = provider.getSpineItems();
    const toc = buildTocWithFallback(provider.getToc(), spineItems);
    const bookId = `vitra-${this.filename}`;
    const { sections, releaseAll } = createSections(spineItems, provider, bookId);

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

function createSections(
  spineItems: readonly SpineItemInfo[],
  provider: ContentProvider,
  bookId: string,
): {
  readonly sections: readonly VitraBookSection[];
  readonly releaseAll: () => void;
} {
  const cache = new Map<number, string>();
  const sizeCache = new Map<number, number>();
  const stylesCache = new Map<number, readonly string[]>();

  const releaseSection = (spineIndex: number): void => {
    const blobUrl = cache.get(spineIndex);
    if (blobUrl) {
      URL.revokeObjectURL(blobUrl);
      cache.delete(spineIndex);
    }
    sizeCache.delete(spineIndex);
    stylesCache.delete(spineIndex);
    provider.unloadChapter(spineIndex);
  };

  const sections = spineItems.map((spine) => ({
    id: spine.id || spine.index,
    href: spine.href,
    linear: spine.linear,
    get size() {
      return sizeCache.get(spine.index) ?? 0;
    },
    load: async () => {
      const cached = cache.get(spine.index);
      if (cached) return cached;

      const html = await provider.extractChapterHtml(spine.index);
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const blobUrl = URL.createObjectURL(blob);
      cache.set(spine.index, blobUrl);
      sizeCache.set(spine.index, blob.size);

      // 加载关联样式（EPUB 有实际 CSS，其他格式返回空数组）
      if (!stylesCache.has(spine.index)) {
        const styles = await provider.extractChapterStyles(spine.index);
        stylesCache.set(spine.index, styles);
      }

      // 建立搜索索引
      upsertChapterIndex(bookId, spine.index, html);

      return blobUrl;
    },
    unload: () => releaseSection(spine.index),
    get styles() {
      return stylesCache.get(spine.index) ?? [];
    },
  }));

  const releaseAll = (): void => {
    Array.from(cache.keys()).forEach((spineIndex) => releaseSection(spineIndex));
  };

  return { sections, releaseAll };
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
  return {
    format: input.format,
    metadata: input.metadata,
    toc: input.toc,
    sections: input.sections,
    layout: PRE_PAGINATED_FORMATS.has(input.format) ? 'pre-paginated' : 'reflowable',
    direction: 'auto',
    resolveHref: (href: string) => resolveHref(href, input.provider),
    getCover: async () => input.coverBlob,
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
