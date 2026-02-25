/**
 * epubContentExtractor.ts
 * 将 epub.js 仅作为 "解压 + XML 解析" 工具的封装层
 * BDISE 引擎通过此模块获取章节原始 HTML
 */
import { Book } from 'epubjs';

export interface SpineItemInfo {
    index: number;
    href: string;
    id: string;
    linear: boolean;
}

/**
 * 获取 spine 列表
 */
export function getSpineItems(book: Book): SpineItemInfo[] {
    const bookAny = book as any;
    const spineItems = bookAny?.spine?.spineItems;
    if (!Array.isArray(spineItems)) return [];

    return spineItems.map((item: any, index: number) => ({
        index,
        href: item.href || '',
        id: item.idref || item.id || `spine-${index}`,
        linear: item.linear !== false,
    }));
}

/**
 * 提取指定章节的 HTML 内容
 * @returns 原始 HTML 字符串
 */
export async function extractChapterHtml(
    book: Book,
    spineIndex: number
): Promise<string> {
    const bookAny = book as any;
    const spineItems = bookAny?.spine?.spineItems;
    if (!Array.isArray(spineItems) || spineIndex < 0 || spineIndex >= spineItems.length) {
        throw new Error(`[ContentExtractor] Invalid spine index: ${spineIndex}`);
    }

    const spineItem = spineItems[spineIndex];

    // Load the section content via epub.js
    await spineItem.load(bookAny.load.bind(bookAny));

    // Extract rendered HTML
    const doc = spineItem.document as Document | undefined;
    let html = '';

    if (doc?.body) {
        // Resolve relative image/resource URLs to blob URLs before extracting HTML
        await resolveResourceUrls(doc, spineItem, bookAny);
        html = doc.body.innerHTML;
    } else if (typeof spineItem.serialize === 'function') {
        html = spineItem.serialize();
    } else if (typeof spineItem.output === 'function') {
        html = spineItem.output();
    }

    if (!html) {
        throw new Error(`[ContentExtractor] Empty content for spine index: ${spineIndex}`);
    }

    return html;
}

/**
 * 提取章节内联 CSS
 * 会从章节 HTML 的 <style> 标签 和 <link> 引用中提取
 */
export async function extractChapterStyles(
    book: Book,
    spineIndex: number
): Promise<string[]> {
    const bookAny = book as any;
    const spineItems = bookAny?.spine?.spineItems;
    if (!Array.isArray(spineItems) || spineIndex < 0 || spineIndex >= spineItems.length) {
        return [];
    }

    const spineItem = spineItems[spineIndex];

    // Ensure loaded
    if (!spineItem.document) {
        await spineItem.load(bookAny.load.bind(bookAny));
    }

    const doc = spineItem.document as Document | undefined;
    if (!doc) return [];

    const styles: string[] = [];

    // Inline <style> tags
    const styleTags = doc.querySelectorAll('style');
    styleTags.forEach((tag: HTMLStyleElement) => {
        if (tag.textContent) {
            styles.push(tag.textContent);
        }
    });

    // <link rel="stylesheet"> — try to resolve via epub.js resource loader
    const linkTags = doc.querySelectorAll('link[rel="stylesheet"]');
    for (const link of Array.from(linkTags)) {
        const href = link.getAttribute('href');
        if (!href) continue;

        try {
            // epub.js can resolve relative URLs within the EPUB
            const resolved = await bookAny.load(href);
            if (typeof resolved === 'string') {
                styles.push(resolved);
            }
        } catch {
            console.warn(`[ContentExtractor] Failed to load stylesheet: ${href}`);
        }
    }

    return styles;
}

/**
 * 释放章节资源
 */
export function unloadChapter(book: Book, spineIndex: number): void {
    try {
        const bookAny = book as any;
        const spineItems = bookAny?.spine?.spineItems;
        if (!Array.isArray(spineItems) || spineIndex < 0 || spineIndex >= spineItems.length) {
            return;
        }
        const spineItem = spineItems[spineIndex];
        if (typeof spineItem.unload === 'function') {
            spineItem.unload();
        }
    } catch (error) {
        console.warn(`[ContentExtractor] Unload failed for spine ${spineIndex}:`, error);
    }
}

/**
 * 将章节 HTML 中的相对资源路径（img src, image href）解析为 blob URL
 *
 * 路径关系：
 *   spineItem.href  — 相对于 OPF 文件 (e.g. "Text/ch1.xhtml")
 *   spineItem.url   — 已解析的 ZIP 根路径 (e.g. "/OEBPS/Text/ch1.xhtml")
 *   archive.createUrl() 期望带前导 "/" 的 ZIP 根路径
 */
async function resolveResourceUrls(doc: Document, spineItem: any, bookAny: any): Promise<void> {
    const archive = bookAny.archive;
    if (!archive) return;

    // spineItem.url is already resolved to ZIP root with leading "/"
    // e.g. "/OEBPS/Text/chapter1.xhtml" → baseDir = "/OEBPS/Text/"
    const chapterUrl: string = spineItem.url || '';
    const baseDir = chapterUrl.substring(0, chapterUrl.lastIndexOf('/') + 1);

    const els = Array.from(doc.querySelectorAll('img[src], image[href], image[xlink\\:href]'));

    await Promise.all(els.map(async (el) => {
        const attr = el.hasAttribute('src') ? 'src'
            : el.hasAttribute('href') ? 'href'
            : 'xlink:href';
        const rawSrc = el.getAttribute(attr);
        if (!rawSrc || rawSrc.startsWith('data:') || rawSrc.startsWith('blob:') || rawSrc.startsWith('http')) return;

        const normalizedSrc = rawSrc
            .replace(/\\+/g, '/')
            .replace(/^\.\//, '')
            .trim();
        if (!normalizedSrc) return;

        try {
            // Resolve relative path against chapter's ZIP-root directory
            // e.g. "../Images/cover.jpg" + "/OEBPS/Text/" → "/OEBPS/Images/cover.jpg"
            const resolved = new URL(normalizedSrc, 'http://x' + baseDir).pathname;
            // resolved already has leading "/", which is what archive.createUrl() expects
            const blobUrl = await archive.createUrl(resolved);
            if (blobUrl) {
                el.setAttribute(attr, blobUrl);
                return;
            }
        } catch { /* fall through */ }

        // Fallback: try book.resolve() which handles all epub.js path logic
        try {
            const resolvedPath = bookAny.resolve?.(normalizedSrc);
            if (resolvedPath) {
                const blobUrl = await archive.createUrl(resolvedPath);
                if (blobUrl) {
                    el.setAttribute(attr, blobUrl);
                    return;
                }
            }
        } catch { /* fall through */ }

        console.warn(`[ContentExtractor] Could not resolve resource: ${rawSrc} (chapter: ${chapterUrl})`);
    }));
}
