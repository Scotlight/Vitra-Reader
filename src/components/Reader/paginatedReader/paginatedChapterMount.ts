import { releaseMediaResources } from '@/utils/mediaResourceCleanup'

export type PaginatedChapterMountResult = 'already-mounted' | 'mounted'

function isOnlyMountedChild(container: HTMLElement, chapterNode: HTMLElement): boolean {
    return container.childElementCount === 1 && container.firstElementChild === chapterNode
}

function detachMountedChapter(container: HTMLElement, chapterNode: HTMLElement): boolean {
    if (chapterNode.parentElement !== container) return false
    container.removeChild(chapterNode)
    return true
}

export function mountPaginatedChapterNode(
    container: HTMLElement,
    chapterNode: HTMLElement,
): PaginatedChapterMountResult {
    if (chapterNode.parentElement === container && isOnlyMountedChild(container, chapterNode)) {
        return 'already-mounted'
    }

    const shouldRestoreMountedChapter = detachMountedChapter(container, chapterNode)
    releaseMediaResources(container)
    container.appendChild(chapterNode)
    return shouldRestoreMountedChapter ? 'already-mounted' : 'mounted'
}
