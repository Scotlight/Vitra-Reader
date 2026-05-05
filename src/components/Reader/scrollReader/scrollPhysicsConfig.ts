import { clampNumber } from '@/utils/mathUtils';
import {
    INERTIA_FRAME_CAP_EASING_MS,
    INERTIA_FRAME_CAP_LINEAR_MS,
    INERTIA_IMPULSE_BLEND_BASE,
    INERTIA_IMPULSE_BLEND_MAX,
    INERTIA_IMPULSE_BLEND_MIN,
    INERTIA_IMPULSE_BLEND_RATIO_SCALE,
    INERTIA_IMPULSE_GAIN_BASE,
    INERTIA_IMPULSE_GAIN_MAX,
    INERTIA_IMPULSE_GAIN_MIN,
    INERTIA_IMPULSE_GAIN_STEP_DIVISOR,
    INERTIA_IMPULSE_GAIN_STEP_REF,
    INERTIA_VELOCITY_ACCEL_FACTOR,
    INERTIA_VELOCITY_MAX,
    INERTIA_VELOCITY_MIN,
    INERTIA_VELOCITY_STEP_FACTOR,
    PHYSICS_FRICTION_MAX,
    PHYSICS_FRICTION_MIN,
    PHYSICS_FRICTION_NO_EASING_OFFSET,
    PHYSICS_FRICTION_NUMERATOR,
    PHYSICS_SPRING_DAMPING_EASING,
    PHYSICS_SPRING_DAMPING_LINEAR,
    PHYSICS_SPRING_STIFFNESS,
    PHYSICS_STOP_THRESHOLD_EASING,
    PHYSICS_STOP_THRESHOLD_LINEAR,
} from './scrollReaderConstants';

export interface SmoothScrollConfig {
    enabled: boolean;
    stepSizePx: number;
    animationTimeMs: number;
    accelerationDeltaMs: number;
    accelerationMax: number;
    tailToHeadRatio: number;
    easing: boolean;
    reverseWheelDirection: boolean;
}

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

export const DEFAULT_SMOOTH_CONFIG: SmoothScrollConfig = {
    enabled: true,
    stepSizePx: 120,
    animationTimeMs: 360,
    accelerationDeltaMs: 70,
    accelerationMax: 7,
    tailToHeadRatio: 3,
    easing: true,
    reverseWheelDirection: false,
};

export function normalizeSmoothScrollConfig(smoothConfig: SmoothScrollConfig): SmoothScrollConfig {
    return {
        enabled: smoothConfig.enabled !== false,
        stepSizePx: clampNumber(Number(smoothConfig.stepSizePx || DEFAULT_SMOOTH_CONFIG.stepSizePx), 20, 300),
        animationTimeMs: clampNumber(Number(smoothConfig.animationTimeMs || DEFAULT_SMOOTH_CONFIG.animationTimeMs), 120, 1200),
        accelerationDeltaMs: clampNumber(Number(smoothConfig.accelerationDeltaMs || DEFAULT_SMOOTH_CONFIG.accelerationDeltaMs), 10, 400),
        accelerationMax: clampNumber(Number(smoothConfig.accelerationMax || DEFAULT_SMOOTH_CONFIG.accelerationMax), 1, 12),
        tailToHeadRatio: clampNumber(Number(smoothConfig.tailToHeadRatio || DEFAULT_SMOOTH_CONFIG.tailToHeadRatio), 1, 8),
        easing: smoothConfig.easing !== false,
        reverseWheelDirection: Boolean(smoothConfig.reverseWheelDirection),
    };
}

export function resolveScrollPhysicsConfig(normalizedSmoothConfig: SmoothScrollConfig): ScrollPhysicsConfig {
    const friction = clampNumber(
        PHYSICS_FRICTION_NUMERATOR / normalizedSmoothConfig.animationTimeMs +
        (normalizedSmoothConfig.easing ? 0 : PHYSICS_FRICTION_NO_EASING_OFFSET),
        PHYSICS_FRICTION_MIN,
        PHYSICS_FRICTION_MAX,
    );
    const stopThreshold = normalizedSmoothConfig.easing
        ? PHYSICS_STOP_THRESHOLD_EASING
        : PHYSICS_STOP_THRESHOLD_LINEAR;
    const springDamping = normalizedSmoothConfig.easing
        ? PHYSICS_SPRING_DAMPING_EASING
        : PHYSICS_SPRING_DAMPING_LINEAR;
    return {
        friction,
        stopThreshold,
        springStiffness: PHYSICS_SPRING_STIFFNESS,
        springDamping,
    };
}

export function resolveInertiaTuning(normalizedSmoothConfig: SmoothScrollConfig): InertiaTuning {
    const ratio = normalizedSmoothConfig.tailToHeadRatio;
    const impulseBlend = clampNumber(
        INERTIA_IMPULSE_BLEND_BASE + (ratio - 1) * INERTIA_IMPULSE_BLEND_RATIO_SCALE,
        INERTIA_IMPULSE_BLEND_MIN,
        INERTIA_IMPULSE_BLEND_MAX,
    );
    const impulseGain = clampNumber(
        INERTIA_IMPULSE_GAIN_BASE +
        (normalizedSmoothConfig.stepSizePx - INERTIA_IMPULSE_GAIN_STEP_REF) / INERTIA_IMPULSE_GAIN_STEP_DIVISOR,
        INERTIA_IMPULSE_GAIN_MIN,
        INERTIA_IMPULSE_GAIN_MAX,
    );
    const maxAbsVelocity = clampNumber(
        normalizedSmoothConfig.stepSizePx * INERTIA_VELOCITY_STEP_FACTOR +
        normalizedSmoothConfig.accelerationMax * INERTIA_VELOCITY_ACCEL_FACTOR,
        INERTIA_VELOCITY_MIN,
        INERTIA_VELOCITY_MAX,
    );
    const frameCapMs = normalizedSmoothConfig.easing
        ? INERTIA_FRAME_CAP_EASING_MS
        : INERTIA_FRAME_CAP_LINEAR_MS;
    return { impulseBlend, impulseGain, maxAbsVelocity, frameCapMs };
}
