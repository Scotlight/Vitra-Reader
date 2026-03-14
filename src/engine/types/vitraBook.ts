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
  readonly styles?: readonly string[];
}

export interface VitraTocItem {
  readonly label: string;
  readonly href: string;
  readonly children?: readonly VitraTocItem[];
}

export interface VitraSearchResult {
  readonly cfi: string;
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
  readonly isAssetUrlAvailable?: (url: string) => boolean;
  readonly releaseAssetSession?: () => void;
  readonly destroy: () => void;
  readonly search: (keyword: string) => VitraSearchResult[];
}
