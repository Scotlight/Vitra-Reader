import { RefObject, useCallback, useRef, useEffect } from 'react';
import { clampNumber } from '@/utils/mathUtils';

/**
 * 速度追踪器 — 仅用于触摸事件的速度估算
 */
class VelocityTracker {
  private positions: Array<{ time: number; value: number }> = [];
  private readonly maxSamples = 5;

  addSample(value: number, time: number = Date.now()) {
    this.positions.push({ time, value });
    if (this.positions.length > this.maxSamples) {
      this.positions.shift();
    }
  }

  getVelocity(): number {
    if (this.positions.length < 2) return 0;
    const first = this.positions[0];
    const last = this.positions[this.positions.length - 1];
    if (!first || !last) return 0;
    const deltaTime = last.time - first.time;
    if (deltaTime === 0) return 0;
    return ((last.value - first.value) / deltaTime) * 16.67;
  }

  clear() { this.positions = []; }
}

interface UseScrollEventsOptions {
  /** 滚轮冲量回调：由物理引擎消费，避免触摸板 wheel 输入退回离散步进 */
  onWheelImpulse?: (deltaY: number) => void;
  /** 触摸释放时的速度回调 */
  onTouchFling?: (velocity: number) => void;
  /** 触摸开始拖拽 */
  onDragStart?: () => void;
  /** 触摸结束拖拽 */
  onDragEnd?: () => void;
  /** 滚轮平滑参数 */
  wheelConfig?: {
    enabled: boolean;
    stepSizePx: number;
    accelerationDeltaMs: number;
    accelerationMax: number;
    reverseDirection: boolean;
  };
}

const LINE_DELTA_PX = 16;
const PAGE_DELTA_FACTOR = 0.9;
const DEFAULT_WHEEL_STEP_PX = 120;

function shouldLetBrowserHandleWheel(event: WheelEvent): boolean {
  if (event.ctrlKey) return true;
  return Math.abs(event.deltaY) < Math.abs(event.deltaX);
}

function shouldAccelerateWheel(event: WheelEvent, stepSizePx: number): boolean {
  return event.deltaMode !== 0 || Math.abs(event.deltaY) >= stepSizePx * 0.5;
}

function normalizeWheelDelta(event: WheelEvent, viewport: HTMLElement | null, stepSizePx: number): number {
  let deltaY = event.deltaY;

  if (event.deltaMode === 1) {
    deltaY *= LINE_DELTA_PX;
  } else if (event.deltaMode === 2) {
    const pageHeight = viewport?.clientHeight || 800;
    deltaY *= Math.max(1, pageHeight * PAGE_DELTA_FACTOR);
  }

  if (!Number.isFinite(deltaY) || Math.abs(deltaY) < 0.1) return 0;
  const scale = Math.max(1, stepSizePx);
  const compressed = scale * Math.tanh(Math.abs(deltaY) / scale);
  return Math.sign(deltaY) * compressed;
}

/**
 * useScrollEvents Hook
 *
 * wheel 事件转成物理冲量，touch 事件拖拽期间直接驱动 scrollTop。
 */
export function useScrollEvents(
  viewportRef: RefObject<HTMLElement>,
  options: UseScrollEventsOptions = {}
) {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const velocityTracker = useRef(new VelocityTracker());
  const lastTouchY = useRef(0);
  const isTouching = useRef(false);
  const wheelAccelerationRef = useRef(1);
  const wheelLastEventAtRef = useRef(Number.NEGATIVE_INFINITY);

  // ── Wheel ──
  const handleWheel = useCallback((event: WheelEvent) => {
    const onWheelImpulse = optionsRef.current.onWheelImpulse;
    const wheelConfig = optionsRef.current.wheelConfig;
    if (!onWheelImpulse || wheelConfig?.enabled === false || shouldLetBrowserHandleWheel(event)) return;

    const stepSizePx = clampNumber(Number(wheelConfig?.stepSizePx ?? DEFAULT_WHEEL_STEP_PX), 20, 300);
    const viewport = viewportRef.current;
    let deltaY = normalizeWheelDelta(event, viewport, stepSizePx);
    if (deltaY === 0) return;

    if (!event.cancelable) return;
    event.preventDefault();

    if (shouldAccelerateWheel(event, stepSizePx)) {
      const accelerationDeltaMs = clampNumber(Number(wheelConfig?.accelerationDeltaMs ?? 70), 10, 400);
      const accelerationMax = clampNumber(Number(wheelConfig?.accelerationMax ?? 7), 1, 12);
      const now = performance.now();
      if (now - wheelLastEventAtRef.current <= accelerationDeltaMs) {
        wheelAccelerationRef.current = Math.min(accelerationMax, wheelAccelerationRef.current * 1.18);
      } else {
        wheelAccelerationRef.current = 1;
      }
      wheelLastEventAtRef.current = now;
    } else {
      wheelAccelerationRef.current = 1;
    }

    deltaY *= wheelAccelerationRef.current;
    if (wheelConfig?.reverseDirection) deltaY *= -1;
    onWheelImpulse(deltaY);
  }, [viewportRef]);

  // ── Touch ──
  const handleTouchStart = useCallback((event: TouchEvent) => {
    const touch = event.touches[0];
    if (!touch) return;
    isTouching.current = true;
    lastTouchY.current = touch.clientY;
    velocityTracker.current.clear();
    optionsRef.current.onDragStart?.();
  }, []);

  const handleTouchMove = useCallback((event: TouchEvent) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const touch = event.touches[0];
    if (!touch) return;
    if (event.cancelable) event.preventDefault();

    const currentY = touch.clientY;
    const deltaY = lastTouchY.current - currentY;
    viewport.scrollTop += deltaY;

    velocityTracker.current.addSample(viewport.scrollTop, Date.now());
    lastTouchY.current = currentY;
  }, [viewportRef]);

  const handleTouchEnd = useCallback(() => {
    isTouching.current = false;
    const velocity = velocityTracker.current.getVelocity();
    velocityTracker.current.clear();
    optionsRef.current.onDragEnd?.();
    if (Math.abs(velocity) > 0.5) {
      optionsRef.current.onTouchFling?.(velocity);
    }
  }, []);

  // ── Bindlisteners ──
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    viewport.addEventListener('wheel', handleWheel, { passive: false });
    viewport.addEventListener('touchstart', handleTouchStart, { passive: false });
    viewport.addEventListener('touchmove', handleTouchMove, { passive: false });
    viewport.addEventListener('touchend', handleTouchEnd, { passive: false });

    return () => {
      viewport.removeEventListener('wheel', handleWheel);
      viewport.removeEventListener('touchstart', handleTouchStart);
      viewport.removeEventListener('touchmove', handleTouchMove);
      viewport.removeEventListener('touchend', handleTouchEnd);
    };
  }, [viewportRef, handleWheel, handleTouchStart, handleTouchMove, handleTouchEnd]);
}
