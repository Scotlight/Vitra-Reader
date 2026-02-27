export type VitraBookFormat =
  | 'EPUB'
  | 'MOBI'
  | 'AZW3'
  | 'AZW'
  | 'PDF'
  | 'DJVU'
  | 'TXT'
  | 'FB2'
  | 'DOCX'
  | 'MD'
  | 'HTML'
  | 'HTM'
  | 'XML'
  | 'XHTML'
  | 'MHTML'
  | 'CBZ'
  | 'CBT'
  | 'CBR'
  | 'CB7';

export type VitraLayoutMode = 'reflowable' | 'pre-paginated';
export type VitraReadingDirection = 'ltr' | 'rtl' | 'auto';

export interface VitraBookMetadata {
  readonly title: string;
  readonly author: readonly string[];
  readonly publisher?: string;
  readonly description?: string;
  readonly language?: string;
  readonly identifier?: string;
  readonly published?: string;
  readonly cover?: Blob | null;
  readonly subject?: readonly string[];
  readonly rights?: string;
}

export interface VitraBookSection {
  readonly id: string | number;
  readonly href: string;
  readonly load: () => Promise<string>;
  readonly unload: () => void;
  readonly size: number;
  readonly linear?: boolean;
  readonly pageSpread?: 'left' | 'right' | 'center';
  /** 章节关联的 CSS 样式表（EPUB 特有，其他格式为空数组） */
  readonly styles?: readonly string[];
}

export interface VitraTocItem {
  readonly label: string;
  readonly href: string;
  readonly children?: readonly VitraTocItem[];
}

export interface VitraSearchResult {
  /** 定位标识（格式：`bdise:{sectionIndex}:{offset}`） */
  readonly cfi: string;
  /** 匹配上下文摘要 */
  readonly excerpt: string;
}

export interface VitraBook {
  readonly format: VitraBookFormat;
  readonly metadata: VitraBookMetadata;
  readonly sections: readonly VitraBookSection[];
  readonly toc: readonly VitraTocItem[];
  readonly layout: VitraLayoutMode;
  readonly direction: VitraReadingDirection;
  readonly resolveHref: (href: string) => { index: number; anchor?: string } | null;
  readonly getCover: () => Promise<Blob | null>;
  readonly destroy: () => void;
  /** 全文搜索（基于内存索引，需先加载章节才可搜索该章节） */
  readonly search: (keyword: string) => VitraSearchResult[];
}

