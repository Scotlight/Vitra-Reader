const SAX_STREAM_CHUNK_SIZE = 32_768;

const BLOCK_BOUNDARY_TAGS = new Set([
  'p',
  'div',
  'section',
  'article',
  'li',
  'blockquote',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'table',
  'tr',
  'td',
  'ul',
  'ol',
]);

const MEDIA_TAGS = new Set([
  'img',
  'video',
  'picture',
  'svg',
  'canvas',
  'figure',
  'table',
  'math',
]);

interface HtmlTagToken {
  name: string;
  isClosing: boolean;
  start: number;
  end: number;
}

export interface HtmlSaxScanResult {
  readonly blockBoundaryOffsets: number[];
  readonly mediaTagOffsets: number[];
}

function isWhitespace(charCode: number): boolean {
  return charCode === 0x20 || charCode === 0x0A || charCode === 0x09 || charCode === 0x0D || charCode === 0x0C;
}

function isTagNameChar(charCode: number): boolean {
  const isNumber = charCode >= 0x30 && charCode <= 0x39;
  const isUpper = charCode >= 0x41 && charCode <= 0x5A;
  const isLower = charCode >= 0x61 && charCode <= 0x7A;
  return isNumber || isUpper || isLower || charCode === 0x2D || charCode === 0x3A || charCode === 0x5F;
}

function findTagEnd(html: string, from: number): number {
  let quote = 0;
  for (let index = from; index < html.length; index += 1) {
    const code = html.charCodeAt(index);
    if (quote !== 0) {
      if (code === quote) {
        quote = 0;
      }
      continue;
    }
    if (code === 0x22 || code === 0x27) {
      quote = code;
      continue;
    }
    if (code === 0x3E) {
      return index + 1;
    }
  }
  return html.length;
}

function readTagToken(html: string, start: number): HtmlTagToken | null {
  if (start < 0 || start >= html.length || html.charCodeAt(start) !== 0x3C) {
    return null;
  }

  let cursor = start + 1;
  if (cursor >= html.length) return null;

  const leading = html.charCodeAt(cursor);
  if (leading === 0x21 || leading === 0x3F) {
    return {
      name: '',
      isClosing: false,
      start,
      end: findTagEnd(html, cursor + 1),
    };
  }

  let isClosing = false;
  if (leading === 0x2F) {
    isClosing = true;
    cursor += 1;
  }

  while (cursor < html.length && isWhitespace(html.charCodeAt(cursor))) {
    cursor += 1;
  }

  const nameStart = cursor;
  while (cursor < html.length && isTagNameChar(html.charCodeAt(cursor))) {
    cursor += 1;
  }

  if (cursor === nameStart) {
    return {
      name: '',
      isClosing,
      start,
      end: findTagEnd(html, cursor),
    };
  }

  return {
    name: html.slice(nameStart, cursor).toLowerCase(),
    isClosing,
    start,
    end: findTagEnd(html, cursor),
  };
}

/**
 * 流式 SAX 风格扫描：
 * - 不构建 DOM，不做正则全量匹配
 * - 分块推进（chunk），按标签事件收集边界与媒体位点
 */
export function scanHtmlBySaxStream(html: string): HtmlSaxScanResult {
  const blockBoundaryOffsets: number[] = [];
  const mediaTagOffsets: number[] = [];
  if (!html) {
    return { blockBoundaryOffsets, mediaTagOffsets };
  }

  let cursor = 0;
  while (cursor < html.length) {
    const chunkLimit = Math.min(html.length, cursor + SAX_STREAM_CHUNK_SIZE);

    while (cursor < chunkLimit) {
      const tagStart = html.indexOf('<', cursor);
      if (tagStart < 0) {
        cursor = html.length;
        break;
      }
      if (tagStart >= chunkLimit) {
        cursor = tagStart;
        break;
      }

      const token = readTagToken(html, tagStart);
      if (!token || token.end <= tagStart) {
        cursor = tagStart + 1;
        continue;
      }

      if (token.isClosing && BLOCK_BOUNDARY_TAGS.has(token.name)) {
        blockBoundaryOffsets.push(token.end);
      } else if (!token.isClosing && MEDIA_TAGS.has(token.name)) {
        mediaTagOffsets.push(token.start);
      }

      cursor = token.end;
    }
  }

  return { blockBoundaryOffsets, mediaTagOffsets };
}

export function consumeMediaOffsetInRange(
  mediaOffsets: readonly number[],
  start: number,
  end: number,
  cursorRef: { value: number },
): boolean {
  let cursor = cursorRef.value;
  while (cursor < mediaOffsets.length && mediaOffsets[cursor] < start) {
    cursor += 1;
  }

  let hasMedia = false;
  while (cursor < mediaOffsets.length && mediaOffsets[cursor] < end) {
    hasMedia = true;
    cursor += 1;
  }

  cursorRef.value = cursor;
  return hasMedia;
}
