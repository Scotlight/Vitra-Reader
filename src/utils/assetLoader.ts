/**
 * 等待容器内所有图片加载完成
 * @param container - DOM 容器
 * @param options - 等待策略（支持动态超时/限量追踪）
 * @returns Promise<void>
 */
export interface AssetLoadOptions {
  timeoutMs?: number;
  maxTrackedImages?: number;
  chapterSizeHint?: number;
  largeChapterThreshold?: number;
  resourceExists?: (url: string) => boolean;
}

class MissingAssetError extends Error {
  constructor(url: string) {
    super(`[AssetLoader] Resource missing: ${url}`);
    this.name = 'MissingAssetError';
  }
}

function computeDynamicTimeout(
  imageCount: number,
  chapterSizeHint: number,
  explicitTimeoutMs?: number,
): number {
  if (explicitTimeoutMs && explicitTimeoutMs > 0) {
    return explicitTimeoutMs;
  }

  const base = 5000;
  const imageCost = Math.min(12000, imageCount * 240);
  const textCost = Math.min(6000, Math.floor(chapterSizeHint / 30000) * 180);
  return Math.max(2500, Math.min(24000, base + imageCost + textCost));
}

export async function waitForAssetLoad(
  container: HTMLElement,
  options: AssetLoadOptions = {}
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
    ? Math.max(8, Math.min(maxTrackedImages, 18))
    : Math.max(8, maxTrackedImages);

  const images = allImages.slice(0, effectiveMaxTracked);
  const resolvedTimeout = computeDynamicTimeout(images.length, chapterSizeHint, timeoutMs);

  // 如果没有图片，直接返回
  if (images.length === 0) {
    return Promise.resolve();
  }

  // 创建超时 Promise
  const timeoutPromise = new Promise<void>((resolve) => {
    setTimeout(() => {
      console.warn(`[AssetLoader] Timeout after ${resolvedTimeout}ms, forcing continue`);
      resolve();
    }, resolvedTimeout);
  });

  // 创建图片加载 Promise 数组
  const imagePromises = images.map((img) => {
    return new Promise<void>((resolve, reject) => {
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

      // 如果图片已经加载完成
      if (img.complete) {
        resolve();
        return;
      }

      // 监听加载完成
      const onLoad = () => {
        cleanup();
        resolve();
      };

      // 监听加载失败（也视为完成，使用占位符）
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
    });
  });

  // 等待所有图片加载完成或超时
  await Promise.race([
    Promise.all(imagePromises),
    timeoutPromise
  ]);

  if (allImages.length > images.length) {
    console.warn(`[AssetLoader] Only tracked ${images.length}/${allImages.length} images for this chapter`);
  }
}

function isRelativeAssetPath(url: string): boolean {
  return !/^(blob:|data:|https?:|\/\/|\/|#)/i.test(url.trim());
}

/**
 * 获取容器的精确高度
 * @param container - DOM 容器
 * @returns 高度（px）
 */
export function getContainerHeight(container: HTMLElement): number {
  return container.getBoundingClientRect().height;
}
