import { useEffect, DependencyList } from 'react';

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
  useEffect(() => {
    let mounted = true;
    let cleanup: (() => void) | void;

    const runEffect = async () => {
      try {
        if (mounted) {
          cleanup = await effect();
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
  }, deps);
}
