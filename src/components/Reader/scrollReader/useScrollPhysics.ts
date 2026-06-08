import { useMemo } from 'react';
import type { MutableRefObject } from 'react';
import { useScrollInertia } from '@/hooks/useScrollInertia';
import { useScrollEvents } from '@/hooks/useScrollEvents';
import styles from '../ScrollReaderView.module.css';
import {
    resolveInertiaTuning,
    resolveScrollPhysicsConfig,
} from './scrollPhysicsConfig';

export function useScrollPhysics(
    viewportRef: MutableRefObject<HTMLElement | null>,
) {
    const physicsConfig = useMemo(
        () => resolveScrollPhysicsConfig(),
        [],
    );

    const inertiaTuning = useMemo(
        () => resolveInertiaTuning(),
        [],
    );

    const flingingClass = styles.flinging || 'flinging';
    const inertiaCallbacks = useMemo(() => ({
        onStart: () => { viewportRef.current?.classList.add(flingingClass); },
        onStop: () => { viewportRef.current?.classList.remove(flingingClass); },
    }), [flingingClass, viewportRef]);

    const { addImpulse, fling, stop, setDragging } = useScrollInertia(
        viewportRef,
        physicsConfig,
        inertiaCallbacks,
        inertiaTuning,
    );

    const scrollCallbacks = useMemo(() => ({
        onWheelImpulse: (deltaY: number) => { addImpulse(deltaY); },
        wheelConfig: {
            enabled: true,
            stepSizePx: 120,
            accelerationDeltaMs: 70,
            accelerationMax: 7,
            reverseDirection: false,
        },
        onDragStart: () => { stop(); setDragging(true); },
        onTouchFling: (velocity: number) => { setDragging(false); fling(velocity); },
        onDragEnd: () => { setDragging(false); },
    }), [addImpulse, fling, stop, setDragging]);

    useScrollEvents(viewportRef, scrollCallbacks);

    return { stop };
}
