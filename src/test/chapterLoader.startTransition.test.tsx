import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { useRef } from 'react';
import type { MutableRefObject } from 'react';
import type { ContentProvider, SpineItemInfo, TocItem, SearchResult } from '@/engine/core/contentProvider';
import type { ChapterMetaVector, SegmentMeta } from '@/engine/types/vectorRender';
import type { ReaderStyleConfig } from '@/components/Reader/ShadowRenderer';
import type { LoadedChapter, PipelineState } from '@/components/Reader/scrollReader/scrollReaderTypes';
import type { ScrollReaderRefs } from '@/components/Reader/scrollReader/useScrollReaderRefs';
import type { VirtualChapterRuntime } from '@/components/Reader/scrollReader/useVirtualChapterRuntime';
import { ScrollPipelineState } from '@/components/Reader/scrollReader/scrollReaderTypes';
import { useChapterLoader } from '@/components/Reader/scrollReader/useChapterLoader';
import { useShadowRenderComplete } from '@/components/Reader/scrollReader/useShadowRenderComplete';

const mocks = vi.hoisted(() => ({
    preprocessChapterContentMock: vi.fn(),
    startTransitionMock: vi.fn((callback: () => void) => callback()),
}));

vi.mock('react', async () => {
    const actual = await vi.importActual<typeof import('react')>('react');
    return {
        ...actual,
        startTransition: mocks.startTransitionMock,
    };
});

vi.mock('@/engine/render/chapterPreprocessService', () => ({
    preprocessChapterContent: mocks.preprocessChapterContentMock,
}));

const DEFAULT_READER_STYLES: ReaderStyleConfig = {
    textColor: '#111',
    bgColor: '#fff',
    fontSize: 16,
    fontFamily: 'Georgia',
    lineHeight: 1.6,
    paragraphSpacing: 12,
    textIndentEm: 0,
    letterSpacing: 0,
    textAlign: 'left',
    pageWidth: 900,
};

interface CapturedLoader {
    loadChapter: ReturnType<typeof useChapterLoader>['loadChapter'];
}

function createSegment(overrides: Partial<SegmentMeta> = {}): SegmentMeta {
    return {
        index: 0,
        charCount: 200_000,
        estimatedHeight: 240,
        realHeight: null,
        offsetY: 0,
        measured: false,
        htmlContent: '<p>segment body</p>',
        hasMedia: false,
        ...overrides,
    };
}

function createProvider(): ContentProvider {
    const spineItems: SpineItemInfo[] = [
        { index: 0, href: 'chapter-1.xhtml', id: 'chapter-1', linear: true },
    ];

    return {
        init: async () => undefined,
        destroy: () => undefined,
        getToc: (): TocItem[] => [],
        getSpineItems: () => spineItems,
        getSpineIndexByHref: () => 0,
        extractChapterHtml: vi.fn(async () => '<p>body</p>'),
        extractChapterStyles: vi.fn(async () => ['p{}']),
        unloadChapter: vi.fn(),
        search: async (): Promise<SearchResult[]> => [],
        isAssetUrlAvailable: () => true,
    };
}

function createRefs(initialChapters: LoadedChapter[] = []): ScrollReaderRefs {
    const currentStyleKey = [
        'fontSize=16',
        'pageWidth=900',
        'lineHeight=1.6',
        'paragraphSpacing=12',
        'textIndentEm=0',
        'letterSpacing=0',
        'textAlign=left',
        'fontFamily=Georgia',
        'textColor=#111',
        'bgColor=#fff',
        'isPdfDarkMode=0',
    ].join('|');

    return {
        viewportRef: { current: null } as MutableRefObject<HTMLDivElement | null>,
        chapterListRef: { current: null } as MutableRefObject<HTMLDivElement | null>,
        lastScrollTopRef: { current: 0 },
        pipelineRef: { current: ScrollPipelineState.IDLE as PipelineState },
        loadingLockRef: { current: new Set<number>() },
        progressTimerRef: { current: null },
        scrollIdleTimerRef: { current: null },
        idlePrefetchHandleRef: { current: null },
        isUserScrollingRef: { current: false },
        initialScrollDone: { current: false },
        pendingSearchTextRef: { current: null },
        jumpGenerationRef: { current: 0 },
        chaptersRef: { current: initialChapters },
        spineItemsRef: { current: [{ index: 0, href: 'chapter-1.xhtml', id: 'chapter-1', linear: true }] },
        resizeObserverRef: { current: null },
        observedResizeNodesRef: { current: new Set<HTMLElement>() },
        observedResizeHeightsRef: { current: new WeakMap<HTMLElement, number>() },
        segmentResizeCallbackRef: { current: null },
        virtualSyncRafRef: { current: null },
        highlightDirtyChaptersRef: { current: new Set<number>() },
        highlightIdleHandlesRef: { current: new Map() },
        lastReportedProgressRef: { current: null },
        pendingProgressSnapshotRef: { current: null },
        pendingReadyRef: { current: [] },
        pendingReadyRafRef: { current: null },
        pendingDeltaRef: { current: 0 },
        flushRafRef: { current: null },
        unlockAdjustingRafRef: { current: null },
        ignoreScrollEventRef: { current: false },
        lastKnownAnchorIndexRef: { current: 0 },
        readerStylesKeyRef: { current: currentStyleKey },
    };
}

function renderLoader(options?: {
    initialChapters?: LoadedChapter[];
    onSetChapters?: (next: LoadedChapter[]) => void;
}) {
    const captured: CapturedLoader = {
        loadChapter: async () => undefined,
    };
    const refs = createRefs(options?.initialChapters);
    const provider = createProvider();
    const setShadowQueue = vi.fn();
    const setChapters = vi.fn((updater: (prev: LoadedChapter[]) => LoadedChapter[]) => {
        const next = updater(refs.chaptersRef.current);
        refs.chaptersRef.current = next;
        options?.onSetChapters?.(next);
    });

    function Probe() {
        const chapterVectorsRef = useRef<Map<string, ChapterMetaVector>>(new Map());
        const renderedHighlightsRef = useRef<Set<string>>(new Set());
        const loader = useChapterLoader(refs, {
            provider,
            readerStyles: DEFAULT_READER_STYLES,
            currentSpineIndex: 0,
            isInitialized: false,
            chapterVectorsRef,
            renderedHighlightsRef,
            setChapters,
            setShadowQueue,
            scheduleIdlePrefetch: vi.fn(),
            cancelIdlePrefetch: vi.fn(),
        });

        captured.loadChapter = loader.loadChapter;
        return null;
    }

    render(<Probe />);

    return { captured, refs, setChapters, setShadowQueue };
}

describe('useChapterLoader startTransition', () => {
    afterEach(() => {
        vi.clearAllMocks();
        vi.unstubAllGlobals();
    });

    it('章节直接进入 ready 时用 startTransition 包裹 setChapters，loading 不包裹', async () => {
        mocks.preprocessChapterContentMock.mockResolvedValue({
            htmlContent: '',
            htmlFragments: [],
            externalStyles: ['p{}'],
            removedTagCount: 0,
            removedAttributeCount: 0,
            usedFallback: false,
            stylesScoped: true,
            segmentMetas: [
                createSegment({ index: 0, charCount: 260_000 }),
                createSegment({ index: 1, charCount: 260_000, offsetY: 240 }),
            ],
        });
        const setChaptersCallSizes: number[] = [];
        const { captured, setChapters } = renderLoader({
            onSetChapters: () => {
                setChaptersCallSizes.push(mocks.startTransitionMock.mock.calls.length);
            },
        });

        await act(async () => {
            await captured.loadChapter(0, 'initial');
        });

        expect(setChapters).toHaveBeenCalledTimes(2);
        expect(setChaptersCallSizes).toEqual([0, 1]);
        expect(mocks.startTransitionMock).toHaveBeenCalledTimes(1);
    });

    it('章节进入 shadow-rendering 时用 startTransition 包裹 setChapters，loading 不包裹', async () => {
        mocks.preprocessChapterContentMock.mockResolvedValue({
            htmlContent: '<p>small chapter</p>',
            htmlFragments: ['<p>small chapter</p>'],
            externalStyles: ['p{}'],
            removedTagCount: 0,
            removedAttributeCount: 0,
            usedFallback: false,
            stylesScoped: true,
            segmentMetas: [createSegment({ charCount: 20_000 })],
        });
        const setChaptersCallSizes: number[] = [];
        const { captured, setChapters } = renderLoader({
            onSetChapters: () => {
                setChaptersCallSizes.push(mocks.startTransitionMock.mock.calls.length);
            },
        });

        await act(async () => {
            await captured.loadChapter(0, 'initial');
        });

        expect(setChapters).toHaveBeenCalledTimes(2);
        expect(setChaptersCallSizes).toEqual([0, 1]);
        expect(mocks.startTransitionMock).toHaveBeenCalledTimes(1);
    });

    it('章节加载失败时 error 标记不使用 startTransition', async () => {
        mocks.preprocessChapterContentMock.mockRejectedValue(new Error('load failed'));
        const { captured, setChapters } = renderLoader();

        await act(async () => {
            await captured.loadChapter(0, 'initial');
        });

        expect(setChapters).toHaveBeenCalledTimes(2);
        expect(mocks.startTransitionMock).not.toHaveBeenCalled();
    });

    it('shadow ready 批量 flush 时用 startTransition 包裹 setChapters', async () => {
        const chapter: LoadedChapter = {
            spineIndex: 0,
            id: 'ch-0',
            htmlContent: '<p>body</p>',
            htmlFragments: ['<p>body</p>'],
            externalStyles: [],
            domNode: null,
            height: 120,
            status: 'shadow-rendering',
        };
        const refs = createRefs([chapter]);
        const setChapters = vi.fn((updater: (prev: LoadedChapter[]) => LoadedChapter[]) => {
            refs.chaptersRef.current = updater(refs.chaptersRef.current);
        });
        const setShadowQueue = vi.fn();
        const frameCallbacks: FrameRequestCallback[] = [];
        vi.stubGlobal('requestAnimationFrame', ((callback: FrameRequestCallback) => {
            frameCallbacks.push(callback);
            return frameCallbacks.length;
        }) as typeof requestAnimationFrame);
        vi.stubGlobal('cancelAnimationFrame', vi.fn() as unknown as typeof cancelAnimationFrame);

        function Probe() {
            const chapterVectorsRef = useRef<Map<string, ChapterMetaVector>>(new Map());
            const virtualChaptersRef = useRef<Map<string, VirtualChapterRuntime>>(new Map());
            const { handleShadowReady } = useShadowRenderComplete(refs, {
                chapterVectorsRef,
                virtualChaptersRef,
                mountVirtualSegment: vi.fn(),
                refreshVirtualChapterLayout: vi.fn(),
                setChapters,
                setShadowQueue,
                requestFlush: vi.fn(),
            });

            return (
                <button
                    type="button"
                    onClick={() => handleShadowReady(0, document.createElement('section'), 260)}
                >
                    ready
                </button>
            );
        }

        const view = render(<Probe />);

        act(() => {
            view.getByRole('button').click();
        });

        expect(mocks.startTransitionMock).not.toHaveBeenCalled();

        act(() => {
            frameCallbacks[0]?.(performance.now());
        });

        expect(setShadowQueue).toHaveBeenCalledTimes(1);
        expect(setChapters).toHaveBeenCalledTimes(1);
        expect(mocks.startTransitionMock).toHaveBeenCalledTimes(1);
    });
});
