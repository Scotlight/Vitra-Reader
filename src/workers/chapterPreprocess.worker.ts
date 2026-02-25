import type {
    ChapterPreprocessRequest,
    ChapterPreprocessResponse,
} from '../types/chapterPreprocess'
import { preprocessChapterSync } from '../utils/contentSanitizer'

self.onmessage = (event: MessageEvent<ChapterPreprocessRequest>) => {
    const payload = event.data
    if (!payload || typeof payload.id !== 'number') return

    try {
        const result = preprocessChapterSync(payload.payload)
        const response: ChapterPreprocessResponse = {
            id: payload.id,
            ok: true,
            result,
        }
        self.postMessage(response)
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

