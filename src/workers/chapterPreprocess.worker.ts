import type {
    ChapterPreprocessRequest,
    ChapterPreprocessResponse,
} from '../types/chapterPreprocess'
import { preprocessChapterCore } from '../utils/chapterPreprocessCore'

self.onmessage = (event: MessageEvent<ChapterPreprocessRequest>) => {
    const payload = event.data
    if (!payload || typeof payload.id !== 'number' || !payload.payload || typeof payload.payload.htmlContent !== 'string') return

    try {
        const result = preprocessChapterCore(payload.payload)

        // Transferable Objects: 将各段 htmlContent 编码为 NUL 分隔的单个 ArrayBuffer
        // 传输后清空 segmentMetas 中的 htmlContent（零拷贝传输）
        let htmlBuffer: ArrayBuffer | undefined
        if (result.segmentMetas && result.segmentMetas.length > 0) {
            const encoder = new TextEncoder()
            const joined = result.segmentMetas.map(m => m.htmlContent).join('\0')
            htmlBuffer = encoder.encode(joined).buffer
            // 清空 htmlContent 避免结构化克隆时重复复制
            for (const meta of result.segmentMetas) {
                meta.htmlContent = ''
            }
        }

        const response: ChapterPreprocessResponse & { _htmlBuffer?: ArrayBuffer } = {
            id: payload.id,
            ok: true,
            result,
        }

        if (htmlBuffer) {
            response._htmlBuffer = htmlBuffer
            ;(self.postMessage as (msg: unknown, transfer: Transferable[]) => void)(response, [htmlBuffer])
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
