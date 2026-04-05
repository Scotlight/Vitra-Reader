import { describe, expect, it } from 'vitest'
import {
    appendShadowQueueChapter,
    createLoadingChapterState,
    createPreprocessedChapterState,
    createVectorRestoreChapterState,
    insertLoadingChapterState,
    queueChapterForShadowRender,
    replaceChapterState,
    rollbackFailedChapterState,
} from '../components/Reader/scrollChapterLoad'

describe('scrollChapterLoad', () => {
    it('根据现有 placeholder 初始化 loading 章节状态', () => {
        const chapter = createLoadingChapterState({
            chapterId: 'ch-2',
            currentReaderStyleKey: 'style-a',
            existingChapter: {
                externalStyles: ['body{}'],
                height: 480,
                segmentMetas: [],
                vectorStyleKey: 'style-old',
            },
            spineIndex: 2,
        })

        expect(chapter).toMatchObject({
            spineIndex: 2,
            id: 'ch-2',
            externalStyles: ['body{}'],
            height: 480,
            vectorStyleKey: 'style-old',
            status: 'loading',
        })
    })

    it('向量缓存恢复章节切到 shadow-rendering 并刷新样式键', () => {
        const restored = createVectorRestoreChapterState(createLoadingChapterState({
            chapterId: 'ch-1',
            currentReaderStyleKey: 'style-a',
            spineIndex: 1,
        }), 'style-b')

        expect(restored.status).toBe('shadow-rendering')
        expect(restored.vectorStyleKey).toBe('style-b')
    })

    it('预处理结果装配为 shadow-rendering 章节状态', () => {
        const loadingChapter = createLoadingChapterState({
            chapterId: 'ch-3',
            currentReaderStyleKey: 'style-a',
            spineIndex: 3,
        })

        const loaded = createPreprocessedChapterState(loadingChapter, {
            htmlContent: '<p>body</p>',
            htmlFragments: ['<p>body</p>'],
            externalStyles: ['p{}'],
            segmentMetas: [],
        }, 'style-c')

        expect(loaded).toMatchObject({
            htmlContent: '<p>body</p>',
            htmlFragments: ['<p>body</p>'],
            externalStyles: ['p{}'],
            vectorStyleKey: 'style-c',
            status: 'shadow-rendering',
        })
    })

    it('按方向插入 loading 章节状态', () => {
        const loadingChapter = createLoadingChapterState({
            chapterId: 'ch-2',
            currentReaderStyleKey: 'style-a',
            spineIndex: 2,
        })

        expect(insertLoadingChapterState([], loadingChapter, undefined, 'next')).toEqual([loadingChapter])
        expect(insertLoadingChapterState([
            createLoadingChapterState({ chapterId: 'ch-1', currentReaderStyleKey: 'style-a', spineIndex: 1 }),
        ], loadingChapter, undefined, 'prev')[0]).toEqual(loadingChapter)
    })

    it('替换章节状态并对 shadowQueue 去重入队', () => {
        const loadingChapter = createLoadingChapterState({
            chapterId: 'ch-3',
            currentReaderStyleKey: 'style-a',
            spineIndex: 3,
        })
        const updatedChapter = createVectorRestoreChapterState(loadingChapter, 'style-b')

        expect(replaceChapterState([loadingChapter], updatedChapter)).toEqual([updatedChapter])
        expect(appendShadowQueueChapter([loadingChapter], updatedChapter)).toEqual([updatedChapter])
        expect(queueChapterForShadowRender({
            chapter: updatedChapter,
            chapters: [loadingChapter],
            shadowQueue: [loadingChapter],
        })).toEqual({
            chapters: [updatedChapter],
            shadowQueue: [updatedChapter],
        })
    })

    it('失败回滚时恢复 placeholder 或移除新章节', () => {
        const placeholder = {
            ...createLoadingChapterState({
                chapterId: 'ch-4',
                currentReaderStyleKey: 'style-a',
                spineIndex: 4,
            }),
            status: 'placeholder' as const,
        }
        const loadingChapter = createLoadingChapterState({
            chapterId: 'ch-4',
            currentReaderStyleKey: 'style-a',
            spineIndex: 4,
        })

        expect(rollbackFailedChapterState([loadingChapter], 4, placeholder)).toEqual([placeholder])
        expect(rollbackFailedChapterState([loadingChapter], 4, undefined)).toEqual([])
    })
})
