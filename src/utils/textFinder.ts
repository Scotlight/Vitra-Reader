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

    // Try exact match first
    let idx = accumulated.indexOf(searchText)
    let endIdx = idx === -1 ? -1 : idx + searchText.length

    // Fallback: normalized whitespace match
    if (idx === -1) {
        // Build mapping from normalized index -> original index
        const origIndices: number[] = []
        let prevWasSpace = false
        for (let i = 0; i < accumulated.length; i++) {
            const isSpace = /\s/.test(accumulated[i])
            if (isSpace && prevWasSpace) continue
            origIndices.push(i)
            prevWasSpace = isSpace
        }
        const normalizedAccum = accumulated.replace(/\s+/g, ' ')
        const normalizedSearch = searchText.replace(/\s+/g, ' ')
        const normIdx = normalizedAccum.indexOf(normalizedSearch)
        if (normIdx === -1) return null

        idx = origIndices[normIdx] ?? 0
        const normEnd = normIdx + normalizedSearch.length
        // endIdx: if normEnd is past the mapping, use accumulated.length
        endIdx = normEnd < origIndices.length
            ? origIndices[normEnd] ?? accumulated.length
            : accumulated.length
    }

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
 * 跨段搜索文本 — 在多个 segment DOM 元素中搜索连续文本。
 * 当文本横跨 segment 边界时，仍然可以正确定位。
 *
 * @param segments 按顺序排列的 segment DOM 元素
 * @param searchText 要搜索的文本
 * @returns Range 数组（可能跨越多个 segment）
 */
export function findTextAcrossSegments(
    segments: HTMLElement[],
    searchText: string,
): Range[] | null {
    if (!searchText || segments.length === 0) return null

    // 首先在每个单独的 segment 内搜索
    for (const segment of segments) {
        const range = findTextInDOM(segment, searchText)
        if (range) return [range]
    }

    // 跨段搜索：拼接所有 text nodes
    const allTextNodes: { node: Text; segmentIndex: number; start: number }[] = []
    let accumulated = ''

    for (let segIdx = 0; segIdx < segments.length; segIdx++) {
        const walker = document.createTreeWalker(segments[segIdx], NodeFilter.SHOW_TEXT)
        let textNode: Text | null
        while ((textNode = walker.nextNode() as Text | null)) {
            allTextNodes.push({
                node: textNode,
                segmentIndex: segIdx,
                start: accumulated.length,
            })
            accumulated += textNode.textContent ?? ''
        }
    }

    const idx = accumulated.indexOf(searchText)
    if (idx === -1) {
        // Fallback: normalized whitespace
        const normalizedAccum = accumulated.replace(/\s+/g, ' ')
        const normalizedSearch = searchText.replace(/\s+/g, ' ')
        const normIdx = normalizedAccum.indexOf(normalizedSearch)
        if (normIdx === -1) return null
    }

    const matchStart = idx >= 0 ? idx : 0
    const matchEnd = matchStart + searchText.length

    // 定位 start 和 end 的 text node
    let startNode: Text | null = null
    let startOffset = 0
    let endNode: Text | null = null
    let endOffset = 0
    let startSegmentIdx = -1
    let endSegmentIdx = -1

    for (const entry of allTextNodes) {
        const nodeEnd = entry.start + (entry.node.textContent?.length ?? 0)

        if (!startNode && matchStart < nodeEnd) {
            startNode = entry.node
            startOffset = matchStart - entry.start
            startSegmentIdx = entry.segmentIndex
        }
        if (matchEnd <= nodeEnd) {
            endNode = entry.node
            endOffset = matchEnd - entry.start
            endSegmentIdx = entry.segmentIndex
            break
        }
    }

    if (!startNode || !endNode) return null

    // 如果在同一个 segment 内，返回单个 Range
    if (startSegmentIdx === endSegmentIdx) {
        const range = document.createRange()
        range.setStart(startNode, startOffset)
        range.setEnd(endNode, endOffset)
        return [range]
    }

    // 跨段：为每个涉及的 segment 创建独立 Range
    const ranges: Range[] = []

    for (let segIdx = startSegmentIdx; segIdx <= endSegmentIdx; segIdx++) {
        const segTextNodes = allTextNodes.filter((e) => e.segmentIndex === segIdx)
        if (segTextNodes.length === 0) continue

        const range = document.createRange()

        if (segIdx === startSegmentIdx) {
            // 起始段：从 startNode 到段末
            range.setStart(startNode, startOffset)
            const lastNode = segTextNodes[segTextNodes.length - 1].node
            range.setEnd(lastNode, lastNode.textContent?.length ?? 0)
        } else if (segIdx === endSegmentIdx) {
            // 终止段：从段首到 endNode
            range.setStart(segTextNodes[0].node, 0)
            range.setEnd(endNode, endOffset)
        } else {
            // 中间段：全选
            range.setStart(segTextNodes[0].node, 0)
            const lastNode = segTextNodes[segTextNodes.length - 1].node
            range.setEnd(lastNode, lastNode.textContent?.length ?? 0)
        }

        ranges.push(range)
    }

    return ranges.length > 0 ? ranges : null
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

/**
 * 移除指定 ID 的高亮
 */
export function removeHighlight(
    container: HTMLElement,
    highlightId: string,
): void {
    const marks = container.querySelectorAll(`mark[data-highlight-id="${highlightId}"]`)
    marks.forEach((mark) => {
        const parent = mark.parentNode
        if (!parent) return
        while (mark.firstChild) {
            parent.insertBefore(mark.firstChild, mark)
        }
        parent.removeChild(mark)
        parent.normalize()
    })
}

/**
 * 高亮描述符 — 用于序列化存储和水合后恢复
 */
export interface HighlightDescriptor {
    id: string
    color: string
    /** 高亮锚定文本（用于模糊匹配恢复） */
    text: string
    /** 高亮前方的上下文文本 */
    contextBefore: string
    /** 高亮后方的上下文文本 */
    contextAfter: string
}

const CONTEXT_WINDOW = 32

/**
 * 从当前高亮 mark 元素创建高亮描述符（用于持久化）
 */
export function createHighlightDescriptor(
    container: HTMLElement,
    highlightId: string,
    color: string,
): HighlightDescriptor | null {
    const marks = container.querySelectorAll(`mark[data-highlight-id="${highlightId}"]`)
    if (marks.length === 0) return null

    const text = Array.from(marks).map((m) => m.textContent || '').join('')

    // 提取上下文

    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
    let fullText = ''
    const nodeStarts: { node: Text; start: number }[] = []
    let textNode: Text | null
    while ((textNode = walker.nextNode() as Text | null)) {
        nodeStarts.push({ node: textNode, start: fullText.length })
        fullText += textNode.textContent ?? ''
    }

    // 找到 mark 内的文本在拼接字符串中的位置
    const markIdx = fullText.indexOf(text)
    const contextBefore = markIdx > 0
        ? fullText.slice(Math.max(0, markIdx - CONTEXT_WINDOW), markIdx)
        : ''
    const contextAfter = markIdx >= 0
        ? fullText.slice(markIdx + text.length, markIdx + text.length + CONTEXT_WINDOW)
        : ''

    return { id: highlightId, color, text, contextBefore, contextAfter }
}

/**
 * 水合后恢复高亮 — 根据描述符在容器中重新搜索并应用高亮
 */
export function restoreHighlightsAfterHydration(
    container: HTMLElement,
    descriptors: HighlightDescriptor[],
): void {
    for (const desc of descriptors) {
        // 已存在的高亮跳过
        if (container.querySelector(`mark[data-highlight-id="${desc.id}"]`)) continue

        // 尝试精确匹配
        let range = findTextInDOM(container, desc.text)

        // 如果有多个匹配，用上下文进行消歧
        if (range && desc.contextBefore) {
            const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
            let fullText = ''
            let tn: Text | null
            while ((tn = walker.nextNode() as Text | null)) {
                fullText += tn.textContent ?? ''
            }

            const contextual = desc.contextBefore + desc.text + desc.contextAfter
            const contextIdx = fullText.indexOf(contextual)
            if (contextIdx >= 0) {
                const actualStart = contextIdx + desc.contextBefore.length
                const actualEnd = actualStart + desc.text.length
                // 使用更精确的位置创建 range
                const preciseRange = findTextInDOM(container, fullText.slice(actualStart, actualEnd))
                if (preciseRange) range = preciseRange
            }
        }

        if (range) {
            highlightRange(range, desc.id, desc.color)
        }
    }
}
