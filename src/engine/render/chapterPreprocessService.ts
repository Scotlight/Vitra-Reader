import type {
    ChapterPreprocessInput,
    ChapterPreprocessResult,
} from '../types/chapterPreprocess'
import { preprocessChapterCore } from './chapterPreprocessCore'
import {
    preprocessChapterByWorker,
    resetChapterPreprocessWorker,
} from './chapterPreprocessWorkerClient'

const DEFAULT_TIMEOUT_MS = 2500

/** 根据 HTML 大小动态计算超时（避免大章节误超时） */
export function resolveChapterPreprocessTimeout(htmlLength: number, baseTimeout: number): number {
    if (htmlLength < 100_000) return Math.max(1500, baseTimeout)
    if (htmlLength < 300_000) return Math.max(3500, baseTimeout)
    if (htmlLength < 500_000) return Math.max(5000, baseTimeout)
    if (htmlLength < 1_000_000) return Math.max(10_000, baseTimeout)
    if (htmlLength < 2_500_000) return Math.max(20_000, baseTimeout)
    if (htmlLength < 5_000_000) return Math.max(40_000, baseTimeout)
    return Math.max(60_000, baseTimeout)
}

function preprocessSynchronously(payload: ChapterPreprocessInput): ChapterPreprocessResult {
    return preprocessChapterCore(payload)
}

export async function preprocessChapterContent(
    payload: ChapterPreprocessInput,
    timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<ChapterPreprocessResult> {
    const normalizedPayload: ChapterPreprocessInput = {
        ...payload,
        externalStyles: payload.externalStyles || [],
    }

    const effectiveTimeout = resolveChapterPreprocessTimeout(
        payload.htmlContent?.length || 0,
        timeoutMs,
    )

    try {
        return await preprocessChapterByWorker(normalizedPayload, effectiveTimeout)
    } catch (error) {
        resetChapterPreprocessWorker()
        console.warn(
            '[ChapterPreprocess] Worker unavailable, fallback to sync core:',
            error instanceof Error ? error.message : String(error),
        )
        return preprocessSynchronously(normalizedPayload)
    }
}
