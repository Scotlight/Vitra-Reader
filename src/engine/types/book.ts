export type EngineBookFormat =
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

export type BookLayoutMode = 'reflowable' | 'pre-paginated';
export type ReadingDirection = 'ltr' | 'rtl' | 'auto';

export interface ParsedBookMetadata {
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

export interface BookSection {
  readonly id: string | number;
  readonly href: string;
  readonly load: () => Promise<string>;
  readonly unload: () => void;
  readonly size: number;
  readonly linear?: boolean;
  readonly pageSpread?: 'left' | 'right' | 'center';
  readonly styles?: readonly string[];
}

export interface BookTocItem {
  readonly label: string;
  readonly href: string;
  readonly children?: readonly BookTocItem[];
}

export interface BookSearchResult {
  readonly cfi: string;
  readonly excerpt: string;
}

export interface ParsedBook {
  readonly format: EngineBookFormat;
  readonly metadata: ParsedBookMetadata;
  readonly sections: readonly BookSection[];
  readonly toc: readonly BookTocItem[];
  readonly layout: BookLayoutMode;
  readonly direction: ReadingDirection;
  readonly resolveHref: (href: string) => { index: number; anchor?: string } | null;
  readonly getCover: () => Promise<Blob | null>;
  readonly isAssetUrlAvailable?: (url: string) => boolean;
  readonly releaseAssetSession?: () => void;
  readonly destroy: () => void;
  readonly search: (keyword: string) => BookSearchResult[];
}
