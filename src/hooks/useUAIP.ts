import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  EnhancedAgentState, 
  Operation, 
  Capability, 
  ApprovalWorkflow,
  SystemMetrics,
  OperationEvent,
  AIInsight,
  DataState,
  UIError,
  WebSocketEvent
} from '../types/uaip-interfaces';
import { uaipAPI } from '../services/uaip-api';

// Generic hook for data fetching with loading states
export function useAsyncData<T>(
  fetchFn: () => Promise<T>,
  dependencies: any[] = []
): DataState<T | null> {
  const [state, setState] = useState<DataState<T | null>>({
    data: null,
    isLoading: true,
    error: undefined,
    lastUpdated: undefined
  });

  const fetchData = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true, error: undefined }));
    
    try {
      const data = await fetchFn();
      setState({
        data,
        isLoading: false,
        error: undefined,
        lastUpdated: new Date()
      });
    } catch (error) {
      const uiError: UIError = {
        id: Date.now().toString(),
        type: 'api_error',
        message: error instanceof Error ? error.message : 'Unknown error',
        details: { error },
        timestamp: new Date(),
        resolved: false
      };
      
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: uiError
      }));
    }
  }, dependencies);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { ...state, refetch: fetchData };
}

// Hook for managing agents
export function useAgents() {
  const [agents, setAgents] = useState<EnhancedAgentState[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);

  const fetchAgents = useCallback(async () => {
    const response = await uaipAPI.client.agent.list();
    if (response.success && response.data) {
      // Transform backend agents to enhanced frontend state
      const enhancedAgents: EnhancedAgentState[] = response.data.map(agent => ({
        id: agent.id,
        name: agent.name,
        role: agent.role,
        status: agent.isActive ? 'active' : 'offline',
        lastActivity: agent.lastActiveAt || agent.updatedAt,
        metrics: {
          totalOperations: 0, // TODO: Get from backend
          successRate: 0.95, // TODO: Get from backend
          averageResponseTime: 250, // TODO: Get from backend
          uptime: 0.99 // TODO: Get from backend
        },
        capabilities: agent.persona.capabilities,
        securityLevel: agent.securityContext.securityLevel,
        intelligenceMetrics: {
          decisionAccuracy: 0.87, // TODO: Get from backend
          contextUnderstanding: 0.92, // TODO: Get from backend
          adaptationRate: 0.15, // TODO: Get from backend
          learningProgress: 0.68 // TODO: Get from backend
        }
      }));
      setAgents(enhancedAgents);
    }
  }, []);

  const agentsState = useAsyncData(fetchAgents);

  const updateAgent = useCallback(async (agentId: string, updates: any) => {
    const response = await uaipAPI.client.agent.update(agentId, updates);
    if (response.success) {
      await fetchAgents(); // Refresh agents list
    }
    return response;
  }, [fetchAgents]);

  return {
    ...agentsState,
    agents,
    selectedAgent,
    setSelectedAgent,
    updateAgent,
    refreshAgents: fetchAgents
  };
}

// Hook for managing operations
export function useOperations() {
  const [operations, setOperations] = useState<Operation[]>([]);
  const [selectedOperation, setSelectedOperation] = useState<string | null>(null);

  const fetchOperations = useCallback(async () => {
    const response = await uaipAPI.client.orchestration.listOperations();
    if (response.success && response.data) {
      setOperations(response.data);
    }
  }, []);

  const operationsState = useAsyncData(fetchOperations);

  const executeOperation = useCallback(async (operationRequest: any) => {
    const response = await uaipAPI.client.orchestration.executeOperation(operationRequest);
    if (response.success) {
      await fetchOperations(); // Refresh operations list
    }
    return response;
  }, [fetchOperations]);

  const pauseOperation = useCallback(async (operationId: string, reason: string) => {
    const response = await uaipAPI.client.orchestration.pauseOperation(operationId, { reason });
    if (response.success) {
      await fetchOperations();
    }
    return response;
  }, [fetchOperations]);

  const cancelOperation = useCallback(async (operationId: string, reason: string) => {
    const response = await uaipAPI.client.orchestration.cancelOperation(operationId, { reason });
    if (response.success) {
      await fetchOperations();
    }
    return response;
  }, [fetchOperations]);

  return {
    ...operationsState,
    operations,
    selectedOperation,
    setSelectedOperation,
    executeOperation,
    pauseOperation,
    cancelOperation,
    refreshOperations: fetchOperations
  };
}

// Hook for managing capabilities
export function useCapabilities() {
  const [capabilities, setCapabilities] = useState<Capability[]>([]);

  const fetchCapabilities = useCallback(async () => {
    const response = await uaipAPI.client.capability.search({});
    if (response.success && response.data) {
      setCapabilities(response.data.capabilities);
    }
  }, []);

  const capabilitiesState = useAsyncData(fetchCapabilities);

  const searchCapabilities = useCallback(async (query: string) => {
    const response = await uaipAPI.client.capability.search({ query });
    return response;
  }, []);

  const registerCapability = useCallback(async (capability: any) => {
    const response = await uaipAPI.client.capability.register(capability);
    if (response.success) {
      await fetchCapabilities();
    }
    return response;
  }, [fetchCapabilities]);

  return {
    ...capabilitiesState,
    capabilities,
    searchCapabilities,
    registerCapability,
    refreshCapabilities: fetchCapabilities
  };
}

// Hook for WebSocket real-time updates
export function useWebSocket(url?: string) {
  const [isConnected, setIsConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<WebSocketEvent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const connect = useCallback(() => {
    const wsUrl = url || `ws://localhost:3000/ws`;
    
    try {
      wsRef.current = new WebSocket(wsUrl);
      
      wsRef.current.onopen = () => {
        setIsConnected(true);
        setError(null);
        console.log('UAIP WebSocket connected');
      };
      
      wsRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as WebSocketEvent;
          setLastEvent(data);
        } catch (err) {
          console.error('Failed to parse WebSocket message:', err);
        }
      };
      
      wsRef.current.onclose = () => {
        setIsConnected(false);
        console.log('UAIP WebSocket disconnected');
        
        // Attempt to reconnect after 3 seconds
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, 3000);
      };
      
      wsRef.current.onerror = (error) => {
        setError('WebSocket connection error');
        console.error('UAIP WebSocket error:', error);
      };
    } catch (err) {
      setError('Failed to create WebSocket connection');
      console.error('WebSocket creation error:', err);
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
  }, []);

  useEffect(() => {
    connect();
    
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return {
    isConnected,
    lastEvent,
    error,
    connect,
    disconnect
  };
}

// Hook for system metrics
export function useSystemMetrics() {
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);

  const fetchMetrics = useCallback(async () => {
    // TODO: Implement actual metrics endpoint
    const mockMetrics: SystemMetrics = {
      timestamp: new Date(),
      performance: {
        cpu: Math.random() * 100,
        memory: Math.random() * 100,
        storage: Math.random() * 100,
        network: Math.random() * 100
      },
      operations: {
        active: Math.floor(Math.random() * 10),
        queued: Math.floor(Math.random() * 5),
        completed: Math.floor(Math.random() * 100),
        failed: Math.floor(Math.random() * 5)
      },
      agents: {
        active: Math.floor(Math.random() * 5),
        idle: Math.floor(Math.random() * 3),
        busy: Math.floor(Math.random() * 2),
        offline: Math.floor(Math.random() * 1)
      },
      security: {
        pendingApprovals: Math.floor(Math.random() * 3),
        securityEvents: Math.floor(Math.random() * 10),
        threatLevel: 'low'
      }
    };
    setMetrics(mockMetrics);
  }, []);

  const metricsState = useAsyncData(fetchMetrics);

  // Auto-refresh metrics every 30 seconds
  useEffect(() => {
    const interval = setInterval(fetchMetrics, 30000);
    return () => clearInterval(interval);
  }, [fetchMetrics]);

  return {
    ...metricsState,
    metrics
  };
}

// Hook for approval workflows
export function useApprovals() {
  const [approvals, setApprovals] = useState<ApprovalWorkflow[]>([]);

  const fetchApprovals = useCallback(async () => {
    // TODO: Implement actual approvals endpoint
    const mockApprovals: ApprovalWorkflow[] = [];
    setApprovals(mockApprovals);
  }, []);

  const approvalsState = useAsyncData(fetchApprovals);

  const processApproval = useCallback(async (
    workflowId: string, 
    decision: 'approved' | 'rejected', 
    reason?: string
  ) => {
    // TODO: Implement actual approval processing
    console.log('Processing approval:', { workflowId, decision, reason });
    await fetchApprovals();
  }, [fetchApprovals]);

  return {
    ...approvalsState,
    approvals,
    processApproval,
    refreshApprovals: fetchApprovals
  };
} 