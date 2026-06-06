import { RefObject, useRef, useCallback, useEffect } from 'react';
import { PhysicsConfig, DEFAULT_PHYSICS_CONFIG } from '@/types/scroll';
import { clampNumber } from '@/utils/mathUtils';

interface InertiaCallbacks {
  onStart?: () => void;
  onStop?: () => void;
}

export interface InertiaTuning {
  maxAbsVelocity: number;
  frameCapMs: number;
}

const DEFAULT_INERTIA_TUNING: InertiaTuning = {
  maxAbsVelocity: 96,
  frameCapMs: 32,
};



function clampVelocity(value: number, maxAbsVelocity: number): number {
  return Math.max(-maxAbsVelocity, Math.min(maxAbsVelocity, value));
}

/**
 * useScrollInertia Hook
 * 统一物理引擎：触摸惯性 + 阻尼衰减
 *
 * 核心思路：触摸释放时注入速度，由 rAF 循环以恒定摩擦衰减驱动 scrollTop。
 */
export function useScrollInertia(
  viewportRef: RefObject<HTMLElement>,
  config: PhysicsConfig = DEFAULT_PHYSICS_CONFIG,
  callbacks: InertiaCallbacks = {},
  tuning: Partial<InertiaTuning> = {}
) {
  const velocity = useRef(0);
  const isDragging = useRef(false);
  const animationFrameId = useRef<number | null>(null);
  const lastFrameTime = useRef(0);
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;
  const configRef = useRef(config);
  configRef.current = config;
  const tuningRef = useRef<InertiaTuning>(DEFAULT_INERTIA_TUNING);
  tuningRef.current = {
    maxAbsVelocity: clampNumber(Number(tuning.maxAbsVelocity ?? DEFAULT_INERTIA_TUNING.maxAbsVelocity), 32, 256),
    frameCapMs: clampNumber(Number(tuning.frameCapMs ?? DEFAULT_INERTIA_TUNING.frameCapMs), 8, 64),
  };

  /** 停止动画 */
  const stop = useCallback(() => {
    velocity.current = 0;
    if (animationFrameId.current !== null) {
      cancelAnimationFrame(animationFrameId.current);
      animationFrameId.current = null;
      callbacksRef.current.onStop?.();
    }
  }, []);

  /** 物理循环 — 时间无关的阻尼衰减 */
  const physicsLoop = useCallback((now: number) => {
    const cfg = configRef.current;
    const tune = tuningRef.current;
    const dt = lastFrameTime.current ? Math.min(now - lastFrameTime.current, tune.frameCapMs) : 16;
    lastFrameTime.current = now;

    if (Math.abs(velocity.current) < cfg.stopThreshold || isDragging.current) {
      animationFrameId.current = null;
      lastFrameTime.current = 0;
      callbacksRef.current.onStop?.();
      return;
    }

    const viewport = viewportRef.current;
    if (!viewport) {
      animationFrameId.current = null;
      lastFrameTime.current = 0;
      callbacksRef.current.onStop?.();
      return;
    }

    // 时间无关衰减: v *= (1 - friction) ^ (dt / 16)
    const decayFactor = Math.pow(1 - cfg.friction, dt / 16);
    velocity.current *= decayFactor;

    // 应用速度
    viewport.scrollTop += velocity.current * (dt / 16);

    // 边界处理：优先稳定，避免“弹一下”
    const maxScroll = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
    if (viewport.scrollTop < 0) {
      viewport.scrollTop = 0;
      velocity.current = Math.min(0, velocity.current) * cfg.springDamping;
    } else if (viewport.scrollTop > maxScroll) {
      viewport.scrollTop = maxScroll;
      velocity.current = Math.max(0, velocity.current) * cfg.springDamping;
    }

    animationFrameId.current = requestAnimationFrame(physicsLoop);
  }, [viewportRef]);

  /** 确保物理循环在运行 */
  const ensureRunning = useCallback(() => {
    if (animationFrameId.current === null) {
      lastFrameTime.current = 0;
      callbacksRef.current.onStart?.();
      animationFrameId.current = requestAnimationFrame(physicsLoop);
    }
  }, [physicsLoop]);

  /** fling — 触摸释放时注入速度 */
  const fling = useCallback((initialVelocity: number) => {
    const tune = tuningRef.current;
    velocity.current = clampVelocity(initialVelocity, tune.maxAbsVelocity);
    ensureRunning();
  }, [ensureRunning]);

  /** 设置拖拽状态 */
  const setDragging = useCallback((dragging: boolean) => {
    isDragging.current = dragging;
    if (dragging) stop();
  }, [stop]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (animationFrameId.current !== null) {
        cancelAnimationFrame(animationFrameId.current);
        animationFrameId.current = null;
      }
    };
  }, []);

  return { fling, stop, setDragging };
}
