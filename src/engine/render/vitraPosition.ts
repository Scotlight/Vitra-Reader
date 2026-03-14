/**
 * vitraPosition — DOM 路径 + 文本锚定位置序列化
 *
 * 提供比 PageBoundary (blockIndex 方式) 更稳定的位置定位：
 * - 基于 DOM 元素路径（tag index chain）+ 文本偏移
 * - 附带前后上下文文本片段用于模糊匹配恢复
 * - 在 reflow / 字体变更 / 重新渲染后仍能恢复位置
 */

// ─── 类型定义 ──────────────────────────────────────────

/** 稳定位置描述符 */
export interface VitraPosition {
    /** 章节在 spine 中的索引 */
    spineIndex: number
    /**
     * DOM 路径 — 从 root 到目标节点的 tag+childIndex 链
     * 例如: ["div:0", "p:3", "#text:0"]
     */
    domPath: string[]
    /** 目标 text node 内的字符偏移量 */
    textOffset: number
    /** 锚定位置前方的上下文文本（用于模糊匹配） */
    contextBefore: string
    /** 锚定位置后方的上下文文本（用于模糊匹配） */
    contextAfter: string
    /** 时间戳 */
    timestamp: number
}

/** 反序列化结果 */
export interface VitraPositionResult {
    /** 恢复到的 DOM node */
    node: Node
    /** node 内的偏移量 */
    offset: number
    /** 匹配精度：exact = 精确 DOM path 匹配, fuzzy = 上下文文本模糊匹配 */
    accuracy: 'exact' | 'fuzzy'
}

// ─── 常量 ──────────────────────────────────────────────

const CONTEXT_WINDOW = 48
const MIN_CONTEXT_LENGTH = 8
const MAX_DOM_PATH_DEPTH = 32

// ─── 序列化 ──────────────────────────────────────────────

/**
 * 构建从 root 到 target 的 DOM 路径。
 * 路径中每个分段为 "tagName:childIndex" 或 "#text:childIndex"。
 */
function buildDomPath(root: Node, target: Node): string[] | null {
    const path: string[] = []
    let current: Node | null = target

    while (current && current !== root) {
        const parent: Node | null = current.parentNode
        if (!parent) return null

        let childIndex = 0
        let sibling: Node | null = parent.firstChild
        while (sibling && sibling !== current) {
            childIndex++
            sibling = sibling.nextSibling
        }

        const tag = current.nodeType === Node.TEXT_NODE
            ? '#text'
            : (current as Element).tagName?.toLowerCase() || '#unknown'

        path.unshift(`${tag}:${childIndex}`)

        if (path.length > MAX_DOM_PATH_DEPTH) return null

        current = parent
    }

    return current === root ? path : null
}

/**
 * 提取 node 周围的上下文文本。
 */
function extractContext(
    root: HTMLElement,
    node: Node,
    offset: number,
): { before: string; after: string } {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    let accumulated = ''
    const nodeStarts: { node: Text; start: number }[] = []
    let textNode: Text | null

    while ((textNode = walker.nextNode() as Text | null)) {
        nodeStarts.push({ node: textNode, start: accumulated.length })
        accumulated += textNode.textContent ?? ''
    }

    // 找到 target node 在拼接字符串中的绝对偏移
    let absoluteOffset = 0
    for (const entry of nodeStarts) {
        if (entry.node === node || (node.nodeType !== Node.TEXT_NODE && node.contains(entry.node))) {
            absoluteOffset = entry.start + offset
            break
        }
    }

    const before = accumulated.slice(Math.max(0, absoluteOffset - CONTEXT_WINDOW), absoluteOffset)
    const after = accumulated.slice(absoluteOffset, absoluteOffset + CONTEXT_WINDOW)

    return { before, after }
}

/**
 * 从当前 DOM 位置生成稳定的位置描述符。
 *
 * @param root 章节容器根元素
 * @param node 目标 DOM 节点（通常是 text node）
 * @param offset 节点内的字符偏移
 * @param spineIndex 章节在 spine 中的索引
 */
export function serializePosition(
    root: HTMLElement,
    node: Node,
    offset: number,
    spineIndex: number,
): VitraPosition | null {
    const domPath = buildDomPath(root, node)
    if (!domPath) return null

    const context = extractContext(root, node, offset)

    return {
        spineIndex,
        domPath,
        textOffset: offset,
        contextBefore: context.before,
        contextAfter: context.after,
        timestamp: Date.now(),
    }
}

// ─── 反序列化 ──────────────────────────────────────────────

/**
 * 沿 DOM 路径精确定位。
 */
function walkDomPath(root: Node, path: string[]): Node | null {
    let current: Node = root

    for (const segment of path) {
        const colonIdx = segment.lastIndexOf(':')
        if (colonIdx < 0) return null

        const childIndex = Number(segment.slice(colonIdx + 1))
        if (!Number.isFinite(childIndex) || childIndex < 0) return null

        const children = current.childNodes
        if (childIndex >= children.length) return null

        current = children[childIndex]
    }

    return current
}

/**
 * 使用上下文文本进行模糊匹配定位。
 * 在 DOM path 失效（结构变化）时作为回退。
 */
function fuzzyMatchByContext(
    root: HTMLElement,
    contextBefore: string,
    contextAfter: string,
): VitraPositionResult | null {
    if (contextBefore.length < MIN_CONTEXT_LENGTH && contextAfter.length < MIN_CONTEXT_LENGTH) {
        return null
    }

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    let accumulated = ''
    const nodeStarts: { node: Text; start: number }[] = []
    let textNode: Text | null

    while ((textNode = walker.nextNode() as Text | null)) {
        nodeStarts.push({ node: textNode, start: accumulated.length })
        accumulated += textNode.textContent ?? ''
    }

    // 构建搜索字符串
    const searchStr = contextBefore + contextAfter
    if (!searchStr) return null

    const matchIdx = accumulated.indexOf(searchStr)
    if (matchIdx < 0) {
        // 再试 normalize whitespace
        const normalizedAccum = accumulated.replace(/\s+/g, ' ')
        const normalizedSearch = searchStr.replace(/\s+/g, ' ')
        const normMatchIdx = normalizedAccum.indexOf(normalizedSearch)
        if (normMatchIdx < 0) return null

        // 估算原始偏移（为简化，使用比例映射）
        const targetAbsoluteOffset = Math.round(
            (normMatchIdx + contextBefore.replace(/\s+/g, ' ').length)
            / normalizedAccum.length
            * accumulated.length,
        )
        return resolveNodeAtOffset(nodeStarts, targetAbsoluteOffset)
    }

    const targetAbsoluteOffset = matchIdx + contextBefore.length
    return resolveNodeAtOffset(nodeStarts, targetAbsoluteOffset)
}

/**
 * 根据全文绝对偏移定位到具体的 text node + 相对偏移。
 */
function resolveNodeAtOffset(
    nodeStarts: { node: Text; start: number }[],
    absoluteOffset: number,
): VitraPositionResult | null {
    for (let i = nodeStarts.length - 1; i >= 0; i--) {
        const entry = nodeStarts[i]
        if (absoluteOffset >= entry.start) {
            const nodeOffset = Math.min(
                absoluteOffset - entry.start,
                entry.node.textContent?.length ?? 0,
            )
            return {
                node: entry.node,
                offset: nodeOffset,
                accuracy: 'fuzzy',
            }
        }
    }
    return null
}

/**
 * 从位置描述符恢复 DOM 位置。
 *
 * 1. 首先尝试精确 DOM path 定位
 * 2. DOM path 失效时回退到上下文文本模糊匹配
 *
 * @param root 章节容器根元素
 * @param position 位置描述符
 */
export function deserializePosition(
    root: HTMLElement,
    position: VitraPosition,
): VitraPositionResult | null {
    // 方式 1: 精确 DOM path
    const exactNode = walkDomPath(root, position.domPath)
    if (exactNode) {
        // 验证偏移有效性
        if (exactNode.nodeType === Node.TEXT_NODE) {
            const maxOffset = (exactNode as Text).textContent?.length ?? 0
            const safeOffset = Math.min(position.textOffset, maxOffset)
            return { node: exactNode, offset: safeOffset, accuracy: 'exact' }
        }
        // 非 text node — 尝试找第一个 text child
        const walker = document.createTreeWalker(exactNode, NodeFilter.SHOW_TEXT)
        const firstText = walker.nextNode()
        if (firstText) {
            const maxOffset = (firstText as Text).textContent?.length ?? 0
            return { node: firstText, offset: Math.min(position.textOffset, maxOffset), accuracy: 'exact' }
        }
        return { node: exactNode, offset: 0, accuracy: 'exact' }
    }

    // 方式 2: 上下文文本模糊匹配
    return fuzzyMatchByContext(
        root,
        position.contextBefore,
        position.contextAfter,
    )
}

/**
 * 将位置恢复结果滚动到可视区域。
 */
export function scrollToPosition(
    scrollContainer: HTMLElement,
    result: VitraPositionResult,
    behavior: ScrollBehavior = 'instant',
): void {
    const targetNode = result.node
    const element = targetNode.nodeType === Node.TEXT_NODE
        ? targetNode.parentElement
        : targetNode as HTMLElement

    if (!element) return

    const containerRect = scrollContainer.getBoundingClientRect()
    const elementRect = element.getBoundingClientRect()
    const targetScrollTop = scrollContainer.scrollTop
        + (elementRect.top - containerRect.top)
        - containerRect.height * 0.15 // 往上留 15% 的视口空间

    scrollContainer.scrollTo({
        top: Math.max(0, targetScrollTop),
        behavior,
    })
}
