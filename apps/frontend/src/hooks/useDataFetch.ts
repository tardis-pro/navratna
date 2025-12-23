import { useState, useEffect, useCallback, useRef } from 'react';

export interface UseDataFetchOptions {
  /**
   * Whether to fetch data immediately on mount
   * @default true
   */
  immediate?: boolean;
}

export interface UseDataFetchReturn<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Custom hook for fetching data with loading and error states
 * Reduces boilerplate for common data fetching patterns
 *
 * @example
 * const { data: agents, loading, error, refetch } = useDataFetch(() => api.getAgents());
 *
 * @example
 * // With dependencies
 * const { data: user } = useDataFetch(() => api.getUser(userId), [userId]);
 *
 * @example
 * // Manual fetch
 * const { data, loading, refetch } = useDataFetch(() => api.getUser(id), [], { immediate: false });
 * // Later: refetch();
 */
export function useDataFetch<T>(
  fetchFn: () => Promise<T>,
  dependencies: any[] = [],
  options: UseDataFetchOptions = {}
): UseDataFetchReturn<T> {
  const { immediate = true } = options;

  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(immediate);
  const [error, setError] = useState<string | null>(null);

  // Use a ref to track the latest request ID to handle race conditions
  const latestRequestIdRef = useRef(0);
  const mountedRef = useRef(true);

  const fetchData = useCallback(async () => {
    // Increment request ID and capture it for this specific call
    const requestId = ++latestRequestIdRef.current;

    try {
      setLoading(true);
      setError(null);
      const result = await fetchFn();

      // Only update state if this is still the latest request and component is mounted
      if (mountedRef.current && requestId === latestRequestIdRef.current) {
        setData(result);
      }
    } catch (err) {
      // Only update error state if this is still the latest request and component is mounted
      if (mountedRef.current && requestId === latestRequestIdRef.current) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      }
    } finally {
      // Only update loading state if this is still the latest request and component is mounted
      if (mountedRef.current && requestId === latestRequestIdRef.current) {
        setLoading(false);
      }
    }
  }, dependencies);

  useEffect(() => {
    if (immediate) {
      fetchData();
    }

    return () => {
      // Mark component as unmounted
      mountedRef.current = false;
    };
  }, [fetchData, immediate]);

  return { data, loading, error, refetch: fetchData };
}
