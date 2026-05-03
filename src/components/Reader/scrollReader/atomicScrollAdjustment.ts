import {
    INSTANT_SCROLL_BEHAVIOR,
    SCROLL_HEDGE_EPSILON_PX,
} from './scrollReaderConstants';

interface ReadonlyRefValue<T> {
    readonly current: T;
}

interface MutableRefValue<T> {
    current: T;
}

interface ScheduleAtomicScrollAdjustmentFlushOptions {
    viewportRef: ReadonlyRefValue<HTMLElement | null>;
    flushRafRef: MutableRefValue<number | null>;
    pendingDeltaRef: MutableRefValue<number>;
    ignoreScrollEventRef: MutableRefValue<boolean>;
    unlockAdjustingRafRef: MutableRefValue<number | null>;
}

export function scheduleAtomicScrollAdjustmentFlush(
    options: ScheduleAtomicScrollAdjustmentFlushOptions,
): void {
    const {
        viewportRef,
        flushRafRef,
        pendingDeltaRef,
        ignoreScrollEventRef,
        unlockAdjustingRafRef,
    } = options;

    if (flushRafRef.current !== null) return;

    flushRafRef.current = requestAnimationFrame(() => {
        flushRafRef.current = null;

        const viewport = viewportRef.current;
        if (!viewport) {
            pendingDeltaRef.current = 0;
            return;
        }

        const totalDelta = pendingDeltaRef.current;
        if (Math.abs(totalDelta) <= SCROLL_HEDGE_EPSILON_PX) {
            pendingDeltaRef.current = 0;
            return;
        }

        pendingDeltaRef.current = 0;
        ignoreScrollEventRef.current = true;
        const targetTop = viewport.scrollTop + totalDelta;
        viewport.scrollTo({ top: targetTop, behavior: INSTANT_SCROLL_BEHAVIOR });

        if (unlockAdjustingRafRef.current !== null) {
            cancelAnimationFrame(unlockAdjustingRafRef.current);
        }

        unlockAdjustingRafRef.current = requestAnimationFrame(() => {
            unlockAdjustingRafRef.current = requestAnimationFrame(() => {
                unlockAdjustingRafRef.current = null;
                ignoreScrollEventRef.current = false;
            });
        });
    });
}
