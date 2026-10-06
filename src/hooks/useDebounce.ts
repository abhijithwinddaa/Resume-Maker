/* ─── useDebounce Hook ─────────────────────────────────
   Debounces a callback function by the given delay.
   The returned function also has flush() and cancel().
   ────────────────────────────────────────────────────── */

import { useRef, useCallback, useEffect, useMemo } from "react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DebouncedFn<T extends (...args: any[]) => void> = ((
  ...args: Parameters<T>
) => void) & {
  /** Run the pending call right now (no-op when nothing is pending). */
  flush: () => void;
  /** Drop the pending call. */
  cancel: () => void;
};

/**
 * Returns a debounced version of the callback.
 * The callback will only fire after `delay` ms of inactivity.
 * `flush()` fires a pending call immediately with its original arguments;
 * `cancel()` discards it. A pending call is cancelled on unmount.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useDebounce<T extends (...args: any[]) => void>(
  callback: T,
  delay: number,
): DebouncedFn<T> {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingArgsRef = useRef<Parameters<T> | null>(null);
  const callbackRef = useRef(callback);

  // Always keep the latest callback
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  const cancel = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    pendingArgsRef.current = null;
  }, []);

  const flush = useCallback(() => {
    if (!pendingArgsRef.current) return;
    const args = pendingArgsRef.current;
    cancel();
    callbackRef.current(...args);
  }, [cancel]);

  // Cleanup on unmount
  useEffect(() => cancel, [cancel]);

  return useMemo(() => {
    const debounced = (...args: Parameters<T>) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      pendingArgsRef.current = args;
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        const pending = pendingArgsRef.current;
        pendingArgsRef.current = null;
        if (pending) callbackRef.current(...pending);
      }, delay);
    };
    debounced.flush = flush;
    debounced.cancel = cancel;
    return debounced as DebouncedFn<T>;
  }, [delay, flush, cancel]);
}
