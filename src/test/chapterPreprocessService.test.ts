import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChapterPreprocessInput } from '@/engine/types/chapterPreprocess'
import { preprocessChapterCore } from '@/engine/render/chapterPreprocessCore'

const basePayload: ChapterPreprocessInput = {
    chapterId: 'chapter-1',
    spineIndex: 0,
    htmlContent: '<p>hello</p>',
    externalStyles: [],
    vectorize: false,
}

const originalWorker = globalThis.Worker

async function importServiceModule() {
    vi.resetModules()
    return import('@/engine/render/chapterPreprocessService')
}

describe('chapterPreprocessService', () => {
    beforeEach(() => {
        vi.restoreAllMocks()
    })

    afterEach(() => {
        vi.useRealTimers()
        if (originalWorker === undefined) {
            delete (globalThis as { Worker?: typeof Worker }).Worker
        } else {
            globalThis.Worker = originalWorker
        }
    })

    it('worker 成功返回时回填 segment htmlBuffer', async () => {
        class MockWorker {
            onmessage: ((event: MessageEvent) => void) | null = null
            onerror: ((event: ErrorEvent) => void) | null = null

            postMessage(message: { id: number }) {
                const encoder = new TextEncoder()
                const response = {
                    id: message.id,
                    ok: true,
                    result: {
                        htmlContent: '',
                        htmlFragments: [],
                        externalStyles: [],
                        removedTagCount: 0,
                        removedAttributeCount: 0,
                        usedFallback: false,
                        stylesScoped: true,
                        segmentMetas: [{
                            index: 0,
                            charCount: 12,
                            estimatedHeight: 120,
                            realHeight: null,
                            offsetY: 0,
                            measured: false,
                            htmlContent: '',
                            hasMedia: false,
                        }],
                    },
                    _htmlBuffer: encoder.encode('<p>hello</p>').buffer,
                }
                this.onmessage?.({ data: response } as MessageEvent)
            }

            terminate() {}
        }

        globalThis.Worker = MockWorker as unknown as typeof Worker

        const { preprocessChapterContent } = await importServiceModule()
        const result = await preprocessChapterContent({
            ...basePayload,
            htmlContent: '<p>worker</p>'.repeat(20_000),
            vectorize: true,
            vectorConfig: {
                targetChars: 4_000,
                fontSize: 16,
                pageWidth: 900,
                lineHeight: 1.6,
                paragraphSpacing: 12,
            },
        })

        expect(result.segmentMetas?.[0]?.htmlContent).toBe('<p>hello</p>')
    })

    it('没有 Worker 时同步降级到 preprocessChapterCore', async () => {
        delete (globalThis as { Worker?: typeof Worker }).Worker
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const { preprocessChapterContent } = await importServiceModule()

        const result = await preprocessChapterContent(basePayload)
        const expected = preprocessChapterCore(basePayload)

        expect(result).toEqual(expected)
        expect(warnSpy).toHaveBeenCalled()
    })

    it('Worker 初始化失败时同步降级到 preprocessChapterCore', async () => {
        class FailingWorker {
            constructor() {
                throw new Error('init failed')
            }
        }

        globalThis.Worker = FailingWorker as unknown as typeof Worker
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const { preprocessChapterContent } = await importServiceModule()

        const result = await preprocessChapterContent(basePayload)

        expect(result).toEqual(preprocessChapterCore(basePayload))
        expect(warnSpy).toHaveBeenCalled()
    })

    it('Worker 初始化失败且章节超阈值时不进入主线程 fallback', async () => {
        class FailingWorker {
            constructor() {
                throw new Error('init failed')
            }
        }

        globalThis.Worker = FailingWorker as unknown as typeof Worker
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const { MAIN_THREAD_FALLBACK_MAX_HTML_LENGTH, preprocessChapterContent } = await importServiceModule()

        const result = await preprocessChapterContent({
            ...basePayload,
            htmlContent: `<p>${'x'.repeat(MAIN_THREAD_FALLBACK_MAX_HTML_LENGTH + 1)}</p>`,
        })

        expect(result).toMatchObject({
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
                reason: 'Chapter exceeds fallback limit and Worker unavailable',
                htmlLength: MAIN_THREAD_FALLBACK_MAX_HTML_LENGTH + 8,
            },
        })
        expect(result.error?.timestamp).toEqual(expect.any(Number))
        expect(warnSpy).toHaveBeenCalledWith(
            `[ChapterPreprocess] 章节超过主线程降级阈值 ${MAIN_THREAD_FALLBACK_MAX_HTML_LENGTH}，实际大小 ${MAIN_THREAD_FALLBACK_MAX_HTML_LENGTH + 8}，Worker 不可用或失败:`,
            '[ChapterPreprocess] Worker init failed: init failed',
        )
    })

    it('Worker 超时后同步降级到 preprocessChapterCore', async () => {
        vi.useFakeTimers()

        class HangingWorker {
            onmessage: ((event: MessageEvent) => void) | null = null
            onerror: ((event: ErrorEvent) => void) | null = null
            postMessage() {}
            terminate() {}
        }

        globalThis.Worker = HangingWorker as unknown as typeof Worker
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const { preprocessChapterContent } = await importServiceModule()

        const promise = preprocessChapterContent(basePayload, 1)
        await vi.advanceTimersByTimeAsync(1500)
        await vi.runAllTimersAsync()

        await expect(promise).resolves.toEqual(preprocessChapterCore(basePayload))
        expect(warnSpy).toHaveBeenCalled()
    })

    it('Worker 超时且章节超阈值时不进入主线程 fallback', async () => {
        vi.useFakeTimers()

        class HangingWorker {
            onmessage: ((event: MessageEvent) => void) | null = null
            onerror: ((event: ErrorEvent) => void) | null = null
            postMessage() {}
            terminate() {}
        }

        globalThis.Worker = HangingWorker as unknown as typeof Worker
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const { MAIN_THREAD_FALLBACK_MAX_HTML_LENGTH, preprocessChapterContent } = await importServiceModule()

        const promise = preprocessChapterContent({
            ...basePayload,
            htmlContent: `<p>${'x'.repeat(MAIN_THREAD_FALLBACK_MAX_HTML_LENGTH + 1)}</p>`,
        }, 1)
        await vi.advanceTimersByTimeAsync(1500)
        await vi.runAllTimersAsync()

        await expect(promise).resolves.toMatchObject({
            htmlContent: '',
            htmlFragments: [],
            usedFallback: true,
            hasRenderableContent: false,
            error: {
                type: 'PREPROCESS_FAILURE',
                reason: 'Chapter exceeds fallback limit and Worker unavailable',
                htmlLength: MAIN_THREAD_FALLBACK_MAX_HTML_LENGTH + 8,
            },
        })
        expect(warnSpy).toHaveBeenCalledWith(
            `[ChapterPreprocess] 章节超过主线程降级阈值 ${MAIN_THREAD_FALLBACK_MAX_HTML_LENGTH}，实际大小 ${MAIN_THREAD_FALLBACK_MAX_HTML_LENGTH + 8}，Worker 不可用或失败:`,
            'Worker timeout after 20000ms',
        )
    })

    it('大章节动态超时最高提升到 60 秒', async () => {
        const { resolveChapterPreprocessTimeout } = await importServiceModule()
        expect(resolveChapterPreprocessTimeout(6_000_000, 2_500)).toBe(60_000)
    })
})
