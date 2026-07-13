import { useEffect, useState } from 'react'
import { db } from '@/services/storageService'
import { loadBookTotalActiveMs } from '@/services/readingStatsService'

export interface ReaderBookHeaderInfo {
    readonly author: string
    readonly cover: string
    readonly totalActiveMs: number
}

const EMPTY_HEADER_INFO: ReaderBookHeaderInfo = {
    author: '',
    cover: '',
    totalActiveMs: 0,
}

interface UseReaderBookHeaderInfoOptions {
    readonly bookId: string
    readonly isReady: boolean
}

/** 常驻侧栏头部所需的书籍元数据（封面/作者/累计阅读时长）。 */
export function useReaderBookHeaderInfo({ bookId, isReady }: UseReaderBookHeaderInfoOptions): ReaderBookHeaderInfo {
    const [info, setInfo] = useState<ReaderBookHeaderInfo>(EMPTY_HEADER_INFO)

    useEffect(() => {
        setInfo(EMPTY_HEADER_INFO)
        if (!bookId || !isReady) return

        let alive = true
        void (async () => {
            try {
                const [bookMeta, totalActiveMs] = await Promise.all([
                    db.books.get(bookId),
                    loadBookTotalActiveMs(bookId),
                ])
                if (!alive) return
                setInfo({
                    author: bookMeta?.author || '',
                    cover: bookMeta?.cover || '',
                    totalActiveMs,
                })
            } catch (error) {
                console.warn('[Reader] load book header info failed:', error)
            }
        })()

        return () => {
            alive = false
        }
    }, [bookId, isReady])

    return info
}
