import { useEffect, useRef, DependencyList } from 'react';

/**
 * Custom hook for running async effects with automatic cleanup
 * Prevents common pitfalls with async operations in useEffect
 *
 * @example
 * useAsyncEffect(async () => {
 *   const data = await fetchData();
 *   setData(data);
 * }, [dependencies]);
 *
 * @example
 * // With cleanup
 * useAsyncEffect(async () => {
 *   const subscription = await subscribe();
 *   return () => subscription.unsubscribe();
 * }, [userId]);
 */
export function useAsyncEffect(
  effect: () => Promise<void | (() => void)>,
  deps: DependencyList
): void {
  const effectRef = useRef(effect);
  effectRef.current = effect;

  useEffect(() => {
    let mounted = true;
    let cleanup: (() => void) | void;

    const runEffect = async () => {
      try {
        if (mounted) {
          cleanup = await effectRef.current();
        }
      } catch (error) {
        if (mounted) {
          console.error('Async effect error:', error);
        }
      }
    };

    runEffect();

    return () => {
      mounted = false;
      if (cleanup) {
        cleanup();
      }
    };
    // oxlint-disable-next-line exhaustive-deps
  }, deps);
}
