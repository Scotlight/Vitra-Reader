import type {
    ChapterPreprocessInput,
    ChapterPreprocessRequest,
    ChapterPreprocessResponse,
    ChapterPreprocessResult,
} from '../types/chapterPreprocess'

interface PendingTask {
    resolve: (result: ChapterPreprocessResult) => void
    reject: (reason: Error) => void
    timerId: number
}

let workerInstance: Worker | null = null
let requestIdCounter = 0
const pendingTasks = new Map<number, PendingTask>()

function rejectAllPending(error: Error) {
    for (const task of pendingTasks.values()) {
        window.clearTimeout(task.timerId)
        task.reject(error)
    }
    pendingTasks.clear()
}

export function resetChapterPreprocessWorker() {
    if (workerInstance) {
        workerInstance.terminate()
        workerInstance = null
    }
}

function hydrateTransferredSegmentHtml(payload: ChapterPreprocessResponse & { _htmlBuffer?: ArrayBuffer }) {
    if (!payload.ok || !payload.result?.segmentMetas || !payload._htmlBuffer) return
    if (payload.result.segmentMetas.length === 0) return

    const decoder = new TextDecoder()
    const joined = decoder.decode(payload._htmlBuffer)
    const parts = joined.split('\0')
    for (let index = 0; index < payload.result.segmentMetas.length && index < parts.length; index += 1) {
        payload.result.segmentMetas[index].htmlContent = parts[index]
    }
}

function ensureWorker(): Worker {
    if (typeof Worker === 'undefined') {
        throw new Error('Chapter preprocess worker is not supported in current runtime')
    }

    if (workerInstance) {
        return workerInstance
    }

    try {
        const worker = new Worker(
            new URL('../worker/chapterPreprocess.worker.ts', import.meta.url),
            { type: 'module' },
        )

        worker.onmessage = (event: MessageEvent<ChapterPreprocessResponse & { _htmlBuffer?: ArrayBuffer }>) => {
            const payload = event.data
            if (!payload || typeof payload.id !== 'number') return

            const pendingTask = pendingTasks.get(payload.id)
            if (!pendingTask) return

            pendingTasks.delete(payload.id)
            window.clearTimeout(pendingTask.timerId)

            if (payload.ok && payload.result) {
                hydrateTransferredSegmentHtml(payload)
                pendingTask.resolve(payload.result)
                return
            }

            pendingTask.reject(new Error(payload.error || 'Worker preprocess failed'))
        }

        worker.onerror = (event) => {
            console.error('[ChapterPreprocess] Worker runtime error:', event.message)
            rejectAllPending(new Error(event.message || 'Worker crashed'))
            resetChapterPreprocessWorker()
        }

        workerInstance = worker
        return workerInstance
    } catch (error) {
        resetChapterPreprocessWorker()
        const reason = error instanceof Error ? error.message : String(error)
        throw new Error(`[ChapterPreprocess] Worker init failed: ${reason}`)
    }
}

export function preprocessChapterByWorker(
    payload: ChapterPreprocessInput,
    timeoutMs: number,
): Promise<ChapterPreprocessResult> {
    return new Promise((resolve, reject) => {
        const worker = ensureWorker()
        const requestId = ++requestIdCounter
        const timerId = window.setTimeout(() => {
            pendingTasks.delete(requestId)
            reject(new Error(`Worker timeout after ${timeoutMs}ms`))
        }, timeoutMs)

        pendingTasks.set(requestId, {
            resolve,
            reject,
            timerId,
        })

        const requestPayload: ChapterPreprocessRequest = {
            id: requestId,
            payload,
        }

        try {
            worker.postMessage(requestPayload)
        } catch (error) {
            window.clearTimeout(timerId)
            pendingTasks.delete(requestId)
            reject(error instanceof Error ? error : new Error(String(error)))
        }
    })
}
