import { RefObject, useCallback, useRef, useEffect } from 'react';

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
    const deltaTime = last.time - first.time;
    if (deltaTime === 0) return 0;
    return ((last.value - first.value) / deltaTime) * 16.67;
  }

  clear() { this.positions = []; }
}

interface UseScrollEventsOptions {
  /** 滚轮冲量回调 — 由物理引擎消费，不再直接修改 scrollTop */
  onWheelImpulse?: (deltaY: number) => void;
  /** 触摸释放时的速度回调 */
  onTouchFling?: (velocity: number) => void;
  /** 触摸开始拖拽 */
  onDragStart?: () => void;
  /** 触摸结束拖拽 */
  onDragEnd?: () => void;
}

/**
 * useScrollEvents Hook
 *
 * 职责分离：
 * - wheel 事件 → 报告冲量 (onWheelImpulse)，由物理引擎统一驱动 scrollTop
 * - touch 事件 → 拖拽期间直接驱动 scrollTop，释放时报告速度 (onTouchFling)
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

  // ── Wheel ──
  const handleWheel = useCallback((event: WheelEvent) => {
    event.preventDefault();
    optionsRef.current.onWheelImpulse?.(event.deltaY);
  }, []);

  // ── Touch ──
  const handleTouchStart = useCallback((event: TouchEvent) => {
    isTouching.current = true;
    lastTouchY.current = event.touches[0].clientY;
    velocityTracker.current.clear();
    optionsRef.current.onDragStart?.();
  }, []);

  const handleTouchMove = useCallback((event: TouchEvent) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    if (event.cancelable) event.preventDefault();

    const currentY = event.touches[0].clientY;
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
