// ═══════════════════════════════════════════════════════
// DJVU Parser — 骨架实现（等待许可证确认）
// ═══════════════════════════════════════════════════════

import { VitraBaseParser } from '../vitraBaseParser';
import type {
  VitraBook,
  VitraBookMetadata,
  VitraBookSection,
} from '../../types/vitraBook';

function stripDjvuExtension(filename: string): string {
  return filename.replace(/\.djvu?$/i, '');
}

export class VitraDjvuParser extends VitraBaseParser {
  async parse(): Promise<VitraBook> {
    // 尝试动态加载 djvu.js
    let djvuModule: DjvuModule;
    try {
      djvuModule = await import(/* @vite-ignore */ 'djvu.js') as DjvuModule;
    } catch {
      throw new Error(
        'DJVU 支持需要安装 djvu.js（GPL-3.0 许可证）:\n'
        + '  npm install djvu.js\n\n'
        + '注意：djvu.js 使用 GPL-3.0 许可证，可能对您的项目有传染性影响。',
      );
    }

    return this.parseWithDjvu(djvuModule);
  }

  private async parseWithDjvu(djvuModule: DjvuModule): Promise<VitraBook> {
    const DjVuDocument = djvuModule.DjVuDocument ?? djvuModule.default?.DjVuDocument;
    if (!DjVuDocument) {
      throw new Error('djvu.js 模块加载异常：未找到 DjVuDocument 导出');
    }

    const doc = new DjVuDocument(this.buffer);
    const pageCount = doc.getPageCount?.() ?? 0;
    if (pageCount === 0) {
      throw new Error(`DJVU 文件无可渲染页面: ${this.filename}`);
    }

    const metadata = this.buildMetadata(pageCount);
    const { sections, destroy } = this.buildSections(doc, pageCount);

    return {
      format: 'DJVU',
      metadata,
      sections,
      toc: sections.map((_, i) => ({
        label: `第 ${i + 1} 页`,
        href: `djvu-page-${i}`,
        children: [],
      })),
      layout: 'pre-paginated',
      direction: 'ltr',
      resolveHref: (href: string) => {
        const match = href.match(/^djvu-page-(\d+)$/);
        if (match) {
          const index = parseInt(match[1], 10);
          if (index >= 0 && index < pageCount) return { index };
        }
        return null;
      },
      getCover: async () => null,
      destroy,
    };
  }

  private buildMetadata(pageCount: number): VitraBookMetadata {
    return {
      title: stripDjvuExtension(this.filename),
      author: ['未知作者'],
      description: `DJVU 文档，共 ${pageCount} 页`,
      cover: null,
    };
  }

  private buildSections(
    doc: DjvuDocumentInstance,
    pageCount: number,
  ): { sections: VitraBookSection[]; destroy: () => void } {
    const urlCache = new Map<number, string>();

    const sections: VitraBookSection[] = Array.from({ length: pageCount }, (_, index) => ({
      id: index,
      href: `djvu-page-${index}`,
      size: 0,
      load: async () => {
        const cached = urlCache.get(index);
        if (cached) return cached;

        const imageData = await doc.getPage(index);
        const canvas = document.createElement('canvas');
        canvas.width = imageData.width;
        canvas.height = imageData.height;
        const ctx = canvas.getContext('2d')!;
        ctx.putImageData(imageData, 0, 0);

        const pngBlob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob((blob) => {
            if (blob) resolve(blob);
            else reject(new Error('Canvas toBlob failed'));
          }, 'image/png');
        });

        const imgUrl = URL.createObjectURL(pngBlob);
        const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
html,body{margin:0;padding:0;width:100%;height:100%;overflow:hidden;background:#fff}
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
      },
    }));

    return {
      sections,
      destroy: () => {
        for (const url of urlCache.values()) URL.revokeObjectURL(url);
        urlCache.clear();
      },
    };
  }
}

// ───────────────────────── djvu.js 类型声明 ─────────────────────────

interface DjvuDocumentInstance {
  getPageCount?(): number;
  getPage(index: number): Promise<ImageData>;
}

interface DjvuDocumentConstructor {
  new(buffer: ArrayBuffer): DjvuDocumentInstance;
}

interface DjvuModule {
  DjVuDocument?: DjvuDocumentConstructor;
  default?: { DjVuDocument?: DjvuDocumentConstructor };
}
