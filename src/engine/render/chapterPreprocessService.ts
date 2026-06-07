import type {
    ChapterPreprocessInput,
    ChapterPreprocessResult,
} from '../types/chapterPreprocess'
import { preprocessChapterCoreAsync } from './chapterPreprocessCore'
import {
    preprocessChapterByWorker,
    resetChapterPreprocessWorker,
} from './chapterPreprocessWorkerClient'

const DEFAULT_TIMEOUT_MS = 2500
export const MAIN_THREAD_FALLBACK_MAX_HTML_LENGTH = 1_000_000

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
        const htmlLength = normalizedPayload.htmlContent?.length || 0
        if (htmlLength > MAIN_THREAD_FALLBACK_MAX_HTML_LENGTH) {
            console.warn(
                `[ChapterPreprocess] 章节超过主线程降级阈值 ${MAIN_THREAD_FALLBACK_MAX_HTML_LENGTH}，实际大小 ${htmlLength}，Worker 不可用或失败:`,
                error instanceof Error ? error.message : String(error),
            )
            return createRecoverablePreprocessFailure(
                'Chapter exceeds fallback limit and Worker unavailable',
                htmlLength,
            )
        }

        console.warn(
            '[ChapterPreprocess] Worker unavailable, fallback to async core:',
            error instanceof Error ? error.message : String(error),
        )
        return preprocessChapterCoreAsync(normalizedPayload)
    }
}

function createRecoverablePreprocessFailure(reason: string, htmlLength: number): ChapterPreprocessResult {
    return {
        htmlContent: '',
        htmlFragments: [],
        externalStyles: [],
        removedTagCount: 0,
        removedAttributeCount: 0,
        usedFallback: true,
        stylesScoped: false,
        hasRenderableContent: false,
        error: {
            type: 'PREPROCESS_FAILURE',
            reason,
            htmlLength,
            timestamp: Date.now(),
        },
    }
}
