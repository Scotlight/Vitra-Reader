/**
 * 释放即将卸载的章节 DOM 所持有的媒体资源。
 *
 * 这里仅断开元素对图片、音视频和 `<source>` 的引用；EPUB Blob URL 的真正所有权
 * 仍在 book session / assetLoader，不能在章节卸载时直接 revoke，否则相邻章节或重挂载
 * 可能复用同一个资源 URL。
 */

function clearSourceAttributes(element: Element): void {
    element.removeAttribute('src')
    element.removeAttribute('srcset')
}

function resetMediaElement(mediaEl: HTMLMediaElement): void {
    mediaEl.pause()
    clearSourceAttributes(mediaEl)
    mediaEl.querySelectorAll('source').forEach((sourceEl) => {
        clearSourceAttributes(sourceEl)
    })
    // `load()` 让浏览器放弃旧的媒体选择和解码管线，再移除整棵章节 DOM。
    mediaEl.load()
}

export function releaseMediaResources(container: HTMLElement | null) {
    if (!container) return

    container.querySelectorAll('img').forEach((img) => {
        clearSourceAttributes(img)
        img.loading = 'lazy'
        img.decoding = 'async'
    })

    container.querySelectorAll('source').forEach((sourceEl) => {
        clearSourceAttributes(sourceEl)
    })

    container.querySelectorAll('video,audio').forEach((mediaEl) => {
        resetMediaElement(mediaEl as HTMLMediaElement)
    })

    // 清空节点必须放在属性清理之后，避免已脱离 DOM 的媒体继续占用解码资源。
    container.replaceChildren()
}
