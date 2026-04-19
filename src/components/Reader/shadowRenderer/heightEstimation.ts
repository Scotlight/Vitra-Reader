/**
 * 段高度估算：给定字数和样式轮廓，推算该段将占多少像素。
 *
 * 用于在真实 DOM 挂载前给 placeholder 预留空间，避免首屏跳动。
 *
 * 输入刻意只要 4 个数值（fontSize / pageWidth / lineHeight /
 * paragraphSpacing）而不是完整的 ReaderStyleConfig，目的：
 * - 让本模块零外部类型依赖，可单独测试
 * - 表达"高度估算不关心颜色 / 字体名 / 对齐"
 *
 * 调用方 ShadowRenderer 提供 ReaderStyleConfig（字段超集）即可。
 */

import {
    EST_TEXT_NODE_MIN_CHAR_WEIGHT,
    EST_ELEMENT_NODE_MIN_CHAR_WEIGHT,
    EST_ELEMENT_NODE_TAG_OVERHEAD,
    EST_MEDIA_ELEMENT_CHAR_BOOST,
    EST_UNKNOWN_NODE_CHAR_WEIGHT,
    EST_FONT_SIZE_MIN_PX,
    EST_FONT_SIZE_DEFAULT_PX,
    EST_PAGE_WIDTH_MIN_PX,
    EST_PAGE_WIDTH_MAX_PX,
    EST_PAGE_WIDTH_DEFAULT_PX,
    EST_CHARS_PER_LINE_MIN,
    EST_CHAR_WIDTH_RATIO,
    EST_MIN_LINES,
    EST_LINE_HEIGHT_MIN_FACTOR,
    EST_LINE_HEIGHT_DEFAULT,
    EST_PARAGRAPH_SPACING_FACTOR_MIN,
    EST_PARAGRAPH_SPACING_NORMALIZE_DIVISOR,
    VECTOR_MIN_SEGMENT_EST_HEIGHT,
} from './shadowRendererConstants';

export interface HeightEstimationStyleInputs {
    fontSize: number;
    pageWidth: number;
    lineHeight: number;
    paragraphSpacing: number;
}

export function estimateNodeCharWeight(node: ChildNode): number {
    if (node.nodeType === Node.TEXT_NODE) {
        return Math.max(EST_TEXT_NODE_MIN_CHAR_WEIGHT, (node.textContent || '').trim().length);
    }

    if (node.nodeType === Node.ELEMENT_NODE) {
        const element = node as HTMLElement;
        const textLength = (element.textContent || '').length;
        const mediaBoost = element.matches('img,svg,video,table,pre,code') ? EST_MEDIA_ELEMENT_CHAR_BOOST : 0;
        return Math.max(EST_ELEMENT_NODE_MIN_CHAR_WEIGHT, textLength + EST_ELEMENT_NODE_TAG_OVERHEAD + mediaBoost);
    }

    return EST_UNKNOWN_NODE_CHAR_WEIGHT;
}

export function estimateSegmentHeight(charCount: number, styles: HeightEstimationStyleInputs): number {
    const fontSize = Math.max(EST_FONT_SIZE_MIN_PX, styles.fontSize || EST_FONT_SIZE_DEFAULT_PX);
    const width = Math.max(EST_PAGE_WIDTH_MIN_PX, Math.min(EST_PAGE_WIDTH_MAX_PX, styles.pageWidth || EST_PAGE_WIDTH_DEFAULT_PX));
    const charsPerLine = Math.max(EST_CHARS_PER_LINE_MIN, Math.floor((width / fontSize) * EST_CHAR_WIDTH_RATIO));
    const estimatedLines = Math.max(EST_MIN_LINES, Math.ceil(Math.max(1, charCount) / charsPerLine));
    const lineHeightPx = Math.max(fontSize * EST_LINE_HEIGHT_MIN_FACTOR, fontSize * (styles.lineHeight || EST_LINE_HEIGHT_DEFAULT));
    const paragraphFactor = Math.max(EST_PARAGRAPH_SPACING_FACTOR_MIN, 1 + (styles.paragraphSpacing || 0) / EST_PARAGRAPH_SPACING_NORMALIZE_DIVISOR);

    return Math.max(
        VECTOR_MIN_SEGMENT_EST_HEIGHT,
        Math.ceil(estimatedLines * lineHeightPx * paragraphFactor),
    );
}
