/**
 * ????? EPUB Blob ???????
 *
 * ???
 * 1. `waitForAssetLoad` ??????????????????
 * 2. EPUB ?????????????? Blob URL?????????????
 */
export interface AssetLoadOptions {
  timeoutMs?: number;
  maxTrackedImages?: number;
  chapterSizeHint?: number;
  largeChapterThreshold?: number;
  resourceExists?: (url: string) => boolean;
}

interface CachedAssetEntry {
  readonly canonicalPath: string;
  url: string | null;
  inFlight: Promise<string | null> | null;
  lastAccessAt: number;
}

interface AssetSession {
  readonly assets: Map<string, CachedAssetEntry>;
  released: boolean;
}

const BASE_TIMEOUT_MS = 5000;
const IMAGE_TIMEOUT_COST_MS = 240;
const MAX_IMAGE_TIMEOUT_MS = 12000;
const TEXT_TIMEOUT_BYTES = 30000;
const TEXT_TIMEOUT_COST_MS = 180;
const MAX_TEXT_TIMEOUT_MS = 6000;
const MIN_TIMEOUT_MS = 2500;
const MAX_TIMEOUT_MS = 24000;
const LARGE_CHAPTER_TRACK_LIMIT = 18;
const MIN_TRACKED_IMAGES = 8;

const assetSessions = new WeakMap<object, AssetSession>();
const activeAssetUrls = new Set<string>();

class MissingAssetError extends Error {
  constructor(url: string) {
    super(`[AssetLoader] Resource missing: ${url}`);
    this.name = 'MissingAssetError';
  }
}

function getAssetSession(sessionKey: object): AssetSession {
  const existing = assetSessions.get(sessionKey);
  if (existing && !existing.released) return existing;

  const created: AssetSession = {
    assets: new Map<string, CachedAssetEntry>(),
    released: false,
  };
  assetSessions.set(sessionKey, created);
  return created;
}

function markAssetUrlActive(url: string): void {
  if (url.startsWith('blob:')) {
    activeAssetUrls.add(url);
  }
}

function revokeAssetUrl(url: string | null): void {
  if (!url || !url.startsWith('blob:')) return;
  activeAssetUrls.delete(url);
  URL.revokeObjectURL(url);
}

function createAssetEntry(canonicalPath: string): CachedAssetEntry {
  return {
    canonicalPath,
    url: null,
    inFlight: null,
    lastAccessAt: performance.now(),
  };
}

export async function resolveSessionAssetUrl(
  sessionKey: object,
  canonicalPath: string,
  createUrl: () => Promise<string | null>,
): Promise<string | null> {
  const session = getAssetSession(sessionKey);
  const cached = session.assets.get(canonicalPath);
  if (cached?.url) {
    cached.lastAccessAt = performance.now();
    return cached.url;
  }
  if (cached?.inFlight) {
    return cached.inFlight;
  }

  const entry = cached ?? createAssetEntry(canonicalPath);
  const inFlight = createUrl()
    .then((resolvedUrl) => {
      entry.lastAccessAt = performance.now();
      if (session.released) {
        revokeAssetUrl(resolvedUrl);
        session.assets.delete(canonicalPath);
        return null;
      }
      if (!resolvedUrl) {
        session.assets.delete(canonicalPath);
        return null;
      }
      entry.url = resolvedUrl;
      markAssetUrlActive(resolvedUrl);
      return resolvedUrl;
    })
    .catch((error) => {
      session.assets.delete(canonicalPath);
      throw error;
    })
    .finally(() => {
      entry.inFlight = null;
    });

  entry.inFlight = inFlight;
  session.assets.set(canonicalPath, entry);
  return inFlight;
}

export function hasSessionAssetUrl(sessionKey: object, rawUrl: string): boolean {
  if (!rawUrl.startsWith('blob:')) return true;
  const session = assetSessions.get(sessionKey);
  if (!session || session.released) return false;

  for (const entry of session.assets.values()) {
    if (entry.url === rawUrl) {
      return true;
    }
  }
  return false;
}

export function isTrackedAssetUrlActive(rawUrl: string): boolean {
  return !rawUrl.startsWith('blob:') || activeAssetUrls.has(rawUrl);
}

export function releaseAssetSession(sessionKey: object): void {
  const session = assetSessions.get(sessionKey);
  if (!session) return;

  session.released = true;
  const urlsToRevoke = new Set<string>();
  session.assets.forEach((entry) => {
    if (entry.url) {
      urlsToRevoke.add(entry.url);
    }
  });
  urlsToRevoke.forEach((url) => revokeAssetUrl(url));
  session.assets.clear();
  assetSessions.delete(sessionKey);
}

function computeDynamicTimeout(
  imageCount: number,
  chapterSizeHint: number,
  explicitTimeoutMs?: number,
): number {
  if (explicitTimeoutMs && explicitTimeoutMs > 0) {
    return explicitTimeoutMs;
  }

  const imageCost = Math.min(MAX_IMAGE_TIMEOUT_MS, imageCount * IMAGE_TIMEOUT_COST_MS);
  const textCost = Math.min(MAX_TEXT_TIMEOUT_MS, Math.floor(chapterSizeHint / TEXT_TIMEOUT_BYTES) * TEXT_TIMEOUT_COST_MS);
  return Math.max(MIN_TIMEOUT_MS, Math.min(MAX_TIMEOUT_MS, BASE_TIMEOUT_MS + imageCost + textCost));
}

export async function waitForAssetLoad(
  container: HTMLElement,
  options: AssetLoadOptions = {},
): Promise<void> {
  const {
    timeoutMs,
    maxTrackedImages = 48,
    chapterSizeHint = 0,
    largeChapterThreshold = 450_000,
    resourceExists,
  } = options;

  const allImages = Array.from(container.querySelectorAll('img'));
  const isLargeChapter = chapterSizeHint >= largeChapterThreshold;
  const effectiveMaxTracked = isLargeChapter
    ? Math.max(MIN_TRACKED_IMAGES, Math.min(maxTrackedImages, LARGE_CHAPTER_TRACK_LIMIT))
    : Math.max(MIN_TRACKED_IMAGES, maxTrackedImages);
  const images = allImages.slice(0, effectiveMaxTracked);
  const resolvedTimeout = computeDynamicTimeout(images.length, chapterSizeHint, timeoutMs);

  if (images.length === 0) {
    return Promise.resolve();
  }

  let timeoutHandle: number | null = null;
  const timeoutPromise = new Promise<void>((resolve) => {
    timeoutHandle = window.setTimeout(() => {
      console.warn(`[AssetLoader] Timeout after ${resolvedTimeout}ms, forcing continue`);
      resolve();
    }, resolvedTimeout);
  });

  const imagePromises = images.map((img) => new Promise<void>((resolve, reject) => {
    const src = img.getAttribute('src') || '';
    if (!src || src.startsWith('data:text/html')) {
      resolve();
      return;
    }
    if (img.hasAttribute('data-missing-resource')) {
      reject(new MissingAssetError(src));
      return;
    }
    if (resourceExists && !resourceExists(src)) {
      reject(new MissingAssetError(src));
      return;
    }
    if (isRelativeAssetPath(src)) {
      reject(new MissingAssetError(src));
      return;
    }
    if (img.complete) {
      resolve();
      return;
    }

    const onLoad = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      console.warn(`[AssetLoader] Image load failed: ${img.src}`);
      cleanup();
      reject(new MissingAssetError(img.src || src));
    };
    const cleanup = () => {
      img.removeEventListener('load', onLoad);
      img.removeEventListener('error', onError);
    };

    img.addEventListener('load', onLoad);
    img.addEventListener('error', onError);
  }));

  try {
    await Promise.race([Promise.all(imagePromises), timeoutPromise]);
  } finally {
    if (timeoutHandle !== null) {
      window.clearTimeout(timeoutHandle);
    }
  }

  if (allImages.length > images.length) {
    console.warn(`[AssetLoader] Only tracked ${images.length}/${allImages.length} images for this chapter`);
  }
}

function isRelativeAssetPath(url: string): boolean {
  return !/^(blob:|data:|https?:|\/\/|\/|#)/i.test(url.trim());
}

export function getContainerHeight(container: HTMLElement): number {
  return container.getBoundingClientRect().height;
}
