/**
 * 等待容器内所有图片加载完成
 * @param container - DOM 容器
 * @param timeout - 超时时间（毫秒），默认 5000ms
 * @returns Promise<void>
 */
export async function waitForAssetLoad(
  container: HTMLElement,
  timeout: number = 5000
): Promise<void> {
  const images = Array.from(container.querySelectorAll('img'));
  
  // 如果没有图片，直接返回
  if (images.length === 0) {
    return Promise.resolve();
  }

  // 创建超时 Promise
  const timeoutPromise = new Promise<void>((resolve) => {
    setTimeout(() => {
      console.warn(`[AssetLoader] Timeout after ${timeout}ms, forcing continue`);
      resolve();
    }, timeout);
  });

  // 创建图片加载 Promise 数组
  const imagePromises = images.map((img) => {
    return new Promise<void>((resolve) => {
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
        resolve();
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
}

/**
 * 获取容器的精确高度
 * @param container - DOM 容器
 * @returns 高度（px）
 */
export function getContainerHeight(container: HTMLElement): number {
  return container.offsetHeight;
}
