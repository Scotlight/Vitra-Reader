import { findAncestorChapterSpineIndex } from './scrollChapterViewport'

export interface ScrollSelectionState {
    readonly spineIndex: number
    readonly text: string
    readonly x: number
    readonly y: number
}

export function resolveScrollSelectionState(
    selection: Selection | null,
    viewport: HTMLElement | null,
    fallbackSpineIndex: number = -1,
): ScrollSelectionState | null {
    if (!selection || !viewport) return null

    const text = selection.toString().trim()
    if (!text || selection.rangeCount === 0) return null

    const range = selection.getRangeAt(0)
    const rect = range.getBoundingClientRect()
    const detectedSpineIndex = findAncestorChapterSpineIndex(range.startContainer, viewport)
    const spineIndex = detectedSpineIndex >= 0 ? detectedSpineIndex : fallbackSpineIndex

    return {
        spineIndex,
        text,
        x: rect.left + rect.width / 2,
        y: rect.top - 10,
    }
}
