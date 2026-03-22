/**
 * 生成 CSS Override 样式（滚动模式专用）
 * 用于强制覆盖 EPUB 的 multi-column 布局
 */
export function generateCSSOverride(chapterId: string): string {
  return `
    [data-chapter-id="${chapterId}"] html,
    [data-chapter-id="${chapterId}"] body {
      height: auto !important;
      width: 100% !important;
      overflow-y: visible !important;
      overflow-x: hidden !important;
      column-count: auto !important;
      column-width: auto !important;
      display: block !important;
      position: relative !important;
    }

    [data-chapter-id="${chapterId}"] img,
    [data-chapter-id="${chapterId}"] svg {
      max-width: 100% !important;
      height: auto !important;
      page-break-inside: auto !important;
    }
  `;
}

// ── scopeStyles LRU 缓存 ──
// 防止每次渲染都重新解析 CSS，缓存最近 64 条结果
const SCOPE_CSS_CACHE_SIZE = 64;
const scopeCssCache = new Map<string, string>();

function scopeCacheKey(css: string, chapterId: string): string {
  // 使用 CSS 前 100 字符 + 长度 + chapterId 作为 key
  const prefix = css.slice(0, 100);
  return `${prefix}|${css.length}|${chapterId}`;
}

function getFromScopeCache(css: string, chapterId: string): string | undefined {
  const key = scopeCacheKey(css, chapterId);
  const value = scopeCssCache.get(key);
  if (value) {
    // LRU: 删除后重新插入，放到最后
    scopeCssCache.delete(key);
    scopeCssCache.set(key, value);
  }
  return value;
}

function setToScopeCache(css: string, chapterId: string, result: string): void {
  const key = scopeCacheKey(css, chapterId);
  // LRU: 超过容量时删除最旧的
  if (scopeCssCache.size >= SCOPE_CSS_CACHE_SIZE) {
    const firstKey = scopeCssCache.keys().next().value;
    if (firstKey) scopeCssCache.delete(firstKey);
  }
  scopeCssCache.set(key, result);
}

/**
 * 生成翻页模式专用的 CSS Override
 * 不禁用 column 属性，允许父容器使用 CSS multi-column 分页
 */
export function generatePaginatedCSSOverride(chapterId: string): string {
  return `
    [data-chapter-id="${chapterId}"] *,
    [data-chapter-id="${chapterId}"] *::before,
    [data-chapter-id="${chapterId}"] *::after {
      break-before: auto !important;
      break-after: auto !important;
      page-break-before: auto !important;
      page-break-after: auto !important;
    }

    [data-chapter-id="${chapterId}"] hr,
    [data-chapter-id="${chapterId}"] .break,
    [data-chapter-id="${chapterId}"] .pagebreak,
    [data-chapter-id="${chapterId}"] .page-break,
    [data-chapter-id="${chapterId}"] [epub\\:type*="pagebreak"],
    [data-chapter-id="${chapterId}"] [role="doc-pagebreak"],
    [data-chapter-id="${chapterId}"] [style*="page-break"],
    [data-chapter-id="${chapterId}"] [style*="break-before"],
    [data-chapter-id="${chapterId}"] [style*="break-after"] {
      display: none !important;
      height: 0 !important;
      margin: 0 !important;
      padding: 0 !important;
      border: 0 !important;
    }

    [data-chapter-id="${chapterId}"] img,
    [data-chapter-id="${chapterId}"] svg {
      max-width: 100% !important;
      height: auto !important;
      break-inside: avoid !important;
    }
    [data-chapter-id="${chapterId}"] p,
    [data-chapter-id="${chapterId}"] h1,
    [data-chapter-id="${chapterId}"] h2,
    [data-chapter-id="${chapterId}"] h3,
    [data-chapter-id="${chapterId}"] li {
      break-inside: avoid !important;
      orphans: 2 !important;
      widows: 2 !important;
    }
  `;
}

// ─── CSS Scoping Engine ──────────────────────────────────────────

/** 不需要 scope 的 at-rule（声明性块，直接透传） */
const PASSTHROUGH_AT_RULES = new Set([
  'font-face', 'keyframes', 'charset', 'import', 'namespace', 'layer',
]);

/** 需要递归 scope 内部规则的 at-rule */
const RECURSIVE_AT_RULES = new Set([
  'media', 'supports', 'document', 'container',
]);

/** 需要被替换为 scope 选择器的全局选择器 */
const GLOBAL_SELECTOR_REPLACEMENTS: ReadonlyMap<string, string> = new Map([
  [':root', ''],
  ['html', ''],
  ['body', ''],
]);

/**
 * 提取 at-rule 名称（去掉 @ 符号和可能的供应商前缀）
 * @example "@media" → "media", "@-webkit-keyframes" → "keyframes"
 */
function extractAtRuleName(atRule: string): string {
  const match = atRule.match(/^@(?:-[\w]+-)?(\S+)/);
  return match ? match[1].toLowerCase() : '';
}

/**
 * 在 CSS 字符串中从 startIndex 开始找到匹配的 `}` 位置。
 * 正确处理嵌套大括号、字符串、注释。
 */
function findMatchingBrace(css: string, startIndex: number): number {
  let depth = 0;
  let inString: string | null = null;
  let inComment = false;

  for (let i = startIndex; i < css.length; i++) {
    const ch = css[i];
    const next = i + 1 < css.length ? css[i + 1] : '';

    if (!inString && !inComment && ch === '/' && next === '*') {
      inComment = true;
      i += 1;
      continue;
    }
    if (inComment) {
      if (ch === '*' && next === '/') {
        inComment = false;
        i += 1;
      }
      continue;
    }

    if (inString) {
      if (ch === '\\') { i += 1; continue; }
      if (ch === inString) { inString = null; }
      continue;
    }
    if (ch === '"' || ch === "'") {
      inString = ch;
      continue;
    }

    if (ch === '{') { depth += 1; }
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return css.length;
}

/**
 * 对 CSS 选择器列表中的每个选择器添加 scope 前缀。
 */
function scopeSelectorList(selectorList: string, scopePrefix: string): string {
  return selectorList
    .split(',')
    .map((sel) => scopeSingleSelector(sel.trim(), scopePrefix))
    .join(', ');
}

/**
 * 对单个选择器添加 scope 前缀。
 * :root / html / body → 替换为 scope 自身。
 */
function scopeSingleSelector(selector: string, scopePrefix: string): string {
  if (!selector) return selector;

  const lowerSelector = selector.toLowerCase();
  for (const [globalSel, replacement] of GLOBAL_SELECTOR_REPLACEMENTS) {
    if (lowerSelector === globalSel) {
      return `${scopePrefix}${replacement}`;
    }
    if (
      lowerSelector.startsWith(globalSel) &&
      /[\s>+~.#\[:]/.test(lowerSelector[globalSel.length] || '')
    ) {
      return `${scopePrefix}${selector.slice(globalSel.length)}`;
    }
  }

  return `${scopePrefix} ${selector}`;
}

/**
 * 为 CSS 规则添加作用域 — 状态机实现（带 LRU 缓存）
 *
 * 正确处理：
 * - `@font-face` / `@keyframes`：保持原样不加 scope
 * - `@media` / `@supports`：递归 scope 内部规则
 * - `:root` / `html` / `body`：替换为 scoped 选择器
 * - 普通选择器：添加 `[data-chapter-id="..."]` 前缀
 *
 * 性能优化：使用 LRU 缓存避免重复解析相同 CSS
 */
export function scopeStyles(css: string, chapterId: string): string {
  if (!css || !css.trim()) return '';

  // 检查缓存
  const cached = getFromScopeCache(css, chapterId);
  if (cached) return cached;

  // 未命中缓存，执行解析
  const scopePrefix = `[data-chapter-id="${chapterId}"]`;
  const result = scopeCssBlock(css, scopePrefix);

  // 存入缓存
  setToScopeCache(css, chapterId, result);

  return result;
}

/**
 * 递归处理一个 CSS 块（可能是顶层或 @media 内部）
 */
function scopeCssBlock(css: string, scopePrefix: string): string {
  const result: string[] = [];
  let cursor = 0;

  while (cursor < css.length) {
    // 跳过空白和注释
    const wsMatch = css.slice(cursor).match(/^(\s+|\/\*[\s\S]*?\*\/)+/);
    if (wsMatch) {
      result.push(wsMatch[0]);
      cursor += wsMatch[0].length;
      continue;
    }

    if (cursor >= css.length) break;

    // 检测 at-rule
    if (css[cursor] === '@') {
      const afterAt = css.slice(cursor);
      const atRuleHeaderMatch = afterAt.match(/^@[\w-]+[^{;]*/);
      if (!atRuleHeaderMatch) {
        result.push(css[cursor]);
        cursor += 1;
        continue;
      }

      const atRuleName = extractAtRuleName(atRuleHeaderMatch[0]);
      const headerEnd = cursor + atRuleHeaderMatch[0].length;

      // 跳过空白找到 { 或 ;
      let seekIdx = headerEnd;
      while (seekIdx < css.length && /\s/.test(css[seekIdx])) seekIdx += 1;

      if (seekIdx >= css.length || css[seekIdx] === ';') {
        // 无块体的 at-rule（@import, @charset 等）
        const endIdx = css.indexOf(';', cursor);
        const ruleEnd = endIdx >= 0 ? endIdx + 1 : css.length;
        result.push(css.slice(cursor, ruleEnd));
        cursor = ruleEnd;
        continue;
      }

      if (css[seekIdx] === '{') {
        const braceEnd = findMatchingBrace(css, seekIdx);
        const blockBody = css.slice(seekIdx + 1, braceEnd);
        const header = css.slice(cursor, seekIdx).trimEnd();

        if (PASSTHROUGH_AT_RULES.has(atRuleName)) {
          // @font-face, @keyframes 等：原样保留，不 scope
          result.push(`${header} {${blockBody}}`);
        } else if (RECURSIVE_AT_RULES.has(atRuleName)) {
          // @media, @supports 等：递归 scope 内部规则
          const scopedBody = scopeCssBlock(blockBody, scopePrefix);
          result.push(`${header} {${scopedBody}}`);
        } else {
          // 其他未知 at-rule：保守透传
          result.push(`${header} {${blockBody}}`);
        }

        cursor = braceEnd + 1;
        continue;
      }
    }

    // 普通规则：读取选择器直到 {
    const braceIdx = css.indexOf('{', cursor);
    if (braceIdx < 0) {
      result.push(css.slice(cursor));
      break;
    }

    const selectorList = css.slice(cursor, braceIdx).trim();
    const braceEnd = findMatchingBrace(css, braceIdx);
    const ruleBody = css.slice(braceIdx + 1, braceEnd);

    if (selectorList) {
      const scopedSelector = scopeSelectorList(selectorList, scopePrefix);
      result.push(`${scopedSelector} {${ruleBody}}`);
    } else {
      result.push(`{${ruleBody}}`);
    }

    cursor = braceEnd + 1;
  }

  return result.join('');
}

// ─── HTML Style 工具 ──────────────────────────────────────────

/**
 * 提取 HTML 中的 <style> 标签内容
 */
export function extractStyles(html: string): string[] {
  const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  const styles: string[] = [];
  let match;

  while ((match = styleRegex.exec(html)) !== null) {
    if (match[1]) {
      styles.push(match[1]);
    }
  }

  return styles;
}

/**
 * 移除 HTML 中的 <style> 标签
 */
export function removeStyleTags(html: string): string {
  return html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
}
