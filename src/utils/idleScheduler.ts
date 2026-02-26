export interface IdleTaskOptions {
    timeoutMs?: number
}

const DEFAULT_IDLE_TIMEOUT_MS = 600
const FALLBACK_DELAY_MS = 16

export type IdleTaskHandle = number | null

export function scheduleIdleTask(task: () => void, options: IdleTaskOptions = {}): IdleTaskHandle {
    const timeoutMs = Math.max(0, Math.floor(options.timeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS))
    if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
        return window.requestIdleCallback(() => task(), { timeout: timeoutMs })
    }
    return window.setTimeout(task, FALLBACK_DELAY_MS)
}

export function cancelIdleTask(handle: IdleTaskHandle): void {
    if (handle === null) return
    if (typeof window !== 'undefined' && typeof window.cancelIdleCallback === 'function') {
        window.cancelIdleCallback(handle)
        return
    }
    window.clearTimeout(handle)
}
