/**
 * 分批追加 HTML 到容器。
 *
 * 用于大章节 innerHTML 一次性写入会阻塞主线程的场景：把 HTML 解析成
 * DOM 后按批次 appendChild，批与批之间 await yieldToBrowser() 让浏览器
 * 能插入 layout / paint。
 *
 * 安全性：DOMParser 解析失败时回退到 textContent，避免直接 innerHTML
 * 触发浏览器宽松解析（某些畸形 HTML 会构造危险标签）。
 *
 * - appendHtmlContentChunked: 单段 HTML 分批追加
 * - appendHtmlFragmentsChunked: 多段顺序追加
 * - normalizeHtmlFragments: 把 { htmlFragments?, htmlContent, segmentMetas? }
 *   归一为可追加的 readonly string[]
 */

import type { SegmentMeta } from '@/engine/types/vectorRender';
import {
    CHUNK_APPEND_BATCH_SIZE,
    CHUNK_APPEND_MIN_BATCH_SIZE,
} from './shadowRendererConstants';
import { yieldToBrowser } from './yieldScheduling';

export async function appendHtmlContentChunked(
    container: HTMLElement,
    html: string,
    batchSize: number = CHUNK_APPEND_BATCH_SIZE,
): Promise<void> {
    const parser = new DOMParser();
    const parsed = parser.parseFromString(`<body>${html}</body>`, 'text/html');
    const sourceBody = parsed.body;

    if (!sourceBody || sourceBody.childNodes.length === 0) {
        container.textContent = html;
        return;
    }

    const nodes = Array.from(sourceBody.childNodes);
    const limit = Math.max(CHUNK_APPEND_MIN_BATCH_SIZE, batchSize);

    for (let offset = 0; offset < nodes.length; offset += limit) {
        const fragment = document.createDocumentFragment();
        const chunk = nodes.slice(offset, offset + limit);
        chunk.forEach((node) => {
            fragment.appendChild(node.cloneNode(true));
        });
        container.appendChild(fragment);
        if (offset + limit < nodes.length) {
            await yieldToBrowser();
        }
    }
}

export async function appendHtmlFragmentsChunked(
    container: HTMLElement,
    htmlFragments: readonly string[],
): Promise<void> {
    if (htmlFragments.length === 0) return;

    for (let index = 0; index < htmlFragments.length; index += 1) {
        const fragmentHtml = htmlFragments[index];
        if (!fragmentHtml) continue;
        await appendHtmlContentChunked(container, fragmentHtml);
        if (index + 1 < htmlFragments.length) {
            await yieldToBrowser();
        }
    }
}

export function normalizeHtmlFragments(
    htmlFragments: readonly string[] | undefined,
    htmlContent: string,
    segmentMetas?: readonly SegmentMeta[],
): readonly string[] {
    if (!htmlFragments || htmlFragments.length === 0) {
        if (segmentMetas && segmentMetas.length > 0) {
            return segmentMetas
                .map((segment) => segment.htmlContent)
                .filter((fragment) => fragment.length > 0);
        }
        return [htmlContent];
    }
    return htmlFragments.filter((fragment) => fragment.length > 0);
}
