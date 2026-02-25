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
    [data-chapter-id="${chapterId}"] [epub\:type*="pagebreak"],
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

/**
 * 为 CSS 规则添加作用域
 * 将 .title { ... } 转换为 [data-chapter-id="ch-1"] .title { ... }
 */
export function scopeStyles(css: string, chapterId: string): string {
  if (!css || !css.trim()) return '';

  // 作用域前缀
  const scopePrefix = `[data-chapter-id="${chapterId}"]`;

  // 处理 CSS 规则
  // 匹配选择器和花括号，为每个选择器添加作用域
  return css.replace(
    /([^\r\n,{}]+)(,(?=[^}]*{)|\s*{)/g,
    (match, selector, separator) => {
      // 跳过 @规则（如 @media, @keyframes）
      if (selector.trim().startsWith('@')) {
        return match;
      }

      // 跳过伪元素和伪类的特殊情况
      const trimmedSelector = selector.trim();
      
      // 添加作用域前缀
      return `${scopePrefix} ${trimmedSelector}${separator}`;
    }
  );
}

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

/**
 * 注入 CSS Override 到文档
 */
export function injectCSSOverride(chapterId: string): HTMLStyleElement {
  const styleElement = document.createElement('style');
  styleElement.setAttribute('data-chapter-style', chapterId);
  styleElement.textContent = generateCSSOverride(chapterId);
  document.head.appendChild(styleElement);
  return styleElement;
}

/**
 * 移除 CSS Override
 */
export function removeCSSOverride(chapterId: string): void {
  const styleElement = document.querySelector(
    `style[data-chapter-style="${chapterId}"]`
  );
  if (styleElement) {
    styleElement.remove();
  }
}
