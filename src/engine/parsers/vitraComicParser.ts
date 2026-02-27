// ═══════════════════════════════════════════════════════
// 漫画 Parser — CBZ / CBT / CBR / CB7
// ═══════════════════════════════════════════════════════

import { VitraBaseParser } from '../core/vitraBaseParser';
import type {
  VitraBook,
  VitraBookFormat,
  VitraBookMetadata,
  VitraBookSection,
  VitraReadingDirection,
  VitraTocItem,
} from '../types/vitraBook';
import type { ArchiveLoader } from './comicArchiveAdapters';
import {
  createZipLoader,
  createTarLoader,
  createRarLoader,
  create7zLoader,
} from './comicArchiveAdapters';
import { parseComicInfo, type ComicMetadata } from './comicMetadata';

const IMAGE_EXTENSIONS = /\.(jpe?g|png|gif|webp|bmp|avif|svg)$/i;
const COMIC_INFO_FILE = 'comicinfo.xml';

function mimeFromFilename(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    bmp: 'image/bmp',
    avif: 'image/avif',
    svg: 'image/svg+xml',
  };
  return map[ext] ?? 'application/octet-stream';
}

function stripComicExtension(filename: string): string {
  return filename.replace(/\.(cbz|cbt|cbr|cb7)$/i, '');
}

// ───────────────────────── 基类 ─────────────────────────

abstract class VitraComicParserBase extends VitraBaseParser {
  protected abstract readonly comicFormat: VitraBookFormat;
  protected abstract createLoader(): ArchiveLoader;

  async parse(): Promise<VitraBook> {
    const loader = this.createLoader();
    const comicInfo = await this.tryLoadComicInfo(loader);
    const imageEntries = this.sortImageEntries(loader);

    if (imageEntries.length === 0) {
      loader.destroy();
      throw new Error(`漫画文件中未找到图片: ${this.filename}`);
    }

    const direction: VitraReadingDirection = comicInfo?.direction ?? 'ltr';
    const metadata = this.buildMetadata(comicInfo);
    const coverIndex = comicInfo?.coverPageIndex ?? 0;
    const { sections, destroy } = this.buildSections(imageEntries, loader);
    const toc = this.buildToc(imageEntries);
    const coverBlob = await this.extractCover(imageEntries, loader, coverIndex);

    return {
      format: this.comicFormat,
      metadata: { ...metadata, cover: coverBlob },
      sections,
      toc,
      layout: 'pre-paginated',
      direction,
      resolveHref: (href: string) => this.resolveHref(href, imageEntries),
      getCover: async () => coverBlob,
      search: () => [],
      destroy: () => {
        destroy();
        loader.destroy();
      },
    };
  }

  private sortImageEntries(loader: ArchiveLoader): string[] {
    return loader.entries
      .map((e) => e.filename)
      .filter((name) => IMAGE_EXTENSIONS.test(name))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
  }

  private async tryLoadComicInfo(loader: ArchiveLoader): Promise<ComicMetadata | null> {
    const match = loader.entries.find(
      (e) => e.filename.toLowerCase() === COMIC_INFO_FILE
        || e.filename.toLowerCase().endsWith('/' + COMIC_INFO_FILE),
    );
    if (!match) return null;
    try {
      const blob = await loader.loadBlob(match.filename);
      const text = await blob.text();
      return parseComicInfo(text);
    } catch {
      return null;
    }
  }

  private buildMetadata(comicInfo: ComicMetadata | null): VitraBookMetadata {
    const fallbackTitle = stripComicExtension(this.filename);
    const title = comicInfo?.title || comicInfo?.series || fallbackTitle || 'Untitled';
    const author: string[] = [];
    if (comicInfo?.writer) author.push(comicInfo.writer);
    if (comicInfo?.penciller && comicInfo.penciller !== comicInfo.writer) {
      author.push(comicInfo.penciller);
    }

    return {
      title,
      author: author.length > 0 ? author : ['未知作者'],
      publisher: comicInfo?.publisher,
      description: comicInfo?.summary,
      language: comicInfo?.language,
      cover: null,
    };
  }

  private buildSections(
    imageEntries: string[],
    loader: ArchiveLoader,
  ): { sections: VitraBookSection[]; destroy: () => void } {
    const urlCache = new Map<number, string>();
    const imgUrlCache = new Map<number, string>();

    const sections: VitraBookSection[] = imageEntries.map((filename, index) => {
      const entry = loader.entries.find((e) => e.filename === filename);
      const size = entry?.size ?? 0;

      return {
        id: index,
        href: `page-${index}`,
        size,
        load: async () => {
          const cached = urlCache.get(index);
          if (cached) return cached;

          const blob = await loader.loadBlob(filename);
          const mime = mimeFromFilename(filename);
          const typedBlob = new Blob([blob], { type: mime });
          const imgUrl = URL.createObjectURL(typedBlob);
          imgUrlCache.set(index, imgUrl);

          // 将图片包装为 HTML 页面
          const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
html,body{margin:0;padding:0;width:100%;height:100%;overflow:hidden;background:#000}
img{display:block;max-width:100%;max-height:100%;margin:auto;object-fit:contain}
</style></head><body><img src="${imgUrl}" alt="page ${index + 1}"/></body></html>`;

          const htmlBlob = new Blob([html], { type: 'text/html;charset=utf-8' });
          const blobUrl = URL.createObjectURL(htmlBlob);
          urlCache.set(index, blobUrl);
          return blobUrl;
        },
        unload: () => {
          const url = urlCache.get(index);
          if (url) {
            URL.revokeObjectURL(url);
            urlCache.delete(index);
          }
          const img = imgUrlCache.get(index);
          if (img) {
            URL.revokeObjectURL(img);
            imgUrlCache.delete(index);
          }
        },
      };
    });

    return {
      sections,
      destroy: () => {
        for (const url of urlCache.values()) URL.revokeObjectURL(url);
        urlCache.clear();
        for (const url of imgUrlCache.values()) URL.revokeObjectURL(url);
        imgUrlCache.clear();
      },
    };
  }

  private buildToc(imageEntries: string[]): VitraTocItem[] {
    // 漫画通常无目录，按页数生成简单导航
    return imageEntries.map((_, index) => ({
      label: `第 ${index + 1} 页`,
      href: `page-${index}`,
      children: [],
    }));
  }

  private async extractCover(
    imageEntries: string[],
    loader: ArchiveLoader,
    coverIndex: number,
  ): Promise<Blob | null> {
    const safeIndex = Math.min(coverIndex, imageEntries.length - 1);
    const coverFile = imageEntries[safeIndex];
    if (!coverFile) return null;
    try {
      const blob = await loader.loadBlob(coverFile);
      const mime = mimeFromFilename(coverFile);
      return new Blob([blob], { type: mime });
    } catch {
      return null;
    }
  }

  private resolveHref(
    href: string,
    imageEntries: string[],
  ): { index: number; anchor?: string } | null {
    // href 格式：page-N
    const match = href.match(/^page-(\d+)$/);
    if (match) {
      const index = parseInt(match[1], 10);
      if (index >= 0 && index < imageEntries.length) return { index };
    }
    return null;
  }
}

// ───────────────────────── CBZ ─────────────────────────

export class VitraCbzParser extends VitraComicParserBase {
  protected readonly comicFormat = 'CBZ' as const;
  protected createLoader(): ArchiveLoader {
    return createZipLoader(this.buffer);
  }
}

// ───────────────────────── CBT ─────────────────────────

export class VitraCbtParser extends VitraComicParserBase {
  protected readonly comicFormat = 'CBT' as const;
  protected createLoader(): ArchiveLoader {
    return createTarLoader(this.buffer);
  }
}

// ───────────────────────── CBR ─────────────────────────

export class VitraCbrParser extends VitraComicParserBase {
  protected readonly comicFormat = 'CBR' as const;
  protected createLoader(): ArchiveLoader {
    return createRarLoader(this.buffer);
  }
}

// ───────────────────────── CB7 ─────────────────────────

export class VitraCb7Parser extends VitraComicParserBase {
  protected readonly comicFormat = 'CB7' as const;
  protected createLoader(): ArchiveLoader {
    return create7zLoader(this.buffer);
  }
}
