/**
 * textFinder — DOM text search & highlight utilities for BDISE scroll mode.
 * No epub.js CFI dependency; works directly with mounted chapter DOM.
 */

/**
 * Walk all text nodes inside `container` and locate the first occurrence of
 * `searchText`. Returns a Range spanning that text, or null if not found.
 */
export function findTextInDOM(
    container: HTMLElement,
    searchText: string,
): Range | null {
    if (!searchText) return null

    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
    const textNodes: Text[] = []
    let node: Text | null
    while ((node = walker.nextNode() as Text | null)) {
        textNodes.push(node)
    }

    // Build a concatenated string so we can handle text that spans nodes
    let accumulated = ''
    const nodeMap: { node: Text; start: number }[] = []
    for (const tn of textNodes) {
        nodeMap.push({ node: tn, start: accumulated.length })
        accumulated += tn.textContent ?? ''
    }

    const idx = accumulated.indexOf(searchText)
    if (idx === -1) return null

    const endIdx = idx + searchText.length

    // Find start node/offset
    let startNode: Text | null = null
    let startOffset = 0
    let endNode: Text | null = null
    let endOffset = 0

    for (let i = 0; i < nodeMap.length; i++) {
        const entry = nodeMap[i]
        const nodeEnd = entry.start + (entry.node.textContent?.length ?? 0)

        if (!startNode && idx < nodeEnd) {
            startNode = entry.node
            startOffset = idx - entry.start
        }
        if (endIdx <= nodeEnd) {
            endNode = entry.node
            endOffset = endIdx - entry.start
            break
        }
    }

    if (!startNode || !endNode) return null

    const range = document.createRange()
    range.setStart(startNode, startOffset)
    range.setEnd(endNode, endOffset)
    return range
}

/**
 * Wrap a Range with `<mark>` elements for visual highlighting.
 * Handles ranges that span multiple text nodes.
 */
export function highlightRange(
    range: Range,
    highlightId: string,
    color: string,
): void {
    // If the range is already highlighted, skip
    const existing = range.startContainer.parentElement?.closest(`[data-highlight-id="${highlightId}"]`)
    if (existing) return

    const contents = range.extractContents()
    const mark = document.createElement('mark')
    mark.setAttribute('data-highlight-id', highlightId)
    mark.style.background = color
    mark.style.borderRadius = '2px'
    mark.style.padding = '0'
    mark.appendChild(contents)
    range.insertNode(mark)
}
