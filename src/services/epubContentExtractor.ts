/**
 * epubContentExtractor.ts
 * 将 epub.js 仅作为 "解压 + XML 解析" 工具的封装层
 * BDISE 引擎通过此模块获取章节原始 HTML
 */
import { Book } from 'epubjs';
import type { EpubBookInternal, EpubSpineItem } from '../types/epubjs';
import {
    resolveChapterDocumentResources,
    rewriteExternalStyleSheetUrls,
} from './epubResourceLoader';
import { decodeTextBuffer } from './providers/textDecoding';

export interface SpineItemInfo {
    index: number;
    href: string;
    id: string;
    linear: boolean;
}

interface SpineLookupResult {
    bookInternal: EpubBookInternal;
    spineItems: EpubSpineItem[];
    spineItem: EpubSpineItem;
}

/**
 * 获取 spine 列表
 */
export function getSpineItems(book: Book): SpineItemInfo[] {
    const bookInternal = book as unknown as EpubBookInternal;
    const spineItems = bookInternal?.spine?.spineItems;
    if (!Array.isArray(spineItems)) return [];

    return spineItems.map((item, index) => ({
        index,
        href: item.href || '',
        id: item.idref || item.id || `spine-${index}`,
        linear: item.linear !== false,
    }));
}

function lookupSpineItem(book: Book, spineIndex: number): SpineLookupResult {
    const bookInternal = book as unknown as EpubBookInternal;
    const spineItems = bookInternal?.spine?.spineItems;
    if (!Array.isArray(spineItems) || spineIndex < 0 || spineIndex >= spineItems.length) {
        throw new Error(`[ContentExtractor] Invalid spine index: ${spineIndex}`);
    }

    return {
        bookInternal,
        spineItems,
        spineItem: spineItems[spineIndex],
    };
}

/**
 * 提取指定章节的 HTML 内容
 * @returns 原始 HTML 字符串
 */
export async function extractChapterHtml(
    book: Book,
    spineIndex: number
): Promise<string> {
    const { bookInternal, spineItem } = lookupSpineItem(book, spineIndex);

    // Load the section content via epub.js
    await spineItem.load(bookInternal.load.bind(bookInternal));

    // Extract rendered HTML
    const doc = spineItem.document as Document | undefined;
    let html = '';

    if (doc?.body) {
        // Resolve internal resource URLs to blob URLs before extracting HTML
        await resolveChapterDocumentResources(doc, spineItem, bookInternal);
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
    const { bookInternal, spineItem } = lookupSpineItem(book, spineIndex);

    // Ensure loaded
    if (!spineItem.document) {
        await spineItem.load(bookInternal.load.bind(bookInternal));
    }

    const doc = spineItem.document as Document | undefined;
    if (!doc) return [];

    await resolveChapterDocumentResources(doc, spineItem, bookInternal);
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
            let loadedStyle = '';
            if (/^(blob:|data:|https?:)/i.test(href)) {
                const response = await fetch(href);
                loadedStyle = await response.text();
            } else {
                const rawLoaded = await bookInternal.load(href);
                loadedStyle = toStyleText(rawLoaded);
            }

            if (!loadedStyle) continue;
            const rewritten = await rewriteExternalStyleSheetUrls(loadedStyle, spineItem, bookInternal);
            styles.push(rewritten);
        } catch (error) {
            console.warn(`[ContentExtractor] Failed to load stylesheet: ${href}`, error);
        }
    }

    return styles;
}

/**
 * 释放章节资源
 */
export function unloadChapter(book: Book, spineIndex: number): void {
    try {
        const { spineItem } = lookupSpineItem(book, spineIndex);
        if (typeof spineItem.unload === 'function') {
            spineItem.unload();
        }
    } catch (error) {
        console.warn(`[ContentExtractor] Unload failed for spine ${spineIndex}:`, error);
    }
}

export async function extractChapterHeading(
    book: Book,
    spineIndex: number
): Promise<string> {
    const { bookInternal, spineItem } = lookupSpineItem(book, spineIndex);
    await spineItem.load(bookInternal.load.bind(bookInternal));

    try {
        const doc = spineItem.document as Document | undefined;
        if (!doc) return '';
        const heading = doc.querySelector('h1, h2, h3, title');
        const text = heading?.textContent?.replace(/\s+/g, ' ').trim() || '';
        return text;
    } finally {
        if (typeof spineItem.unload === 'function') {
            spineItem.unload();
        }
    }
}

function toStyleText(value: unknown): string {
    if (typeof value === 'string') return value;
    if (value instanceof ArrayBuffer) {
        return decodeTextBuffer(value, 'css').text;
    }
    if (value && typeof value === 'object' && 'buffer' in (value as Record<string, unknown>)) {
        const buffer = (value as { buffer?: unknown }).buffer;
        if (buffer instanceof ArrayBuffer) {
            return decodeTextBuffer(buffer, 'css').text;
        }
    }
    return '';
}
