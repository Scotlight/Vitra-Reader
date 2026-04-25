import { useState, useEffect } from 'react';
import type { ContentProvider, SpineItemInfo } from '../../../engine/core/contentProvider';
import type { ScrollReaderRefs } from './useScrollReaderRefs';

export function useSpineItems(
    refs: ScrollReaderRefs,
    provider: ContentProvider,
): SpineItemInfo[] {
    const { spineItemsRef } = refs;
    const [spineItems, setSpineItems] = useState<SpineItemInfo[]>([]);

    useEffect(() => {
        const items = provider.getSpineItems();
        spineItemsRef.current = items;
        setSpineItems(items);
    }, [provider]);

    return spineItems;
}
