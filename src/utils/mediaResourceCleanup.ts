/**
 * 媒体资源清理工具 — 释放 blob URL、清空 DOM 节点。
 * 统一替代 ScrollReaderView.releaseChapterDomResources 和
 * PaginatedReaderView.releaseContainerMediaResources。
 */

function revokeBlobUrl(rawUrl: string | null) {
    if (!rawUrl || !rawUrl.startsWith('blob:')) return;
    try {
        URL.revokeObjectURL(rawUrl);
    } catch {
        // ignore revoke errors
    }
}

/**
 * 释放容器内所有媒体资源（img/source/video/audio 的 blob URL），
 * 然后清空子节点。
 */
export function releaseMediaResources(container: HTMLElement | null) {
    if (!container) return;

    container.querySelectorAll('img').forEach((img) => {
        revokeBlobUrl(img.getAttribute('src'));
        const srcSet = img.getAttribute('srcset');
        if (srcSet) {
            srcSet.split(',').forEach((part) => {
                const url = part.trim().split(/\s+/)[0];
                revokeBlobUrl(url || null);
            });
        }
        img.removeAttribute('srcset');
        img.removeAttribute('src');
        img.loading = 'lazy';
        img.decoding = 'async';
    });

    container.querySelectorAll('source').forEach((sourceEl) => {
        revokeBlobUrl(sourceEl.getAttribute('src'));
        sourceEl.removeAttribute('srcset');
        sourceEl.removeAttribute('src');
    });

    container.querySelectorAll('video,audio').forEach((mediaEl) => {
        revokeBlobUrl(mediaEl.getAttribute('src'));
        mediaEl.removeAttribute('src');
        mediaEl.querySelectorAll('source').forEach((sourceEl) => {
            revokeBlobUrl(sourceEl.getAttribute('src'));
            sourceEl.removeAttribute('src');
        });
    });

    container.replaceChildren();
}
