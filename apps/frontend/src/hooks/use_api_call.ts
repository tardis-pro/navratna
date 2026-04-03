import { useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';

interface UseApiCallOptions {
  onSuccess?: (data: unknown) => void;
  onError?: (error: Error) => void;
}

/**
 * Reusable hook for imperative API calls with loading/error state management.
 * Use for user-triggered actions (button clicks, form submissions).
 * For declarative mount-time fetching, use `useDataFetch` instead.
 *
 * Replaces the duplicated try-catch-setLoading-setError pattern found in 59+
 * occurrences across 20 component files.
 *
 * @example
 * ```tsx
 * const { data, loading, error, execute } = useApiCall<Agent>();
 * const handleCreate = () => execute(() => agentsAPI.create(formData));
 * ```
 */
export function useApiCall<T = unknown>(options: UseApiCallOptions = {}) {
  const mutation = useMutation<T, Error, () => Promise<T>>({
    mutationFn: async (apiCall) => await apiCall(),
    onSuccess: (data) => {
      options.onSuccess?.(data);
    },
    onError: (error) => {
      options.onError?.(error);
    },
  });

  const execute = useCallback(
    async (apiCall: () => Promise<T>): Promise<T | null> => {
      try {
        return await mutation.mutateAsync(apiCall);
      } catch {
        return null;
      }
    },
    [mutation]
  );

  const reset = useCallback(() => {
    mutation.reset();
  }, [mutation]);

  return {
    data: mutation.data ?? null,
    loading: mutation.isPending,
    error: mutation.error ?? null,
    execute,
    reset,
  };
}
