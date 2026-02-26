import type { VitraBookSection } from '../types/vitraBook';

export interface SectionChunkInput {
  readonly index: number;
  readonly label: string;
  readonly html: string;
}

export interface SectionFactoryResult {
  readonly sections: readonly VitraBookSection[];
  readonly destroy: () => void;
}

export function createBlobSectionsFromChunks(
  chunks: readonly SectionChunkInput[],
  hrefPrefix = 'section',
): SectionFactoryResult {
  const urlMap = new Map<number, string>();

  const sections = chunks.map((chunk) => {
    const blobSize = new Blob([chunk.html], { type: 'text/html;charset=utf-8' }).size;
    const href = `${hrefPrefix}-${chunk.index}`;

    const unload = () => {
      const existingUrl = urlMap.get(chunk.index);
      if (!existingUrl) return;
      URL.revokeObjectURL(existingUrl);
      urlMap.delete(chunk.index);
    };

    const load = async () => {
      const existingUrl = urlMap.get(chunk.index);
      if (existingUrl) return existingUrl;
      const blob = new Blob([chunk.html], { type: 'text/html;charset=utf-8' });
      const blobUrl = URL.createObjectURL(blob);
      urlMap.set(chunk.index, blobUrl);
      return blobUrl;
    };

    return {
      id: chunk.index,
      href,
      size: blobSize,
      load,
      unload,
    } satisfies VitraBookSection;
  });

  return {
    sections,
    destroy: () => {
      Array.from(urlMap.values()).forEach((blobUrl) => URL.revokeObjectURL(blobUrl));
      urlMap.clear();
    },
  };
}

