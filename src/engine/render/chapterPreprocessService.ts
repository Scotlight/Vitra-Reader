import type {
    ChapterPreprocessInput,
    ChapterPreprocessRequest,
    ChapterPreprocessResponse,
    ChapterPreprocessResult,
} from '../types/chapterPreprocess'

const DEFAULT_TIMEOUT_MS = 2500

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

function resetWorker() {
    if (workerInstance) {
        workerInstance.terminate()
        workerInstance = null
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
            { type: 'module' }
        )

        worker.onmessage = (event: MessageEvent<ChapterPreprocessResponse & { _htmlBuffer?: ArrayBuffer }>) => {
            const payload = event.data
            if (!payload || typeof payload.id !== 'number') return

            const pendingTask = pendingTasks.get(payload.id)
            if (!pendingTask) return

            pendingTasks.delete(payload.id)
            window.clearTimeout(pendingTask.timerId)

            if (payload.ok && payload.result) {
                // Transferable: 解码 NUL 分隔 ArrayBuffer，回填各段 htmlContent
                if (payload._htmlBuffer && payload.result.segmentMetas && payload.result.segmentMetas.length > 0) {
                    const decoder = new TextDecoder()
                    const joined = decoder.decode(payload._htmlBuffer)
                    const parts = joined.split('\0')
                    for (let i = 0; i < payload.result.segmentMetas.length && i < parts.length; i++) {
                        payload.result.segmentMetas[i].htmlContent = parts[i]
                    }
                }
                pendingTask.resolve(payload.result)
                return
            }

            pendingTask.reject(new Error(payload.error || 'Worker preprocess failed'))
        }

        worker.onerror = (event) => {
            console.error('[ChapterPreprocess] Worker runtime error:', event.message)
            rejectAllPending(new Error(event.message || 'Worker crashed'))
            resetWorker()
        }

        workerInstance = worker
        return workerInstance
    } catch (error) {
        resetWorker()
        const reason = error instanceof Error ? error.message : String(error)
        throw new Error(`[ChapterPreprocess] Worker init failed: ${reason}`)
    }
}

function preprocessByWorker(
    worker: Worker,
    payload: ChapterPreprocessInput,
    timeoutMs: number,
): Promise<ChapterPreprocessResult> {
    return new Promise((resolve, reject) => {
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

export async function preprocessChapterContent(
    payload: ChapterPreprocessInput,
    timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<ChapterPreprocessResult> {
    const normalizedPayload: ChapterPreprocessInput = {
        ...payload,
        externalStyles: payload.externalStyles || [],
    }

    const worker = ensureWorker()

    try {
        return await preprocessByWorker(worker, normalizedPayload, timeoutMs)
    } catch (error) {
        resetWorker()
        throw (error instanceof Error ? error : new Error(String(error)))
    }
}
