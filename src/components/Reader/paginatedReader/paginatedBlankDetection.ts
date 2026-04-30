import { isPaginatedHorizontalWindowHiddenElement } from './paginatedHorizontalWindowing'

interface BlankCandidateStyle {
    display: string
    visibility: string
    opacity: string
}

export function shouldSkipPaginatedBlankCandidate(
    element: HTMLElement,
    style: BlankCandidateStyle,
): boolean {
    const hiddenByHorizontalWindow = isPaginatedHorizontalWindowHiddenElement(element)
    return style.display === 'none'
        || (!hiddenByHorizontalWindow && style.visibility === 'hidden')
        || Number(style.opacity || 1) === 0
}
