import { useEffect, useState } from 'react'
import { db } from '../../services/storageService'
import { VitraContentAdapter, VitraPipeline, resolveReaderRenderMode } from '../../engine'
import type { BookFormat, ContentProvider, TocItem } from '../../engine/core/contentProvider'
import type { PageTurnMode } from '../../stores/useSettingsStore'
import { buildFallbackTocFromSpine } from './readerToc'

interface ReaderScrollParams {
    readonly initialSpineIndex: number
    readonly initialScrollOffset: number
}

interface ReaderPaginatedParams {
    readonly initialSpineIndex: number
    readonly initialPage: number
}

const INITIAL_SCROLL_PARAMS: ReaderScrollParams = Object.freeze({ initialSpineIndex: 0, initialScrollOffset: 0 })
const INITIAL_PAGINATED_PARAMS: ReaderPaginatedParams = Object.freeze({ initialSpineIndex: 0, initialPage: 0 })

interface ReaderBookSessionState {
    readonly bookFormat: BookFormat
    readonly bookTitleText: string
    readonly currentProgress: number
    readonly isReady: boolean
    readonly paginatedParams: ReaderPaginatedParams
    readonly provider: ContentProvider | null
    readonly toc: TocItem[]
    readonly vitraScrollParams: ReaderScrollParams
}

interface UseReaderBookSessionOptions {
    readonly bookId: string
    readonly pageTurnMode: PageTurnMode
}

const INITIAL_STATE: ReaderBookSessionState = {
    bookFormat: 'epub',
    bookTitleText: 'Reading',
    currentProgress: 0,
    isReady: false,
    paginatedParams: INITIAL_PAGINATED_PARAMS,
    provider: null,
    toc: [],
    vitraScrollParams: INITIAL_SCROLL_PARAMS,
}

export function useReaderBookSession({ bookId, pageTurnMode }: UseReaderBookSessionOptions) {
    const [session, setSession] = useState<ReaderBookSessionState>(INITIAL_STATE)

    useEffect(() => {
        let alive = true
        let activeProvider: ContentProvider | null = null

        setSession((current) => ({ ...current, isReady: false, provider: null, toc: [] }))

        void loadReaderBookSession(bookId, pageTurnMode, (nextSession) => {
            if (!alive) {
                nextSession.provider?.destroy()
                return
            }
            activeProvider = nextSession.provider
            setSession(nextSession)
        })

        return () => {
            alive = false
            activeProvider?.destroy()
        }
    }, [bookId, pageTurnMode])

    return {
        ...session,
        setCurrentProgress: (progress: number) => {
            setSession((current) => ({ ...current, currentProgress: progress }))
        },
    }
}

async function loadReaderBookSession(
    bookId: string,
    pageTurnMode: PageTurnMode,
    commit: (session: ReaderBookSessionState) => void,
) {
    const [bookMeta, file, progress] = await loadStoredReaderData(bookId)
    const bookTitle = bookMeta?.title || 'Reading'
    if (!file) {
        commit({ ...INITIAL_STATE, bookTitleText: bookTitle })
        return
    }

    const format = (bookMeta?.format || 'epub') as BookFormat
    const progressValue = Number(progress?.percentage || 0)
    try {
        const provider = await openReaderProvider(bookId, bookMeta?.title || bookId, file.data as ArrayBuffer, format)
        const toc = resolveSessionToc(provider)
        const initialLocation = resolveInitialLocation(provider, progress?.location)
        commit({
            bookFormat: format,
            bookTitleText: bookTitle,
            currentProgress: progressValue,
            isReady: true,
            paginatedParams: resolvePaginatedParams(format, pageTurnMode, initialLocation),
            provider,
            toc,
            vitraScrollParams: resolveScrollParams(format, pageTurnMode, initialLocation),
        })
    } catch (error) {
        console.error('[ReaderView] Vitra pipeline init failed:', error)
        commit({ ...INITIAL_STATE, bookTitleText: bookTitle })
    }
}

async function loadStoredReaderData(bookId: string) {
    return Promise.all([
        db.books.get(bookId),
        db.bookFiles.get(bookId),
        db.progress.get(bookId),
    ] as const)
}

async function openReaderProvider(
    bookId: string,
    fileStem: string,
    bookData: ArrayBuffer,
    format: BookFormat,
): Promise<ContentProvider> {
    const pipeline = new VitraPipeline()
    const handle = await pipeline.open({
        buffer: bookData,
        filename: `${fileStem}.${format}`,
    })
    const vitraBook = await handle.ready
    const provider = new VitraContentAdapter(vitraBook, bookId, bookData)
    await provider.init()
    return provider
}

function resolveSessionToc(provider: ContentProvider): TocItem[] {
    const toc = provider.getToc()
    return toc.length > 0 ? toc : buildFallbackTocFromSpine(provider.getSpineItems())
}

function resolveInitialLocation(provider: ContentProvider, location?: string) {
    if (!location) return { spineIndex: 0, position: 0 }
    if (location.startsWith('vitra:') || location.startsWith('bdise:')) {
        const parts = location.split(':')
        return {
            spineIndex: parseInt(parts[1], 10) || 0,
            position: parseInt(parts[2], 10) || 0,
        }
    }
    const spineIndex = provider.getSpineIndexByHref(location)
    return { spineIndex: spineIndex >= 0 ? spineIndex : 0, position: 0 }
}

function resolveScrollParams(
    format: BookFormat,
    pageTurnMode: PageTurnMode,
    location: { spineIndex: number; position: number },
) {
    return resolveReaderRenderMode(format, pageTurnMode).effectiveMode === 'scrolled-continuous'
        ? { initialSpineIndex: location.spineIndex, initialScrollOffset: location.position }
        : INITIAL_SCROLL_PARAMS
}

function resolvePaginatedParams(
    format: BookFormat,
    pageTurnMode: PageTurnMode,
    location: { spineIndex: number; position: number },
) {
    return resolveReaderRenderMode(format, pageTurnMode).effectiveMode === 'scrolled-continuous'
        ? INITIAL_PAGINATED_PARAMS
        : { initialSpineIndex: location.spineIndex, initialPage: location.position }
}
