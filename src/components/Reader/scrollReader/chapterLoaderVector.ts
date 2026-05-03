import { buildChapterMetaVector } from '@/engine/render/metaVectorManager';
import type { ChapterMetaVector } from '@/engine/types/vectorRender';
import { createWindowedVectorChapterShell, type ReaderStyleConfig } from '../ShadowRenderer';
import type { LoadedChapter } from './scrollReaderTypes';

export function buildReadyWindowedVectorChapter(options: {
    chapterId: string;
    spineIndex: number;
    baseChapter: LoadedChapter;
    externalStyles: string[];
    readerStyles: ReaderStyleConfig;
    segmentMetas: NonNullable<LoadedChapter['segmentMetas']>;
}): { chapter: LoadedChapter; vector: ChapterMetaVector } {
    const { node, height } = createWindowedVectorChapterShell({
        chapterId: options.chapterId,
        externalStyles: options.externalStyles,
        readerStyles: options.readerStyles,
        segmentMetas: options.segmentMetas,
    });
    return {
        chapter: {
            ...options.baseChapter,
            domNode: node,
            height,
            status: 'ready',
        },
        vector: buildChapterMetaVector(options.chapterId, options.spineIndex, options.segmentMetas),
    };
}
