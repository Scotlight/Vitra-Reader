import type { EpubArchive, EpubBookInternal, EpubSpineItem } from '../../../types/epubjs';
import { resolveSessionAssetUrl } from '../../../utils/assetLoader';

const RESOURCE_WARNING_CACHE_LIMIT = 240;
const STYLE_URL_PATTERN = /url\(([^)]+)\)/gi;
const URL_ATTR_SELECTORS = [
  'img[src]',
  'image[href]',
  'image[xlink\\:href]',
  'video[src]',
  'video[poster]',
  'audio[src]',
  'source[src]',
  'link[rel="stylesheet"][href]',
];

interface EpubResourceContext {
  readonly archive: EpubArchive;
  readonly chapterUrl: string;
  readonly baseDir: string;
  readonly resolvePath?: (href: string) => string | undefined;
  readonly resourceExists?: (path: string) => boolean;
  readonly sessionKey: object;
}

const resourceWarningCache = new Set<string>();

function warnResourceOnce(message: string): void {
  if (resourceWarningCache.has(message)) return;
  resourceWarningCache.add(message);
  if (resourceWarningCache.size > RESOURCE_WARNING_CACHE_LIMIT) {
    const first = resourceWarningCache.values().next().value;
    if (first) resourceWarningCache.delete(first);
  }
  console.warn(message);
}

function clearUnresolvedResource(element: Element, attrName: string, rawValue: string): void {
  element.removeAttribute(attrName);
  element.setAttribute('data-missing-resource', rawValue);
}

function isSafePassthrough(url: string): boolean {
  return /^(data:|blob:|https?:|\/\/)/i.test(url);
}

function isUnsafeProtocol(url: string): boolean {
  return /^(file:|javascript:|vbscript:)/i.test(url);
}

function trimWrappedQuotes(rawValue: string): string {
  const trimmed = rawValue.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function normalizeRelativePath(rawPath: string): string {
  return rawPath
    .replace(/\\+/g, '/')
    .replace(/^\.\//, '')
    .trim();
}

function normalizeArchivePath(candidate: string): string {
  if (!candidate) return '';
  if (/^https?:\/\//i.test(candidate)) {
    try {
      return new URL(candidate).pathname;
    } catch {
      return '';
    }
  }
  return candidate.startsWith('/') ? candidate : `/${candidate}`;
}

function normalizeManifestPath(candidate: string): string {
  return normalizeArchivePath(candidate).toLowerCase();
}

function buildResolutionCandidates(pathValue: string, context: EpubResourceContext): string[] {
  const normalized = normalizeRelativePath(pathValue);
  if (!normalized) return [];

  const candidates = new Set<string>();
  try {
    const byBaseDir = new URL(normalized, `http://vitra${context.baseDir}`).pathname;
    candidates.add(normalizeArchivePath(byBaseDir));
  } catch {
    // ignored intentionally; fallback candidate below still applies
  }

  candidates.add(normalizeArchivePath(normalized));

  if (context.resolvePath) {
    const resolved = context.resolvePath(normalized);
    if (resolved) candidates.add(normalizeArchivePath(resolved));
  }

  return Array.from(candidates).filter((item) => item.length > 0);
}

async function resolveBlobUrl(pathValue: string, context: EpubResourceContext): Promise<string | null> {
  const candidates = buildResolutionCandidates(pathValue, context);
  ensureResourceExists(candidates, context);
  for (const candidate of candidates) {
    try {
      const blobUrl = await resolveSessionAssetUrl(
        context.sessionKey,
        candidate,
        () => context.archive.createUrl(candidate),
      );
      if (blobUrl) {
        return blobUrl;
      }
    } catch (error) {
      warnResourceOnce(`[EpubResourceLoader] createUrl failed: ${candidate}, error=${String(error)}`);
    }
  }
  return null;
}

function ensureResourceExists(candidates: readonly string[], context: EpubResourceContext): void {
  if (!context.resourceExists || candidates.length === 0) return;
  const matched = candidates.some((candidate) => context.resourceExists?.(candidate));
  if (!matched) {
    throw new Error(`[EpubResourceLoader] manifest missing: ${candidates.join(', ')}`);
  }
}

async function resolveElementAttribute(
  element: Element,
  attributeName: string,
  context: EpubResourceContext,
): Promise<void> {
  const rawValue = element.getAttribute(attributeName);
  if (!rawValue) return;

  const normalized = normalizeRelativePath(rawValue);
  if (!normalized) {
    clearUnresolvedResource(element, attributeName, rawValue);
    return;
  }
  if (isSafePassthrough(normalized)) return;
  if (isUnsafeProtocol(normalized)) {
    clearUnresolvedResource(element, attributeName, rawValue);
    warnResourceOnce(`[EpubResourceLoader] blocked protocol: ${normalized}`);
    return;
  }

  const blobUrl = await resolveBlobUrl(normalized, context);
  if (!blobUrl) {
    clearUnresolvedResource(element, attributeName, rawValue);
    warnResourceOnce(`[EpubResourceLoader] unresolved resource: ${rawValue} (chapter: ${context.chapterUrl})`);
    return;
  }
  element.setAttribute(attributeName, blobUrl);
}

async function rewriteCssUrls(cssText: string, context: EpubResourceContext): Promise<string> {
  if (!cssText || cssText.indexOf('url(') < 0) return cssText;

  let output = '';
  let cursor = 0;
  for (const match of cssText.matchAll(STYLE_URL_PATTERN)) {
    const matchedText = match[0];
    const rawToken = match[1];
    const startIndex = match.index ?? -1;
    if (startIndex < 0) continue;

    output += cssText.slice(cursor, startIndex);
    const decoded = trimWrappedQuotes(rawToken || '');
    const normalized = normalizeRelativePath(decoded);
    let replacement = matchedText;

    if (isUnsafeProtocol(normalized)) {
      replacement = 'url("")';
      warnResourceOnce(`[EpubResourceLoader] blocked css url: ${decoded}`);
    } else if (!isSafePassthrough(normalized) && normalized) {
      const blobUrl = await resolveBlobUrl(normalized, context);
      replacement = blobUrl ? `url("${blobUrl}")` : 'url("")';
      if (!blobUrl) {
        warnResourceOnce(`[EpubResourceLoader] unresolved css url: ${decoded} (chapter: ${context.chapterUrl})`);
      }
    }

    output += replacement;
    cursor = startIndex + matchedText.length;
  }

  output += cssText.slice(cursor);
  return output;
}

async function rewriteInlineStyles(doc: Document, context: EpubResourceContext): Promise<void> {
  const styledElements = Array.from(doc.querySelectorAll('[style*="url("]'));
  for (const element of styledElements) {
    const style = element.getAttribute('style');
    if (!style) continue;
    const rewritten = await rewriteCssUrls(style, context);
    if (rewritten !== style) {
      element.setAttribute('style', rewritten);
    }
  }
}

async function rewriteStyleTags(doc: Document, context: EpubResourceContext): Promise<void> {
  const styleTags = Array.from(doc.querySelectorAll('style'));
  for (const styleTag of styleTags) {
    const text = styleTag.textContent || '';
    if (!text) continue;
    styleTag.textContent = await rewriteCssUrls(text, context);
  }
}

function createContext(spineItem: EpubSpineItem, bookInternal: EpubBookInternal): EpubResourceContext | null {
  const archive = bookInternal.archive;
  if (!archive) return null;

  const chapterUrl: string = spineItem.url || '';
  const index = chapterUrl.lastIndexOf('/');
  const baseDir = index >= 0 ? chapterUrl.slice(0, index + 1) : '/';
  const resolvePath = typeof bookInternal.resolve === 'function' ? (bookInternal.resolve.bind(bookInternal) as (href: string) => string) : undefined;
  const resourceExists = buildResourceExistsChecker(bookInternal, baseDir);

  return {
    archive,
    chapterUrl,
    baseDir,
    resolvePath,
    resourceExists,
    sessionKey: bookInternal,
  };
}

function buildResourceExistsChecker(
  bookInternal: EpubBookInternal,
  baseDir: string,
): ((path: string) => boolean) | undefined {
  const manifestSet = collectManifestResources(bookInternal, baseDir);
  if (manifestSet.size === 0) return undefined;
  return (path: string) => {
    const normalized = normalizeManifestPath(path);
    if (manifestSet.has(normalized)) return true;
    const noSlash = normalized.startsWith('/') ? normalized.slice(1) : normalized;
    return manifestSet.has(noSlash);
  };
}

function collectManifestResources(bookInternal: EpubBookInternal, baseDir: string): Set<string> {
  const manifest = bookInternal?.packaging?.manifest;
  if (!manifest || typeof manifest !== 'object') return new Set<string>();

  const set = new Set<string>();
  const entries = Object.entries(manifest as Record<string, unknown>);
  entries.forEach(([key, value]) => {
    const href = extractManifestHref(value);
    if (href) addManifestCandidate(set, href, baseDir);
    if (key) addManifestCandidate(set, key, baseDir);
  });
  return set;
}

function extractManifestHref(value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  const href = (value as { href?: unknown }).href;
  if (typeof href !== 'string') return '';
  return href;
}

function addManifestCandidate(set: Set<string>, rawPath: string, baseDir: string): void {
  const normalized = normalizeRelativePath(rawPath);
  if (!normalized) return;
  set.add(normalizeManifestPath(normalized));
  try {
    const resolved = new URL(normalized, `http://vitra${baseDir}`).pathname;
    set.add(normalizeManifestPath(resolved));
  } catch {
    // ignore invalid path
  }
}

export async function resolveChapterDocumentResources(
  doc: Document,
  spineItem: EpubSpineItem,
  bookInternal: EpubBookInternal,
): Promise<void> {
  const context = createContext(spineItem, bookInternal);
  if (!context) return;

  const resourceElements = URL_ATTR_SELECTORS
    .flatMap((selector) => Array.from(doc.querySelectorAll(selector)));

  await Promise.all(resourceElements.map(async (element) => {
    const attrName = element.hasAttribute('src')
      ? 'src'
      : element.hasAttribute('href')
        ? 'href'
        : element.hasAttribute('poster')
          ? 'poster'
          : 'xlink:href';
    await resolveElementAttribute(element, attrName, context);
  }));

  await rewriteInlineStyles(doc, context);
  await rewriteStyleTags(doc, context);
}

export async function rewriteExternalStyleSheetUrls(
  cssText: string,
  spineItem: EpubSpineItem,
  bookInternal: EpubBookInternal,
): Promise<string> {
  const context = createContext(spineItem, bookInternal);
  if (!context) return cssText;
  return rewriteCssUrls(cssText, context);
}
