// ═══════════════════════════════════════════════════════
// ComicInfo.xml 解析 — 提取漫画元数据
// ═══════════════════════════════════════════════════════

import type { VitraReadingDirection } from '../../types/vitraBook';

export interface ComicMetadata {
  readonly title?: string;
  readonly series?: string;
  readonly writer?: string;
  readonly penciller?: string;
  readonly publisher?: string;
  readonly summary?: string;
  readonly language?: string;
  readonly manga?: boolean;
  readonly direction: VitraReadingDirection;
  readonly coverPageIndex: number;
}

/**
 * 解析 ComicInfo.xml 字符串，提取元数据。
 * 参考 https://anansi-project.github.io/docs/comicinfo/documentation
 */
export function parseComicInfo(xml: string): ComicMetadata {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const root = doc.querySelector('ComicInfo');
  if (!root) {
    return { direction: 'ltr', coverPageIndex: 0 };
  }

  const text = (tag: string): string | undefined => {
    const el = root.querySelector(tag);
    const value = el?.textContent?.trim();
    return value || undefined;
  };

  const mangaValue = text('Manga');
  const isManga = mangaValue?.toLowerCase() === 'yes';

  return {
    title: text('Title'),
    series: text('Series'),
    writer: text('Writer'),
    penciller: text('Penciller'),
    publisher: text('Publisher'),
    summary: text('Summary'),
    language: text('LanguageISO'),
    manga: isManga,
    direction: isManga ? 'rtl' : 'ltr',
    coverPageIndex: parseCoverPageIndex(root),
  };
}

/**
 * 从 <Pages> 元素中查找 Type="FrontCover" 的页面索引
 */
function parseCoverPageIndex(root: Element): number {
  const pages = root.querySelectorAll('Pages > Page');
  for (const page of pages) {
    const type = page.getAttribute('Type');
    if (type === 'FrontCover') {
      const imageAttr = page.getAttribute('Image');
      if (imageAttr !== null) {
        const idx = parseInt(imageAttr, 10);
        if (!isNaN(idx)) return idx;
      }
    }
  }
  return 0;
}
