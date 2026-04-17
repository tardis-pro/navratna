import { useState, useEffect, useCallback, useRef } from 'react';
import { useEnhancedWebSocket } from './use_enhanced_web_socket';
import { buildAPIURL } from '@/config/api_config';

type WorkflowInstanceState = {
  workflowId: string;
  instanceId: string;
  currentState: Record<string, unknown>;
  machineState: string;
  stateVersion: number;
  updatedAt: string;
};

type UseWorkflowInstanceStateResult = {
  state: WorkflowInstanceState | null;
  loading: boolean;
  error: string | null;
  stateVersion: number;
  refetch: () => Promise<void>;
};

type WorkflowStateChangePayload = {
  workflowId?: string;
  instanceId?: string;
  currentState?: Record<string, unknown>;
  machineState?: string;
  stateVersion?: number;
  updatedAt?: string;
};

function isWorkflowStatePayload(v: unknown): v is WorkflowStateChangePayload {
  return typeof v === 'object' && v !== null;
}

export function useWorkflowInstanceState(compositionId: string | null | undefined): UseWorkflowInstanceStateResult {
  const [state, setState] = useState<WorkflowInstanceState | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const localVersionRef = useRef<number>(0);
  const { lastEvent } = useEnhancedWebSocket();

  const fetchState = useCallback(async () => {
    if (!compositionId) return;
    setLoading(true);
    setError(null);
    try {
      const url = buildAPIURL(`/api/v1/compositions/${compositionId}/instance-state`);
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) {
        if (res.status === 404) {
          setState(null);
          return;
        }
        throw new Error(`HTTP ${res.status}`);
      }
      const json = await res.json() as { success: boolean; data?: WorkflowInstanceState };
      if (json.success && json.data) {
        const incoming = json.data;
        if (incoming.stateVersion > localVersionRef.current) {
          localVersionRef.current = incoming.stateVersion;
          setState(incoming);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch workflow state');
    } finally {
      setLoading(false);
    }
  }, [compositionId]);

  useEffect(() => {
    if (!compositionId) return;
    void fetchState();
  }, [compositionId, fetchState]);

  useEffect(() => {
    if (!lastEvent || lastEvent.type !== 'workflow:state-change') return;
    if (!compositionId) return;
    if (!isWorkflowStatePayload(lastEvent.payload)) return;

    const incoming = lastEvent.payload;
    if (incoming.workflowId !== compositionId) return;

    const incomingVersion = typeof incoming.stateVersion === 'number' ? incoming.stateVersion : 0;
    if (incomingVersion <= localVersionRef.current) return;

    localVersionRef.current = incomingVersion;
    setState({
      workflowId: incoming.workflowId ?? compositionId,
      instanceId: incoming.instanceId ?? '',
      currentState: incoming.currentState ?? {},
      machineState: incoming.machineState ?? 'unknown',
      stateVersion: incomingVersion,
      updatedAt: incoming.updatedAt ?? new Date().toISOString(),
    });
  }, [lastEvent, compositionId]);

  return {
    state,
    loading,
    error,
    stateVersion: localVersionRef.current,
    refetch: fetchState,
  };
}
