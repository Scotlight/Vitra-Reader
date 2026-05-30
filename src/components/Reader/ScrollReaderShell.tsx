import { ShadowRenderer, type ReaderStyleConfig } from './ShadowRenderer'
import type { LoadedChapter } from './scrollReader/scrollReaderTypes'
import type { ReactNode, RefObject } from 'react'
import styles from './ScrollReaderView.module.css'

interface ScrollReaderShellProps {
    chapters: LoadedChapter[]
    chapterListRef: RefObject<HTMLDivElement>
    handleShadowReady: (spineIndex: number, node: HTMLElement, height: number) => void
    handleShadowRenderError: (spineIndex: number, chapterId: string, err: Error) => void
    isInitialized: boolean
    readerStyles: ReaderStyleConfig
    renderSelectionUI: () => ReactNode
    shadowQueue: LoadedChapter[]
    shadowResourceExists: (url: string) => boolean
    viewportRef: RefObject<HTMLDivElement>
}

function shouldShowTopLoading(chapters: LoadedChapter[]): boolean {
    const firstChapter = chapters[0]
    return Boolean(
        firstChapter
        && firstChapter.spineIndex > 0
        && (firstChapter.status === 'loading' || firstChapter.status === 'shadow-rendering'),
    )
}

function shouldShowBottomLoading(chapters: LoadedChapter[]): boolean {
    const lastChapter = chapters[chapters.length - 1]
    return Boolean(
        lastChapter
        && (lastChapter.status === 'loading' || lastChapter.status === 'shadow-rendering'),
    )
}

function LoadingIndicator() {
    return (
        <div className={styles.loadingIndicator}>
            <span className={styles.loadingDot} />
            <span className={styles.loadingDot} />
            <span className={styles.loadingDot} />
        </div>
    )
}

export function ScrollReaderShell({
    chapters,
    chapterListRef,
    handleShadowReady,
    handleShadowRenderError,
    isInitialized,
    readerStyles,
    renderSelectionUI,
    shadowQueue,
    shadowResourceExists,
    viewportRef,
}: ScrollReaderShellProps) {
    return (
        <div
            className={styles.scrollViewport}
            ref={viewportRef}
        >
            <div className={styles.shadowArea}>
                {shadowQueue.map(ch => (
                    <ShadowRenderer
                        key={ch.id}
                        htmlContent={ch.htmlContent}
                        htmlFragments={ch.htmlFragments}
                        segmentMetas={ch.segmentMetas}
                        chapterId={ch.id}
                        externalStyles={ch.externalStyles}
                        preprocessed
                        readerStyles={readerStyles}
                        resourceExists={shadowResourceExists}
                        onReady={(node, height) => handleShadowReady(ch.spineIndex, node, height)}
                        onError={(err) => handleShadowRenderError(ch.spineIndex, ch.id, err)}
                    />
                ))}
            </div>

            <div className={styles.chapterList} ref={chapterListRef}>
                {shouldShowTopLoading(chapters) && <LoadingIndicator />}
                {chapters.filter(ch => ch.status === 'error').map(ch => (
                    <div key={ch.id} className={styles.chapterErrorPlaceholder}>
                        章节加载失败
                    </div>
                ))}
            </div>

            {shouldShowBottomLoading(chapters) && <LoadingIndicator />}

            {!isInitialized && chapters.length === 0 && (
                <div className={styles.emptyState}>Loading...</div>
            )}

            {renderSelectionUI()}
        </div>
    )
}
