import type { MutableRefObject } from 'react';
import type { ContentProvider, SpineItemInfo } from '@/engine/core/contentProvider';
import { resolveReaderInternalLinkTarget } from '../readerInternalLink';

interface CreateTocJumpInternalLinkHandlerOptions {
    provider: ContentProvider;
    spineItemsRef: MutableRefObject<SpineItemInfo[]>;
    jumpToSpine: (spineIndex: number, searchText?: string) => Promise<void>;
}

export function createTocJumpInternalLinkHandler({
    provider,
    spineItemsRef,
    jumpToSpine,
}: CreateTocJumpInternalLinkHandlerOptions): (event: MouseEvent) => void {
    return (event: MouseEvent) => {
        const target = event.target;
        if (!(target instanceof Element)) return;

        const anchor = target.closest('a');
        if (!(anchor instanceof HTMLAnchorElement)) return;
        const targetSpine = resolveReaderInternalLinkTarget(anchor, provider);
        if (targetSpine === null) return;
        if (targetSpine < 0 || targetSpine >= spineItemsRef.current.length) return;

        event.preventDefault();
        event.stopPropagation();
        void jumpToSpine(targetSpine);
    };
}
