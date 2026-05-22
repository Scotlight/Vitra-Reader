import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import type { ChapterMetaVector, SegmentMeta } from '@/engine/types/vectorRender';
import type { VirtualChapterRuntime } from '@/components/Reader/scrollReader/useVirtualChapterRuntime';
import { segmentPool } from '@/components/Reader/ShadowRenderer';
import { useVirtualChapterRuntime } from '@/components/Reader/scrollReader/useVirtualChapterRuntime';

function createSegment(overrides: Partial<SegmentMeta> = {}): SegmentMeta {
    return {
        index: 0,
        charCount: 1200,
        estimatedHeight: 240,
        realHeight: null,
        offsetY: 36,
        measured: false,
        htmlContent: '<p>segment body</p>',
        hasMedia: false,
        ...overrides,
    };
}

function createVector(segment: SegmentMeta): ChapterMetaVector {
    return {
        chapterId: 'ch-0',
        spineIndex: 0,
        segments: [segment],
        totalEstimatedHeight: segment.estimatedHeight,
        totalMeasuredHeight: 0,
        fullyMeasured: false,
    };
}

describe('useVirtualChapterRuntime content visibility', () => {
    afterEach(() => {
        segmentPool.drain();
    });

    it('mountVirtualSegment 为虚拟段设置 content-visibility 和预估固有尺寸', () => {
        const observeResizeNode = vi.fn();
        const segment = createSegment();
        const vector = createVector(segment);
        const contentEl = document.createElement('div');
        const chapterEl = document.createElement('article');
        chapterEl.appendChild(contentEl);
        const runtime: VirtualChapterRuntime = {
            chapterId: 'ch-0',
            spineIndex: 0,
            chapterEl,
            contentEl,
            vector,
            activeSegmentEls: new Map(),
        };

        function Probe() {
            const { mountVirtualSegment } = useVirtualChapterRuntime({
                observeResizeNode,
                unobserveResizeNode: vi.fn(),
            });

            return (
                <button
                    type="button"
                    onClick={() => mountVirtualSegment(runtime, 0)}
                >
                    mount
                </button>
            );
        }

        const view = render(<Probe />);

        act(() => {
            view.getByRole('button').click();
        });

        const segmentEl = runtime.activeSegmentEls.get(0);
        expect(segmentEl).toBeInstanceOf(HTMLElement);
        expect(segmentEl?.style.contentVisibility).toBe('auto');
        expect(segmentEl?.style.containIntrinsicSize).toBe('auto 0 240px');
        expect(segmentEl?.style.contain).toBe('layout style paint');
        expect(observeResizeNode).toHaveBeenCalledWith(segmentEl);
    });

    it('已挂载虚拟段重新布局时同步更新 containIntrinsicSize', () => {
        const observeResizeNode = vi.fn();
        const segment = createSegment();
        const vector = createVector(segment);
        const runtime: VirtualChapterRuntime = {
            chapterId: 'ch-0',
            spineIndex: 0,
            chapterEl: document.createElement('article'),
            contentEl: document.createElement('div'),
            vector,
            activeSegmentEls: new Map(),
        };

        function Probe() {
            const { mountVirtualSegment } = useVirtualChapterRuntime({
                observeResizeNode,
                unobserveResizeNode: vi.fn(),
            });

            return (
                <button
                    type="button"
                    onClick={() => mountVirtualSegment(runtime, 0)}
                >
                    mount
                </button>
            );
        }

        const view = render(<Probe />);

        act(() => {
            view.getByRole('button').click();
        });

        segment.realHeight = 360;

        act(() => {
            view.getByRole('button').click();
        });

        expect(runtime.activeSegmentEls.get(0)?.style.containIntrinsicSize).toBe('auto 0 360px');
        expect(observeResizeNode).toHaveBeenCalledTimes(1);
    });
});
