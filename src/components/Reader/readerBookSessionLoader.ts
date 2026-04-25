import { db } from '@/services/storageService'
import { resolveReaderRenderMode } from '@/engine'
import type { BookFormat, ContentProvider, TocItem } from '@/engine/core/contentProvider'
import type { PageTurnMode } from '@/stores/useSettingsStore'
import { buildFallbackTocFromSpine } from './readerToc'

export interface ReaderScrollParams {
    readonly initialSpineIndex: number
    readonly initialScrollOffset: number
}

export interface ReaderPaginatedParams {
    readonly initialSpineIndex: number
    readonly initialPage: number
}

export const INITIAL_SCROLL_PARAMS: ReaderScrollParams = Object.freeze({ initialSpineIndex: 0, initialScrollOffset: 0 })
export const INITIAL_PAGINATED_PARAMS: ReaderPaginatedParams = Object.freeze({ initialSpineIndex: 0, initialPage: 0 })

export interface ReaderBookSessionState {
    readonly bookFormat: BookFormat
    readonly bookTitleText: string
    readonly currentProgress: number
    readonly isReady: boolean
    readonly paginatedParams: ReaderPaginatedParams
    readonly provider: ContentProvider | null
    readonly toc: TocItem[]
    readonly vitraScrollParams: ReaderScrollParams
}

export const INITIAL_READER_BOOK_SESSION_STATE: ReaderBookSessionState = {
    bookFormat: 'epub',
    bookTitleText: 'Reading',
    currentProgress: 0,
    isReady: false,
    paginatedParams: INITIAL_PAGINATED_PARAMS,
    provider: null,
    toc: [],
    vitraScrollParams: INITIAL_SCROLL_PARAMS,
}

export async function loadReaderBookSession(
    bookId: string,
    pageTurnMode: PageTurnMode,
): Promise<ReaderBookSessionState> {
    const [bookMeta, file, progress] = await loadStoredReaderData(bookId)
    const bookTitle = bookMeta?.title || 'Reading'
    if (!file) {
        return { ...INITIAL_READER_BOOK_SESSION_STATE, bookTitleText: bookTitle }
    }

    const format = (bookMeta?.format || 'epub') as BookFormat
    const progressValue = Number(progress?.percentage || 0)
    try {
        const provider = await openReaderProvider(bookId, bookMeta?.title || bookId, file.data as ArrayBuffer, format)
        const toc = resolveSessionToc(provider)
        const initialLocation = resolveInitialLocation(provider, progress?.location)
        return {
            bookFormat: format,
            bookTitleText: bookTitle,
            currentProgress: progressValue,
            isReady: true,
            paginatedParams: resolvePaginatedParams(format, pageTurnMode, initialLocation),
            provider,
            toc,
            vitraScrollParams: resolveScrollParams(format, pageTurnMode, initialLocation),
        }
    } catch (error) {
        console.error('[ReaderView] Vitra pipeline init failed:', error)
        return { ...INITIAL_READER_BOOK_SESSION_STATE, bookTitleText: bookTitle }
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
    const [{ VitraPipeline }, { VitraContentAdapter }] = await Promise.all([
        import('../../engine/pipeline/vitraPipeline'),
        import('../../engine/pipeline/vitraContentAdapter'),
    ])
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
