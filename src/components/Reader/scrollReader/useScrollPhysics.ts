import { useMemo } from 'react';
import type { MutableRefObject } from 'react';
import { useScrollInertia } from '@/hooks/useScrollInertia';
import { useScrollEvents } from '@/hooks/useScrollEvents';
import styles from '../ScrollReaderView.module.css';
import {
    normalizeSmoothScrollConfig,
    resolveInertiaTuning,
    resolveScrollPhysicsConfig,
} from './scrollPhysicsConfig';
import type { SmoothScrollConfig } from './scrollPhysicsConfig';

export { DEFAULT_SMOOTH_CONFIG, type SmoothScrollConfig } from './scrollPhysicsConfig';

export function useScrollPhysics(
    viewportRef: MutableRefObject<HTMLElement | null>,
    smoothConfig: SmoothScrollConfig,
) {
    const normalizedSmoothConfig = useMemo(
        () => normalizeSmoothScrollConfig(smoothConfig),
        [smoothConfig],
    );

    const physicsConfig = useMemo(
        () => resolveScrollPhysicsConfig(normalizedSmoothConfig),
        [normalizedSmoothConfig],
    );

    const inertiaTuning = useMemo(
        () => resolveInertiaTuning(normalizedSmoothConfig),
        [normalizedSmoothConfig],
    );

    const inertiaCallbacks = useMemo(() => ({
        onStart: () => { viewportRef.current?.classList.add(styles.flinging); },
        onStop: () => { viewportRef.current?.classList.remove(styles.flinging); },
    }), [viewportRef]);

    const { addImpulse, fling, stop, setDragging } = useScrollInertia(
        viewportRef,
        physicsConfig,
        inertiaCallbacks,
        inertiaTuning,
    );

    const scrollCallbacks = useMemo(() => ({
        onWheelImpulse: (deltaY: number) => { addImpulse(deltaY); },
        wheelConfig: {
            enabled: normalizedSmoothConfig.enabled,
            stepSizePx: normalizedSmoothConfig.stepSizePx,
            accelerationDeltaMs: normalizedSmoothConfig.accelerationDeltaMs,
            accelerationMax: normalizedSmoothConfig.accelerationMax,
            reverseDirection: normalizedSmoothConfig.reverseWheelDirection,
        },
        onDragStart: () => { stop(); setDragging(true); },
        onTouchFling: (velocity: number) => { setDragging(false); fling(velocity); },
        onDragEnd: () => { setDragging(false); },
    }), [
        addImpulse, fling, stop, setDragging,
        normalizedSmoothConfig.enabled,
        normalizedSmoothConfig.stepSizePx,
        normalizedSmoothConfig.accelerationDeltaMs,
        normalizedSmoothConfig.accelerationMax,
        normalizedSmoothConfig.reverseWheelDirection,
    ]);

    useScrollEvents(viewportRef, scrollCallbacks);

    return { stop };
}
