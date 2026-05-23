import {
    PHYSICS_FRICTION_NUMERATOR,
    PHYSICS_SPRING_DAMPING_EASING,
    PHYSICS_SPRING_STIFFNESS,
    PHYSICS_STOP_THRESHOLD_EASING,
} from './scrollReaderConstants';

interface ScrollPhysicsConfig {
    friction: number;
    stopThreshold: number;
    springStiffness: number;
    springDamping: number;
}

interface InertiaTuning {
    impulseBlend: number;
    impulseGain: number;
    maxAbsVelocity: number;
    frameCapMs: number;
}

const DEFAULT_SCROLL_PHYSICS_CONFIG: ScrollPhysicsConfig = {
    friction: PHYSICS_FRICTION_NUMERATOR / 360,
    stopThreshold: PHYSICS_STOP_THRESHOLD_EASING,
    springStiffness: PHYSICS_SPRING_STIFFNESS,
    springDamping: PHYSICS_SPRING_DAMPING_EASING,
};

const DEFAULT_INERTIA_TUNING: InertiaTuning = {
    maxAbsVelocity: 96,
    impulseGain: 0.24,
    impulseBlend: 0.82,
    frameCapMs: 32,
};

export function resolveScrollPhysicsConfig(): ScrollPhysicsConfig {
    return DEFAULT_SCROLL_PHYSICS_CONFIG;
}

export function resolveInertiaTuning(): InertiaTuning {
    return DEFAULT_INERTIA_TUNING;
}
