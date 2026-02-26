import type {
    ChapterPreprocessRequest,
    ChapterPreprocessResponse,
} from '../types/chapterPreprocess'
import { preprocessChapterCore } from '../utils/chapterPreprocessCore'

self.onmessage = (event: MessageEvent<ChapterPreprocessRequest>) => {
    const payload = event.data
    if (!payload || typeof payload.id !== 'number') return

    try {
        const result = preprocessChapterCore(payload.payload)

        // Piece Table: segmentMetas 只含 (bufferOffset, bufferLength)，htmlContent 为空串。
        // 将 cleanedHtml 作为单个 ArrayBuffer Transfer 传输（零拷贝），
        // 主线程保留 buffer 引用，hydrate 时才按需 slice。
        let contentBuffer: ArrayBuffer | undefined
        if (result.segmentMetas && result.segmentMetas.length > 0) {
            const encoder = new TextEncoder()
            contentBuffer = encoder.encode(result.htmlContent).buffer
        }

        const response: ChapterPreprocessResponse & { _contentBuffer?: ArrayBuffer } = {
            id: payload.id,
            ok: true,
            result,
        }

        if (contentBuffer) {
            response._contentBuffer = contentBuffer
            ;(self.postMessage as (msg: unknown, transfer: Transferable[]) => void)(response, [contentBuffer])
        } else {
            self.postMessage(response)
        }
    } catch (error) {
        const response: ChapterPreprocessResponse = {
            id: payload.id,
            ok: false,
            error: error instanceof Error ? error.message : String(error),
        }
        self.postMessage(response)
    }
}

export {}
