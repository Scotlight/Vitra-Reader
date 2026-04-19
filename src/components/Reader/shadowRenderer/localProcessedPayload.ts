/**
 * Worker 预处理不可用时的主线程回退。
 *
 * 正常路径是 chapterPreprocessService 经 Worker 返回 { cleanedHtml,
 * processedStyles, fragments }。Worker 不可用（启动失败 / 已销毁 /
 * 未启用）时走此本地版本，执行同样的 sanitize + scope + 外部样式
 * 清洗流程。
 *
 * 作为回退路径，不做向量化 (fragments 只返回单个 cleanedHtml) —
 * 向量化由 ShadowRenderer 的 measure 阶段按需做。
 */

import { extractStyles, removeStyleTags, scopeStyles } from '../../../utils/styleProcessor';
import { sanitizeChapterHtml, sanitizeStyleSheets } from '../../../engine/core/contentSanitizer';

export interface LocalProcessedPayload {
    cleanedHtml: string;
    processedStyles: string[];
    fragments: readonly string[];
}

export function buildLocalProcessedPayload(
    htmlContent: string,
    externalStyles: readonly string[],
    chapterId: string,
): LocalProcessedPayload {
    const sanitizedHtml = sanitizeChapterHtml(htmlContent).htmlContent;
    const inlineStyles = sanitizeStyleSheets(extractStyles(sanitizedHtml));
    const cleanedHtml = removeStyleTags(sanitizedHtml);
    const sanitizedExternalStyles = sanitizeStyleSheets([...externalStyles]);
    const allStyles = [...sanitizedExternalStyles, ...inlineStyles];
    const scopedStyles = allStyles
        .map((css) => scopeStyles(css, chapterId))
        .filter((css) => css.trim().length > 0);

    return {
        cleanedHtml,
        processedStyles: scopedStyles,
        fragments: [cleanedHtml],
    };
}
