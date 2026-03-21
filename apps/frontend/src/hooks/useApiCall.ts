import { useState, useCallback } from 'react';

interface ApiCallState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
}

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
  const [state, setState] = useState<ApiCallState<T>>({
    data: null,
    loading: false,
    error: null,
  });

  const execute = useCallback(
    async (apiCall: () => Promise<T>): Promise<T | null> => {
      setState((prev) => ({ ...prev, loading: true, error: null }));
      try {
        const data = await apiCall();
        setState({ data, loading: false, error: null });
        options.onSuccess?.(data);
        return data;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setState((prev) => ({ ...prev, loading: false, error }));
        options.onError?.(error);
        return null;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const reset = useCallback(() => {
    setState({ data: null, loading: false, error: null });
  }, []);

  return { ...state, execute, reset };
}
