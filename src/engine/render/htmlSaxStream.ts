// Chunk 只限制一次扫描推进的工作量，并不要求标签恰好落在 chunk 内；findTagEnd 会跨越边界。
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

export interface HtmlSaxStreamHandlers {
  onBlockBoundary?: (offset: number) => void | boolean;
  onMediaTag?: (offset: number) => void | boolean;
}

function isWhitespace(charCode: number): boolean {
  return ' \n\t\r\f'.includes(String.fromCharCode(charCode));
}

function isTagNameChar(charCode: number): boolean {
  const char = String.fromCharCode(charCode);
  const isNumber = char >= '0' && char <= '9';
  const isUpper = char >= 'A' && char <= 'Z';
  const isLower = char >= 'a' && char <= 'z';
  return isNumber || isUpper || isLower || char === '-' || char === ':' || char === '_';
}

function findTagEnd(html: string, from: number): number {
  let quote = '';
  for (let index = from; index < html.length; index += 1) {
    const char = html[index];
    if (quote !== '') {
      if (char === quote) {
        quote = '';
      }
      continue;
    }
    // 属性值里的 `>` 不能结束标签，例如 `<img alt="a > b">`。
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '>') {
      return index + 1;
    }
  }
  return html.length;
}

function readTagToken(html: string, start: number): HtmlTagToken | null {
  if (start < 0 || start >= html.length || html[start] !== '<') {
    return null;
  }

  let cursor = start + 1;
  if (cursor >= html.length) return null;

  const leading = html[cursor];
  if (leading === '!' || leading === '?') {
    return {
      name: '',
      isClosing: false,
      start,
      end: findTagEnd(html, cursor + 1),
    };
  }

  let isClosing = false;
  if (leading === '/') {
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
 * - 这是轻量的切分辅助器，不承担 HTML 合法性校验；不完整标签会安全地视为文件尾部
 */
export function streamHtmlBySaxStream(html: string, handlers: HtmlSaxStreamHandlers): void {
  if (!html) {
    return;
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
        if (handlers.onBlockBoundary?.(token.end) === false) {
          return;
        }
      } else if (!token.isClosing && MEDIA_TAGS.has(token.name)) {
        if (handlers.onMediaTag?.(token.start) === false) {
          return;
        }
      }

      cursor = token.end;
    }
  }
}

export function scanHtmlBySaxStream(html: string): HtmlSaxScanResult {
  const blockBoundaryOffsets: number[] = [];
  const mediaTagOffsets: number[] = [];

  streamHtmlBySaxStream(html, {
    onBlockBoundary(offset) {
      blockBoundaryOffsets.push(offset);
    },
    onMediaTag(offset) {
      mediaTagOffsets.push(offset);
    },
  });

  return { blockBoundaryOffsets, mediaTagOffsets };
}

export function consumeMediaOffsetInRange(
  mediaOffsets: readonly number[],
  start: number,
  end: number,
  cursorRef: { value: number },
): boolean {
  // 同一 offset 只会被消费一次。调用方按 segment 的自然顺序传入 range 时，复杂度为 O(n)。
  let cursor = cursorRef.value;
  while (cursor < mediaOffsets.length) {
    const offset = mediaOffsets[cursor];
    if (offset === undefined || offset >= start) break;
    cursor += 1;
  }

  let hasMedia = false;
  while (cursor < mediaOffsets.length) {
    const offset = mediaOffsets[cursor];
    if (offset === undefined || offset >= end) break;
    hasMedia = true;
    cursor += 1;
  }

  cursorRef.value = cursor;
  return hasMedia;
}
