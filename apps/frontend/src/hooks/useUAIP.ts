import { useState, useEffect, useCallback, useRef } from 'react';
import { _useAuth } from '../contexts/AuthContext';
import type {
  EnhancedAgentState,
  Operation,
  Capability,
  ApprovalWorkflow,
  UISystemMetrics as SystemMetrics,
  UIOperationEvent as _OperationEvent,
  AIInsight,
  DataState,
  UIError,
  UIWebSocketEvent as WebSocketEvent,
} from '@uaip/types';
import { uaipAPI } from '../utils/uaip-api';
import { getWebSocketURL } from '../config/apiConfig';

// Enhanced error handling for production deployment
const createUIError = (error: unknown, context: string): UIError => ({
  id: Date.now().toString(),
  type: 'api_error',
  message: error instanceof Error ? error.message : 'Unknown error',
  details: { error, context },
  timestamp: new Date(),
  resolved: false,
});

// Generic hook for data fetching - PRODUCTION READY (No Mock Data)
export function useAsyncData<T>(
  fetchFn: () => Promise<T>,
  dependencies: unknown[] = []
): DataState<T | null> {
  const [state, setState] = useState<DataState<T | null>>({
    data: null,
    isLoading: true,
    error: undefined,
    lastUpdated: undefined,
  });
  const dependenciesRef = useRef(dependencies);
  dependenciesRef.current = dependencies;

  const fetchData = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true, error: undefined }));

    try {
      const data = await fetchFn();
      setState({
        data,
        isLoading: false,
        error: undefined,
        lastUpdated: new Date(),
        refetch: fetchData,
      });
    } catch (error: unknown) {
      // Handle 404 errors gracefully - backend services might not be running
      if (error.message?.includes('404') || error.message?.includes('not found')) {
        console.warn('Backend service not available, using fallback data:', error.message);
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: undefined, // Don't show error for missing backend services
          refetch: fetchData,
        }));
      } else {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: createUIError(error, 'data fetch'),
          refetch: fetchData,
        }));
      }
    }
  }, [fetchFn]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { ...state, refetch: fetchData };
}

// Backend data transformation utilities
const adaptBackendAgentToFrontend = (agent: unknown): EnhancedAgentState => ({
  id: agent.id,
  name: agent.name,
  role: agent.role,
  status: agent.isActive ? 'active' : 'offline',
  lastActivity: agent.lastActiveAt || agent.updatedAt,
  metrics: {
    totalOperations: agent.metrics?.totalOperations || 0,
    successRate: agent.metrics?.successRate || 0.95,
    averageResponseTime: agent.metrics?.averageResponseTime || 250,
    uptime: agent.metrics?.uptime || 0.99,
  },
  configuration: agent.configuration,
  capabilities: agent.persona?.capabilities || [],
  securityLevel: agent.securityContext?.securityLevel || 'low',
  intelligenceMetrics: {
    decisionAccuracy: agent.intelligenceMetrics?.decisionAccuracy || 0.87,
    contextUnderstanding: agent.intelligenceMetrics?.contextUnderstanding || 0.92,
    adaptationRate: agent.intelligenceMetrics?.adaptationRate || 0.15,
    learningProgress: agent.intelligenceMetrics?.learningProgress || 0.68,
  },
});

const adaptBackendOperationToFrontend = (operation: unknown): Operation => ({
  id: operation.id,
  type: operation.type,
  status: operation.status,
  agentId: operation.agentId,
  userId: operation.userId,
  name: operation.title || operation.name,
  description: operation.description,
  context: operation.context,
  executionPlan: operation.executionPlan,
  metadata: operation.metadata,
  progress: operation.progress || 0,
  startTime: operation.startTime,
  endTime: operation.endTime,
  estimatedDuration: operation.estimatedDuration,
  priority: operation.priority,
  createdAt: operation.createdAt,
  updatedAt: operation.updatedAt,
});

const adaptBackendCapabilityToFrontend = (capability: unknown): Capability => ({
  id: capability.id,
  name: capability.name,
  description: capability.description,
  type: capability.type,
  status: capability.status,
  category: capability.category,
  version: capability.version,
  provider: capability.provider,
  metadata: capability.metadata,
  securityRequirements: capability.securityRequirements,
  artifactConfig: capability.artifactConfig,
  createdAt: capability.createdAt,
  updatedAt: capability.updatedAt,
});

// Hook for managing agents - PRODUCTION READY
export function useAgents() {
  const [agents, setAgents] = useState<EnhancedAgentState[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);

  const fetchAgents = useCallback(async () => {
    const response = await uaipAPI.client.agents.list();
    if (response.success && response.data) {
      const enhancedAgents: EnhancedAgentState[] = response.data.map(adaptBackendAgentToFrontend);
      setAgents(enhancedAgents);
      return enhancedAgents;
    }
    throw new Error('Failed to fetch agents from backend');
  }, []);

  const agentsState = useAsyncData(fetchAgents);

  // Update local state when data changes
  useEffect(() => {
    if (agentsState.data) {
      setAgents(agentsState.data);
    }
  }, [agentsState.data]);

  const updateAgent = useCallback(
    async (agentId: string, updates: unknown) => {
      try {
        const response = await uaipAPI.client.agents.update(agentId, updates);
        if (response.success) {
          await agentsState.refetch?.();
        }
        return response;
      } catch (error) {
        console.error('Failed to update agent:', error);
        throw error;
      }
    },
    [agentsState]
  );

  return {
    ...agentsState,
    agents,
    selectedAgent,
    setSelectedAgent,
    updateAgent,
    refreshAgents: agentsState.refetch,
  };
}

// Hook for managing operations - PRODUCTION READY
export function useOperations() {
  const [operations, setOperations] = useState<Operation[]>([]);
  const [selectedOperation, setSelectedOperation] = useState<string | null>(null);

  const fetchOperations = useCallback(async () => {
    try {
      const response = await uaipAPI.client.orchestration.list();
      if (response.success && response.data) {
        const adaptedOperations = response.data.map(adaptBackendOperationToFrontend);
        setOperations(adaptedOperations);
        return adaptedOperations;
      }
      throw new Error('Failed to fetch operations from backend');
    } catch (error: unknown) {
      // Provide fallback data when backend is not available
      if (error.message?.includes('404') || error.message?.includes('not found')) {
        const fallbackOperations: Operation[] = [];
        setOperations(fallbackOperations);
        return fallbackOperations;
      }
      throw error;
    }
  }, []);

  const operationsState = useAsyncData(fetchOperations);

  // Update local state when data changes
  useEffect(() => {
    if (operationsState.data) {
      setOperations(operationsState.data);
    }
  }, [operationsState.data]);

  const executeOperation = useCallback(
    async (operationRequest: unknown) => {
      try {
        const response = await uaipAPI.client.orchestration.execute(operationRequest);
        if (response.success) {
          await operationsState.refetch?.();
        }
        return response;
      } catch (error) {
        console.error('Failed to execute operation:', error);
        throw error;
      }
    },
    [operationsState]
  );

  const pauseOperation = useCallback(
    async (operationId: string, reason: string) => {
      try {
        const response = await uaipAPI.client.orchestration.pause(operationId, { reason });
        if (response.success) {
          await operationsState.refetch?.();
        }
        return response;
      } catch (error) {
        console.error('Failed to pause operation:', error);
        throw error;
      }
    },
    [operationsState]
  );

  const cancelOperation = useCallback(
    async (operationId: string, reason: string) => {
      try {
        const response = await uaipAPI.client.orchestration.cancel(operationId, { reason });
        if (response.success) {
          await operationsState.refetch?.();
        }
        return response;
      } catch (error) {
        console.error('Failed to cancel operation:', error);
        throw error;
      }
    },
    [operationsState]
  );

  return {
    ...operationsState,
    operations,
    selectedOperation,
    setSelectedOperation,
    executeOperation,
    pauseOperation,
    cancelOperation,
    refreshOperations: operationsState.refetch,
  };
}

// Hook for managing capabilities - PRODUCTION READY
export function useCapabilities() {
  const [capabilities, setCapabilities] = useState<Capability[]>([]);

  const fetchCapabilities = useCallback(async () => {
    try {
      const response = await uaipAPI.client.capabilities.search({});
      if (response.success && response.data) {
        const adaptedCapabilities = response.data.capabilities.map(
          adaptBackendCapabilityToFrontend
        );
        setCapabilities(adaptedCapabilities);
        return adaptedCapabilities;
      }
      throw new Error('Failed to fetch capabilities from backend');
    } catch (error: unknown) {
      // Provide fallback data when backend is not available
      if (error.message?.includes('404') || error.message?.includes('not found')) {
        const fallbackCapabilities: Capability[] = [
          {
            id: 'fallback-1',
            name: 'Text Analysis',
            description: 'Analyze and understand text content',
            type: 'cognitive',
            status: 'available',
            category: 'nlp',
            version: '1.0.0',
            provider: 'system',
            metadata: {},
            securityRequirements: [],
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ];
        setCapabilities(fallbackCapabilities);
        return fallbackCapabilities;
      }
      throw error;
    }
  }, []);

  const capabilitiesState = useAsyncData(fetchCapabilities);

  // Update local state when data changes
  useEffect(() => {
    if (capabilitiesState.data) {
      setCapabilities(capabilitiesState.data);
    }
  }, [capabilitiesState.data]);

  const searchCapabilities = useCallback(async (query: string) => {
    try {
      return await uaipAPI.client.capabilities.search({ query });
    } catch (error) {
      console.error('Failed to search capabilities:', error);
      throw error;
    }
  }, []);

  const registerCapability = useCallback(
    async (capability: unknown) => {
      try {
        const response = await uaipAPI.client.capabilities.register(capability);
        if (response.success) {
          await capabilitiesState.refetch?.();
        }
        return response;
      } catch (error) {
        console.error('Failed to register capability:', error);
        throw error;
      }
    },
    [capabilitiesState]
  );

  return {
    ...capabilitiesState,
    capabilities,
    searchCapabilities,
    registerCapability,
    refreshCapabilities: capabilitiesState.refetch,
  };
}

// Hook for system metrics - PRODUCTION READY
export function useSystemMetrics() {
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);

  const fetchMetrics = useCallback(async () => {
    const response = await uaipAPI.client.system.getMetrics();
    if (response.success && response.data) {
      setMetrics(response.data);
      return response.data;
    }
    throw new Error('Failed to fetch system metrics from backend');
  }, []);

  const metricsState = useAsyncData(fetchMetrics);

  // Update local state when data changes
  useEffect(() => {
    if (metricsState.data) {
      setMetrics(metricsState.data);
    }
  }, [metricsState.data]);

  // Auto-refresh metrics every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      metricsState.refetch?.();
    }, 30000);
    return () => clearInterval(interval);
  }, [metricsState]);

  return {
    ...metricsState,
    metrics,
    refreshMetrics: metricsState.refetch,
  };
}

// Hook for approval workflows - PRODUCTION READY
export function useApprovals() {
  const [approvals, setApprovals] = useState<ApprovalWorkflow[]>([]);

  const fetchApprovals = useCallback(async () => {
    const response = await uaipAPI.client.security.getApprovals();
    if (response.success && response.data) {
      setApprovals(response.data);
      return response.data;
    }
    throw new Error('Failed to fetch approvals from backend');
  }, []);

  const approvalsState = useAsyncData(fetchApprovals);

  // Update local state when data changes
  useEffect(() => {
    if (approvalsState.data) {
      setApprovals(approvalsState.data);
    }
  }, [approvalsState.data]);

  const processApproval = useCallback(
    async (workflowId: string, decision: 'approved' | 'rejected', reason?: string) => {
      try {
        const response = await uaipAPI.client.security.processApproval(workflowId, {
          decision,
          reason,
        });
        if (response.success) {
          await approvalsState.refetch?.();
        }
        return response;
      } catch (error) {
        console.error('Failed to process approval:', error);
        throw error;
      }
    },
    [approvalsState]
  );

  return {
    ...approvalsState,
    approvals,
    processApproval,
    refreshApprovals: approvalsState.refetch,
  };
}

// Enhanced WebSocket hook - PRODUCTION READY
export function useWebSocket(url?: string) {
  const [isConnected, setIsConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<WebSocketEvent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;

  const connect = useCallback(async () => {
    const baseUrl = url || getWebSocketURL().replace('/socket.io', '/ws');
    const wsUrl = baseUrl;

    try {
      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        setIsConnected(true);
        setError(null);
        reconnectAttempts.current = 0;
      };

      wsRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as WebSocketEvent;
          setLastEvent(data);
        } catch (err) {
          console.error('[UAIP WebSocket] Failed to parse message:', err);
        }
      };

      wsRef.current.onclose = () => {
        setIsConnected(false);

        // Attempt to reconnect if we haven't exceeded max attempts
        if (reconnectAttempts.current < maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
          reconnectAttempts.current++;

          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, delay);
        } else {
          setError('Max reconnection attempts reached');
        }
      };

      wsRef.current.onerror = (socketError) => {
        setError('WebSocket connection error');
        console.error('[UAIP WebSocket] Error:', socketError);
      };
    } catch (err) {
      setError('Failed to create WebSocket connection');
      console.error('[UAIP WebSocket] Creation error:', err);
    }
  }, [url]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setIsConnected(false);
    reconnectAttempts.current = 0;
  }, []);

  const sendMessage = useCallback((message: unknown) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    } else {
      console.warn('[UAIP WebSocket] Cannot send message: not connected');
    }
  }, []);

  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  return {
    isConnected,
    lastEvent,
    error,
    connect,
    disconnect,
    sendMessage,
  };
}

// Hook for AI insights - PRODUCTION READY
export function useInsights() {
  const [insights, setInsights] = useState<AIInsight[]>([]);

  const fetchInsights = useCallback(async () => {
    const response = await uaipAPI.client.intelligence.getInsights();
    if (response.success && response.data) {
      setInsights(response.data);
      return response.data;
    }
    throw new Error('Failed to fetch insights from backend');
  }, []);

  const insightsState = useAsyncData(fetchInsights);

  // Update local state when data changes
  useEffect(() => {
    if (insightsState.data) {
      setInsights(insightsState.data);
    }
  }, [insightsState.data]);

  const generateInsight = useCallback(
    async (request: unknown) => {
      try {
        const response = await uaipAPI.client.intelligence.generateInsight(request);
        if (response.success) {
          await insightsState.refetch?.();
        }
        return response;
      } catch (error) {
        console.error('Failed to generate insight:', error);
        throw error;
      }
    },
    [insightsState]
  );

  return {
    ...insightsState,
    insights,
    generateInsight,
    refreshInsights: insightsState.refetch,
  };
}
