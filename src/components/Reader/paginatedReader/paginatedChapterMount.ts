import { releaseMediaResources } from '@/utils/mediaResourceCleanup'

export type PaginatedChapterMountResult = 'already-mounted' | 'mounted'

function isOnlyMountedChild(container: HTMLElement, chapterNode: HTMLElement): boolean {
    return container.childElementCount === 1 && container.firstElementChild === chapterNode
}

export function mountPaginatedChapterNode(
    container: HTMLElement,
    chapterNode: HTMLElement,
): PaginatedChapterMountResult {
    if (chapterNode.parentElement === container && isOnlyMountedChild(container, chapterNode)) {
        return 'already-mounted'
    }

    releaseMediaResources(container)
    container.appendChild(chapterNode)
    return 'mounted'
}
