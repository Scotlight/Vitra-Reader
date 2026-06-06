import { useCallback, useRef } from 'react'

export function useLatestRef<T>(value: T) {
  const ref = useRef(value)
  ref.current = value
  return ref
}

export function useStableEvent<Args extends unknown[], Return>(
  callback: (...args: Args) => Return,
): (...args: Args) => Return {
  const callbackRef = useLatestRef(callback)

  return useCallback((...args: Args) => callbackRef.current(...args), [callbackRef])
}
