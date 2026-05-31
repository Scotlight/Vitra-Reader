// 目录自动居中：把当前阅读章（data-toc-active）滚到滚动容器垂直中部，
// 常规 ReaderLeftPanel 与全屏沉浸 ImmersiveReaderShell 两套目录共用。

export function centerActiveTocItem(container: HTMLElement): boolean {
    const activeItem = container.querySelector<HTMLElement>('button[data-toc-active="true"]')
    if (!activeItem) return false

    const containerRect = container.getBoundingClientRect()
    if (containerRect.height <= 0) return false

    const itemRect = activeItem.getBoundingClientRect()
    const targetTop =
        container.scrollTop +
        (itemRect.top - containerRect.top) -
        containerRect.height / 2 +
        itemRect.height / 2

    container.scrollTo({ top: Math.max(0, targetTop), behavior: 'auto' })
    return true
}

interface ScheduleCenterActiveTocOptions {
    readonly maxFrames?: number
}

// rAF 重试：每帧试一次，命中即停；最多 maxFrames 帧兜底，规避面板/胶囊展开
// 动画期容器尺寸未就绪导致的测量不稳。返回 cancel 取消未决帧。
export function scheduleCenterActiveToc(
    getContainer: () => HTMLElement | null,
    options: ScheduleCenterActiveTocOptions = {},
): () => void {
    const maxFrames = options.maxFrames ?? 10
    let frameHandle: number | null = null
    let remaining = maxFrames

    const tick = () => {
        frameHandle = null
        const container = getContainer()
        if (container && centerActiveTocItem(container)) return
        remaining -= 1
        if (remaining <= 0) return
        frameHandle = requestAnimationFrame(tick)
    }

    frameHandle = requestAnimationFrame(tick)

    return () => {
        if (frameHandle !== null) {
            cancelAnimationFrame(frameHandle)
            frameHandle = null
        }
    }
}
