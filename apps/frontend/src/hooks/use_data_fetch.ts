import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';

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
  dependencies: unknown[] = [],
  options: UseDataFetchOptions = {}
): UseDataFetchReturn<T> {
  const { immediate = true } = options;

  const query = useQuery({
    queryKey: ['useDataFetch', ...dependencies],
    queryFn: fetchFn,
    enabled: immediate,
    staleTime: 0,
    retry: false,
  });

  const refetch = useCallback(async () => {
    await query.refetch();
  }, [query]);

  return {
    data: query.data ?? null,
    loading: query.isLoading || query.isFetching,
    error: query.error instanceof Error ? query.error.message : null,
    refetch,
  };
}
