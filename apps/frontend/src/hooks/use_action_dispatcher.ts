import { useState, useCallback, useRef } from 'react';
import { buildAPIURL } from '@/config/api_config';
import type { ActionProjection } from '@uaip/types';

type ActionDispatchState = 'idle' | 'dispatching' | 'success' | 'error';

type ActionDispatchResult = {
  success: boolean;
  currentMachineState?: string;
  error?: string;
};

type UseActionDispatcherResult = {
  dispatch: (compositionId: string, action: ActionProjection, formValues?: Record<string, unknown>) => Promise<ActionDispatchResult>;
  state: ActionDispatchState;
  error: string | null;
  reset: () => void;
};

export function useActionDispatcher(): UseActionDispatcherResult {
  const [dispatchState, setDispatchState] = useState<ActionDispatchState>('idle');
  const [error, setError] = useState<string | null>(null);
  const inFlightRef = useRef<Set<string>>(new Set());

  const dispatch = useCallback(
    async (
      compositionId: string,
      action: ActionProjection,
      formValues?: Record<string, unknown>,
    ): Promise<ActionDispatchResult> => {
      if (!action.stepId) {
        return { success: false, error: 'Action has no stepId' };
      }

      const key = `${compositionId}:${action.stepId}:${action.type}`;
      if (inFlightRef.current.has(key)) {
        return { success: false, error: 'Action already in flight' };
      }

      inFlightRef.current.add(key);
      setDispatchState('dispatching');
      setError(null);

      try {
        const url = buildAPIURL(`/api/v1/compositions/${compositionId}/actions`);
        const res = await fetch(url, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            stepId: action.stepId,
            actionType: action.type,
            payload: formValues ?? {},
          }),
        });

        const json = await res.json() as { success: boolean; data?: { currentMachineState?: string }; error?: string };

        if (!res.ok || !json.success) {
          const errMsg = json.error ?? `HTTP ${res.status}`;
          setError(errMsg);
          setDispatchState('error');
          return { success: false, error: errMsg, currentMachineState: json.data?.currentMachineState };
        }

        setDispatchState('success');
        return { success: true, currentMachineState: json.data?.currentMachineState };
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'Network error';
        setError(errMsg);
        setDispatchState('error');
        return { success: false, error: errMsg };
      } finally {
        inFlightRef.current.delete(key);
      }
    },
    [],
  );

  const reset = useCallback(() => {
    setDispatchState('idle');
    setError(null);
  }, []);

  return { dispatch, state: dispatchState, error, reset };
}
