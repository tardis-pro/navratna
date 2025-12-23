import { useState, useEffect, useCallback } from 'react';

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

  const fetchData = useCallback(async () => {
    let mounted = true;

    try {
      setLoading(true);
      setError(null);
      const result = await fetchFn();
      if (mounted) {
        setData(result);
      }
    } catch (err) {
      if (mounted) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      }
    } finally {
      if (mounted) {
        setLoading(false);
      }
    }

    return () => {
      mounted = false;
    };
  }, dependencies);

  useEffect(() => {
    if (immediate) {
      fetchData();
    }
  }, [fetchData, immediate]);

  return { data, loading, error, refetch: fetchData };
}
