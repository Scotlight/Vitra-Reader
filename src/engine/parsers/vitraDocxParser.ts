// ═══════════════════════════════════════════════════════
// DOCX Parser — 使用 mammoth 转换 HTML
// ═══════════════════════════════════════════════════════

import { VitraBaseParser } from '../core/vitraBaseParser';
import { VitraSectionSplitter } from '../core/vitraSectionSplitter';
import { createBlobSectionsFromChunks } from '../core/vitraSectionFactory';
import { stripBookExtension } from '../core/contentProvider';
import {
  upsertChapterIndex,
  searchBookIndex,
  clearBookIndex,
} from '../cache/searchIndexCache';
import type {
  VitraBook,
  VitraBookMetadata,
  VitraBookSection,
  VitraSearchResult,
  VitraTocItem,
} from '../types/vitraBook';

export class VitraDocxParser extends VitraBaseParser {
  async parse(): Promise<VitraBook> {
    const [html, metadata] = await Promise.all([
      this.convertToHtml(),
      this.extractMetadata(),
    ]);

    const chunks = VitraSectionSplitter.split(html);
    const { sections, destroy } = createBlobSectionsFromChunks(chunks, 'docx');
    const toc = this.buildTocFromChunks(chunks, sections);
    const bookId = `vitra-${this.filename}`;

    // 建立搜索索引（DOCX 只有一段 HTML，按 chunk 分段索引）
    chunks.forEach((chunk, i) => {
      upsertChapterIndex(bookId, i, chunk.html);
    });

    return {
      format: 'DOCX',
      metadata,
      sections,
      toc,
      layout: 'reflowable',
      direction: 'auto',
      resolveHref: (href: string) => this.resolveHref(href, sections),
      getCover: async () => null,
      search: (keyword: string): VitraSearchResult[] => searchBookIndex(bookId, keyword),
      destroy: () => {
        clearBookIndex(bookId);
        destroy();
      },
    };
  }

  private async convertToHtml(): Promise<string> {
    const mammoth = await import('mammoth');
    const result = await mammoth.convertToHtml({ arrayBuffer: this.buffer.slice(0) });
    return result.value;
  }

  private async extractMetadata(): Promise<VitraBookMetadata> {
    const fallbackTitle = stripBookExtension(this.filename);
    try {
      const { unzipSync } = await import('fflate');
      const data = new Uint8Array(this.buffer);
      const unzipped = unzipSync(data);

      const coreXmlData = unzipped['docProps/core.xml'];
      if (!coreXmlData) {
        return { title: fallbackTitle, author: ['未知作者'], cover: null };
      }

      const xmlText = new TextDecoder().decode(coreXmlData);
      const doc = new DOMParser().parseFromString(xmlText, 'text/xml');

      const dcText = (tag: string): string | undefined => {
        // Dublin Core 字段可能带命名空间前缀
        const el = doc.querySelector(tag)
          || doc.getElementsByTagNameNS('http://purl.org/dc/elements/1.1/', tag.replace('dc\\:', ''))[0];
        return el?.textContent?.trim() || undefined;
      };

      const cpText = (tag: string): string | undefined => {
        const el = doc.querySelector(tag)
          || doc.getElementsByTagNameNS('http://schemas.openxmlformats.org/package/2006/metadata/core-properties', tag.replace('cp\\:', ''))[0];
        return el?.textContent?.trim() || undefined;
      };

      const title = dcText('dc\\:title') || fallbackTitle;
      const creator = dcText('dc\\:creator');
      const description = dcText('dc\\:description');
      const language = dcText('dc\\:language');
      const subject = dcText('dc\\:subject');
      const lastModifiedBy = cpText('cp\\:lastModifiedBy');

      const author = creator
        ? creator.split(/[,;/、，]/g).map((s) => s.trim()).filter(Boolean)
        : ['未知作者'];

      return {
        title,
        author,
        description,
        language,
        subject: subject ? [subject] : undefined,
        publisher: lastModifiedBy,
        cover: null,
      };
    } catch {
      return { title: fallbackTitle, author: ['未知作者'], cover: null };
    }
  }

  private buildTocFromChunks(
    chunks: readonly { label: string; index: number }[],
    sections: readonly VitraBookSection[],
  ): VitraTocItem[] {
    return chunks.map((chunk) => ({
      label: chunk.label,
      href: sections[chunk.index]?.href ?? `docx-${chunk.index}`,
      children: [],
    }));
  }

  private resolveHref(
    href: string,
    sections: readonly VitraBookSection[],
  ): { index: number; anchor?: string } | null {
    const [rawHref, anchor] = href.split('#', 2);
    const index = sections.findIndex((s) => s.href === rawHref);
    if (index < 0) return null;
    return { index, anchor: anchor || undefined };
  }
}
