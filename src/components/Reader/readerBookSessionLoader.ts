import { db } from '@/services/storageService'
import { resolveReaderRenderMode } from '@/engine/core/readerRenderMode'
import type { BookFormat, ContentProvider, TocItem } from '@/engine/core/contentProvider'
import type { PageTurnMode } from '@/stores/useSettingsStore'
import { buildFallbackTocFromSpine } from './readerToc'
import { snapLocationToReadable } from './readableSpine'

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
    readonly initialSectionHref: string
    readonly isReady: boolean
    readonly paginatedParams: ReaderPaginatedParams
    readonly provider: ContentProvider | null
    readonly toc: TocItem[]
    readonly scrollParams: ReaderScrollParams
}

export const INITIAL_READER_BOOK_SESSION_STATE: ReaderBookSessionState = {
    bookFormat: 'epub',
    bookTitleText: 'Reading',
    currentProgress: 0,
    initialSectionHref: '',
    isReady: false,
    paginatedParams: INITIAL_PAGINATED_PARAMS,
    provider: null,
    toc: [],
    scrollParams: INITIAL_SCROLL_PARAMS,
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
        const initialSectionHref = resolveInitialSectionHref(provider, initialLocation.spineIndex)
        return {
            bookFormat: format,
            bookTitleText: bookTitle,
            currentProgress: progressValue,
            initialSectionHref,
            isReady: true,
            paginatedParams: resolvePaginatedParams(format, pageTurnMode, initialLocation),
            provider,
            toc,
            scrollParams: resolveScrollParams(format, pageTurnMode, initialLocation),
        }
    } catch (error) {
        console.error('[ReaderView] book pipeline init failed:', error)
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
    const [{ BookPipeline }, { BookContentAdapter }] = await Promise.all([
        import('@/engine/pipeline/pipeline'),
        import('@/engine/pipeline/contentAdapter'),
    ])
    const pipeline = new BookPipeline()
    const handle = await pipeline.open({
        buffer: bookData,
        filename: `${fileStem}.${format}`,
    })
    const parsedBook = await handle.ready
    const provider = new BookContentAdapter(parsedBook, bookId, bookData)
    await provider.init()
    return provider
}

function resolveSessionToc(provider: ContentProvider): TocItem[] {
    const toc = provider.getToc()
    return toc.length > 0 ? toc : buildFallbackTocFromSpine(provider.getSpineItems())
}

function resolveInitialLocation(provider: ContentProvider, location?: string) {
    // 落点若在书内目录页（nav 文档）上——包括"无进度从头开"和"历史进度恰好停在目录页"——
    // 统一向后修正到第一个正文项
    return snapLocationToReadable(provider.getSpineItems(), resolveRawInitialLocation(provider, location))
}

function resolveRawInitialLocation(provider: ContentProvider, location?: string) {
    if (!location) return { spineIndex: 0, position: 0 }
    if (location.startsWith('vitra:') || location.startsWith('bdise:')) {
        const parts = location.split(':')
        return {
            spineIndex: parseInt(parts[1] || '', 10) || 0,
            position: parseInt(parts[2] || '', 10) || 0,
        }
    }
    const spineIndex = provider.getSpineIndexByHref(location)
    return { spineIndex: spineIndex >= 0 ? spineIndex : 0, position: 0 }
}

export function resolveInitialSectionHref(provider: Pick<ContentProvider, 'getSpineItems'>, spineIndex: number): string {
    const spineItems = provider.getSpineItems()
    return spineItems[Math.max(0, Math.min(spineIndex, spineItems.length - 1))]?.href || ''
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
