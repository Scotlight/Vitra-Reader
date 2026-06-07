import { createRef } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ScrollReaderShell } from '@/components/Reader/ScrollReaderShell'
import type { ReaderStyleConfig } from '@/components/Reader/ShadowRenderer'
import type { LoadedChapter } from '@/components/Reader/scrollReader/scrollReaderTypes'

const readerStyles: ReaderStyleConfig = {
    textColor: '#111111',
    bgColor: '#ffffff',
    fontSize: 18,
    fontFamily: 'serif',
    lineHeight: 1.7,
    paragraphSpacing: 0.8,
    textIndentEm: 2,
    letterSpacing: 0,
    textAlign: 'left',
    pageWidth: 720,
}

function renderShell(chapters: LoadedChapter[], retryChapter = vi.fn()) {
    return {
        retryChapter,
        ...render(
            <ScrollReaderShell
                chapters={chapters}
                chapterListRef={createRef<HTMLDivElement>()}
                handleShadowReady={vi.fn()}
                handleShadowRenderError={vi.fn()}
                isInitialized
                readerStyles={readerStyles}
                renderSelectionUI={() => null}
                retryChapter={retryChapter}
                shadowQueue={[]}
                shadowResourceExists={() => true}
                viewportRef={createRef<HTMLDivElement>()}
            />,
        ),
    }
}

function createErrorChapter(overrides: Partial<LoadedChapter> = {}): LoadedChapter {
    return {
        spineIndex: 3,
        id: 'chapter-3',
        chapterTitle: '超大章节',
        htmlContent: '',
        htmlFragments: [],
        externalStyles: [],
        domNode: null,
        height: 0,
        status: 'error',
        preprocessError: {
            type: 'PREPROCESS_FAILURE',
            reason: 'Chapter exceeds fallback limit and Worker unavailable',
            htmlLength: 1_572_864,
            timestamp: 1_717_000_000_000,
        },
        ...overrides,
    }
}

describe('ReaderView large chapter preprocess failure', () => {
    afterEach(() => {
        cleanup()
        vi.restoreAllMocks()
    })

    it('显示章节预处理失败占位和重试入口', () => {
        const { retryChapter } = renderShell([createErrorChapter()])

        expect(screen.getByText('超大章节')).toBeInTheDocument()
        expect(screen.getByText('章节内容过大（1.5 MB），预处理失败。')).toBeInTheDocument()

        fireEvent.click(screen.getByRole('button', { name: '重试' }))

        expect(retryChapter).toHaveBeenCalledTimes(1)
        expect(retryChapter).toHaveBeenCalledWith(3)
    })

    it('缺少预处理错误详情时显示通用章节加载失败', () => {
        renderShell([createErrorChapter({ preprocessError: undefined, chapterTitle: undefined, spineIndex: 0 })])

        expect(screen.getByText('章节 1')).toBeInTheDocument()
        expect(screen.getByText('章节加载失败')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument()
    })
})
