/**
 * ?????????
 *
 * ??????? DOM ???????????????? Blob URL?
 * EPUB ??? Blob ????? assetLoader ????????????
 * ?????????????
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

    container.replaceChildren()
}
