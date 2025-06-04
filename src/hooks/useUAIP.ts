import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
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

// Enhanced error handling with backend availability context
const createUIError = (error: any, context: string, isBackendUnavailable = false): UIError => ({
  id: Date.now().toString(),
  type: isBackendUnavailable ? 'api_error' : 'api_error',
  message: isBackendUnavailable 
    ? `Backend services unavailable - using mock data for ${context}`
    : (error instanceof Error ? error.message : 'Unknown error'),
  details: { error, context, isBackendUnavailable },
  timestamp: new Date(),
  resolved: false
});

// Generic hook for data fetching with backend availability handling
export function useAsyncData<T>(
  fetchFn: () => Promise<T>,
  mockDataFn?: () => T,
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
      // Check backend availability first
      const isBackendAvailable = await uaipAPI.isBackendAvailable();
      
      if (!isBackendAvailable && mockDataFn) {
        // Use mock data when backend is unavailable
        const mockData = mockDataFn();
        setState({
          data: mockData,
          isLoading: false,
          error: createUIError(
            new Error('Backend unavailable'), 
            'data fetch', 
            true
          ),
          lastUpdated: new Date(),
          refetch: fetchData
        });
        return;
      }
      
      // Try to fetch real data
      const data = await fetchFn();
      setState({
        data,
        isLoading: false,
        error: undefined,
        lastUpdated: new Date(),
        refetch: fetchData
      });
    } catch (error) {
      // If real fetch fails and we have mock data, use it
      if (mockDataFn) {
        const mockData = mockDataFn();
        setState({
          data: mockData,
          isLoading: false,
          error: createUIError(error, 'data fetch', true),
          lastUpdated: new Date(),
          refetch: fetchData
        });
      } else {
        // No mock data available, show error
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: createUIError(error, 'data fetch', false),
          refetch: fetchData
        }));
      }
    }
  }, dependencies);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { ...state, refetch: fetchData };
}

// Mock data generators
const generateMockAgents = (): EnhancedAgentState[] => [
  {
    id: 'mock-agent-1',
    name: 'Technical Lead',
    role: 'assistant',
    status: 'active',
    lastActivity: new Date(Date.now() - 5 * 60 * 1000), // 5 minutes ago
    metrics: {
      totalOperations: 42,
      successRate: 0.94,
      averageResponseTime: 1200,
      uptime: 0.99
    },
    capabilities: ['code-analysis', 'architecture-design', 'debugging'],
    securityLevel: 'medium',
    intelligenceMetrics: {
      decisionAccuracy: 0.87,
      contextUnderstanding: 0.92,
      adaptationRate: 0.15,
      learningProgress: 0.68
    }
  },
  {
    id: 'mock-agent-2',
    name: 'Creative Director',
    role: 'specialist',
    status: 'active',
    lastActivity: new Date(Date.now() - 2 * 60 * 1000), // 2 minutes ago
    metrics: {
      totalOperations: 28,
      successRate: 0.89,
      averageResponseTime: 950,
      uptime: 0.97
    },
    capabilities: ['ui-design', 'user-experience', 'creative-writing'],
    securityLevel: 'low',
    intelligenceMetrics: {
      decisionAccuracy: 0.91,
      contextUnderstanding: 0.88,
      adaptationRate: 0.22,
      learningProgress: 0.74
    }
  }
];

const generateMockOperations = (): Operation[] => [
  {
    id: 'mock-op-1',
    type: 'tool_execution',
    status: 'running',
    agentId: 'mock-agent-1',
    userId: 'user-1',
    name: 'Code Architecture Review',
    description: 'Analyzing system architecture for scalability improvements',
    context: {
      executionContext: {
        agentId: 'mock-agent-1',
        userId: 'user-1',
        environment: 'development',
        timeout: 3600,
        resourceLimits: {
          maxMemory: 1024,
          maxCpu: 2,
          maxDuration: 3600
        }
      }
    },
    executionPlan: {
      id: 'plan-1',
      type: 'analysis',
      agentId: 'mock-agent-1',
      steps: [
        {
          id: 'step-1',
          type: 'data_collection',
          description: 'Collect code metrics',
          estimatedDuration: 300
        }
      ],
      dependencies: [],
      estimatedDuration: 900,
      metadata: {}
    },
    metadata: {
      priority: 'medium',
      tags: ['architecture', 'analysis'],
      estimatedDuration: 900,
      resourceRequirements: {
        cpu: 2,
        memory: 1024,
        network: true,
        gpu: false
      }
    },
    progress: 0.65,
    startTime: new Date(Date.now() - 10 * 60 * 1000),
    estimatedDuration: 15 * 60 * 1000,
    priority: 'medium',
    createdAt: new Date(Date.now() - 10 * 60 * 1000),
    updatedAt: new Date()
  },
  {
    id: 'mock-op-2',
    type: 'artifact_generation',
    status: 'completed',
    agentId: 'mock-agent-2',
    userId: 'user-1',
    name: 'UI Component Design',
    description: 'Creating responsive dashboard components',
    context: {
      executionContext: {
        agentId: 'mock-agent-2',
        userId: 'user-1',
        environment: 'development',
        timeout: 1800,
        resourceLimits: {
          maxMemory: 512,
          maxCpu: 1,
          maxDuration: 1800
        }
      }
    },
    executionPlan: {
      id: 'plan-2',
      type: 'generation',
      agentId: 'mock-agent-2',
      steps: [
        {
          id: 'step-1',
          type: 'design',
          description: 'Create UI components',
          estimatedDuration: 1500
        }
      ],
      dependencies: [],
      estimatedDuration: 1500,
      metadata: {}
    },
    metadata: {
      priority: 'high',
      tags: ['ui', 'design'],
      estimatedDuration: 1500,
      resourceRequirements: {
        cpu: 1,
        memory: 512,
        network: false,
        gpu: false
      }
    },
    progress: 1.0,
    startTime: new Date(Date.now() - 30 * 60 * 1000),
    endTime: new Date(Date.now() - 5 * 60 * 1000),
    estimatedDuration: 25 * 60 * 1000,
    priority: 'high',
    createdAt: new Date(Date.now() - 30 * 60 * 1000),
    updatedAt: new Date()
  }
];

const generateMockCapabilities = (): Capability[] => [
  {
    id: 'mock-cap-1',
    name: 'Code Analysis',
    description: 'Advanced static code analysis and quality assessment',
    type: 'tool',
    status: 'active',
    category: 'development',
    version: '1.2.0',
    provider: 'UAIP Core',
    metadata: {
      tags: ['typescript', 'javascript', 'python'],
      category: 'development',
      trustScore: 9.2,
      usageCount: 156
    },
    securityRequirements: {
      minimumSecurityLevel: 'medium',
      requiredPermissions: ['read_code'],
      sensitiveData: false,
      auditRequired: true
    },
    createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    updatedAt: new Date()
  },
  {
    id: 'mock-cap-2',
    name: 'UI Design Generation',
    description: 'Automated UI component and layout generation',
    type: 'artifact',
    status: 'active',
    category: 'design',
    version: '2.1.0',
    provider: 'UAIP Design',
    metadata: {
      tags: ['react', 'vue', 'angular'],
      category: 'design',
      trustScore: 8.7,
      usageCount: 89
    },
    artifactConfig: {
      templateEngine: 'handlebars',
      template: '<div class="component">{{content}}</div>',
      outputFormat: 'html',
      variables: [
        {
          name: 'content',
          type: 'string',
          required: true,
          description: 'Component content'
        }
      ]
    },
    securityRequirements: {
      minimumSecurityLevel: 'low',
      requiredPermissions: ['create_artifacts'],
      sensitiveData: false,
      auditRequired: false
    },
    createdAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
    updatedAt: new Date()
  }
];

// Type adapters to convert between backend and frontend types
const adaptBackendOperationToFrontend = (backendOp: any): Operation => ({
  id: backendOp.id,
  type: backendOp.type,
  status: backendOp.status,
  agentId: backendOp.agentId,
  userId: backendOp.userId,
  name: backendOp.name,
  description: backendOp.description,
  context: backendOp.context,
  executionPlan: backendOp.executionPlan,
  metadata: backendOp.metadata,
  progress: backendOp.progress,
  startTime: backendOp.startTime,
  endTime: backendOp.endTime,
  estimatedDuration: backendOp.estimatedDuration,
  priority: backendOp.priority || 'medium', // Add default priority
  createdAt: backendOp.createdAt,
  updatedAt: backendOp.updatedAt
});

const adaptBackendCapabilityToFrontend = (backendCap: any): Capability => ({
  id: backendCap.id,
  name: backendCap.name,
  description: backendCap.description,
  type: backendCap.type,
  status: backendCap.status,
  category: backendCap.category || 'general', // Add default category
  version: backendCap.version || '1.0.0', // Add default version
  provider: backendCap.provider || 'Unknown', // Add default provider
  metadata: {
    ...backendCap.metadata,
    version: backendCap.metadata?.version || '1.0.0', // Ensure version is present
    category: backendCap.metadata?.category || backendCap.category || 'general',
    tags: backendCap.metadata?.tags || [],
    trustScore: backendCap.metadata?.trustScore || 5.0,
    usageCount: backendCap.metadata?.usageCount || 0
  },
  securityRequirements: backendCap.securityRequirements,
  artifactConfig: backendCap.artifactConfig,
  createdAt: backendCap.createdAt,
  updatedAt: backendCap.updatedAt
});

// Hook for managing agents
export function useAgents() {
  const [agents, setAgents] = useState<EnhancedAgentState[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);

  const fetchAgents = useCallback(async () => {
    const response = await uaipAPI.client.agents.list();
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
      return enhancedAgents;
    }
    throw new Error('Failed to fetch agents');
  }, []);

  const agentsState = useAsyncData(fetchAgents, generateMockAgents);

  // Update local state when data changes
  useEffect(() => {
    if (agentsState.data) {
      setAgents(agentsState.data);
    }
  }, [agentsState.data]);

  const updateAgent = useCallback(async (agentId: string, updates: any) => {
    try {
      const isBackendAvailable = await uaipAPI.isBackendAvailable();
      
      if (!isBackendAvailable) {
        // Simulate update in mock data
        setAgents(prev => prev.map(agent => 
          agent.id === agentId ? { ...agent, ...updates } : agent
        ));
        return { success: true, data: null };
      }
      
      const response = await uaipAPI.client.agents.update(agentId, updates);
      if (response.success) {
        await agentsState.refetch?.();
      }
      return response;
    } catch (error) {
      console.error('Failed to update agent:', error);
      throw error;
    }
  }, [agentsState.refetch]);

  return {
    ...agentsState,
    agents,
    selectedAgent,
    setSelectedAgent,
    updateAgent,
    refreshAgents: agentsState.refetch
  };
}

// Hook for managing operations
export function useOperations() {
  const [operations, setOperations] = useState<Operation[]>([]);
  const [selectedOperation, setSelectedOperation] = useState<string | null>(null);

  const fetchOperations = useCallback(async () => {
    const response = await uaipAPI.client.orchestration.list();
    if (response.success && response.data) {
      // Adapt backend operations to frontend format
      const adaptedOperations = response.data.map(adaptBackendOperationToFrontend);
      setOperations(adaptedOperations);
      return adaptedOperations;
    }
    throw new Error('Failed to fetch operations');
  }, []);

  const operationsState = useAsyncData(fetchOperations, generateMockOperations);

  // Update local state when data changes
  useEffect(() => {
    if (operationsState.data) {
      setOperations(operationsState.data);
    }
  }, [operationsState.data]);

  const executeOperation = useCallback(async (operationRequest: any) => {
    try {
      const isBackendAvailable = await uaipAPI.isBackendAvailable();
      
      if (!isBackendAvailable) {
        // Simulate operation execution in mock data
        const newOperation: Operation = {
          id: `mock-op-${Date.now()}`,
          type: operationRequest.type || 'tool_execution',
          status: 'running',
          agentId: operationRequest.agentId || 'mock-agent-1',
          userId: operationRequest.userId || 'user-1',
          name: operationRequest.title || 'Mock Operation',
          description: operationRequest.description || 'Simulated operation execution',
          context: {
            executionContext: {
              agentId: operationRequest.agentId || 'mock-agent-1',
              userId: operationRequest.userId || 'user-1',
              environment: 'development',
              timeout: 3600,
              resourceLimits: {
                maxMemory: 1024,
                maxCpu: 2,
                maxDuration: 3600
              }
            }
          },
          executionPlan: {
            id: `plan-${Date.now()}`,
            type: operationRequest.type || 'tool_execution',
            agentId: operationRequest.agentId || 'mock-agent-1',
            steps: [],
            dependencies: [],
            estimatedDuration: 300,
            metadata: {}
          },
          metadata: {
            priority: operationRequest.priority || 'medium',
            tags: [],
            estimatedDuration: 300,
            resourceRequirements: {
              cpu: 1,
              memory: 512,
              network: true,
              gpu: false
            }
          },
          progress: 0,
          startTime: new Date(),
          estimatedDuration: 5 * 60 * 1000, // 5 minutes
          priority: operationRequest.priority || 'medium',
          createdAt: new Date(),
          updatedAt: new Date()
        };
        
        setOperations(prev => [newOperation, ...prev]);
        return { success: true, data: newOperation };
      }
      
      const response = await uaipAPI.client.orchestration.execute(operationRequest);
      if (response.success) {
        await operationsState.refetch?.();
      }
      return response;
    } catch (error) {
      console.error('Failed to execute operation:', error);
      throw error;
    }
  }, [operationsState.refetch]);

  const pauseOperation = useCallback(async (operationId: string, reason: string) => {
    try {
      const isBackendAvailable = await uaipAPI.isBackendAvailable();
      
      if (!isBackendAvailable) {
        // Simulate pause in mock data
        setOperations(prev => prev.map(op => 
          op.id === operationId ? { ...op, status: 'paused' as const } : op
        ));
        return { success: true, data: null };
      }
      
      const response = await uaipAPI.client.orchestration.pause(operationId, { reason });
      if (response.success) {
        await operationsState.refetch?.();
      }
      return response;
    } catch (error) {
      console.error('Failed to pause operation:', error);
      throw error;
    }
  }, [operationsState.refetch]);

  const cancelOperation = useCallback(async (operationId: string, reason: string) => {
    try {
      const isBackendAvailable = await uaipAPI.isBackendAvailable();
      
      if (!isBackendAvailable) {
        // Simulate cancel in mock data
        setOperations(prev => prev.map(op => 
          op.id === operationId ? { ...op, status: 'cancelled' as const } : op
        ));
        return { success: true, data: null };
      }
      
      const response = await uaipAPI.client.orchestration.cancel(operationId, { reason });
      if (response.success) {
        await operationsState.refetch?.();
      }
      return response;
    } catch (error) {
      console.error('Failed to cancel operation:', error);
      throw error;
    }
  }, [operationsState.refetch]);

  return {
    ...operationsState,
    operations,
    selectedOperation,
    setSelectedOperation,
    executeOperation,
    pauseOperation,
    cancelOperation,
    refreshOperations: operationsState.refetch
  };
}

// Hook for managing capabilities
export function useCapabilities() {
  const [capabilities, setCapabilities] = useState<Capability[]>([]);

  const fetchCapabilities = useCallback(async () => {
    const response = await uaipAPI.client.capabilities.search({});
    if (response.success && response.data) {
      // Adapt backend capabilities to frontend format
      const adaptedCapabilities = response.data.capabilities.map(adaptBackendCapabilityToFrontend);
      setCapabilities(adaptedCapabilities);
      return adaptedCapabilities;
    }
    throw new Error('Failed to fetch capabilities');
  }, []);

  const capabilitiesState = useAsyncData(fetchCapabilities, generateMockCapabilities);

  // Update local state when data changes
  useEffect(() => {
    if (capabilitiesState.data) {
      setCapabilities(capabilitiesState.data);
    }
  }, [capabilitiesState.data]);

  const searchCapabilities = useCallback(async (query: string) => {
    try {
      const isBackendAvailable = await uaipAPI.isBackendAvailable();
      
      if (!isBackendAvailable) {
        // Simulate search in mock data
        const mockResults = generateMockCapabilities().filter(cap =>
          cap.name.toLowerCase().includes(query.toLowerCase()) ||
          cap.description.toLowerCase().includes(query.toLowerCase())
        );
        return { success: true, data: { capabilities: mockResults } };
      }
      
      return await uaipAPI.client.capabilities.search({ query });
    } catch (error) {
      console.error('Failed to search capabilities:', error);
      throw error;
    }
  }, []);

  const registerCapability = useCallback(async (capability: any) => {
    try {
      const isBackendAvailable = await uaipAPI.isBackendAvailable();
      
      if (!isBackendAvailable) {
        // Simulate registration in mock data
        const newCapability: Capability = {
          id: `mock-cap-${Date.now()}`,
          name: capability.name,
          description: capability.description,
          type: capability.type || 'tool',
          status: 'active',
          category: capability.category || 'general',
          version: '1.0.0',
          provider: 'User',
          metadata: {
            tags: capability.metadata?.tags || [],
            category: capability.category || 'general',
            trustScore: 5.0,
            usageCount: 0
          },
          securityRequirements: capability.securityRequirements || {
            minimumSecurityLevel: 'low',
            requiredPermissions: [],
            sensitiveData: false,
            auditRequired: false
          },
          createdAt: new Date(),
          updatedAt: new Date()
        };
        
        setCapabilities(prev => [newCapability, ...prev]);
        return { success: true, data: newCapability };
      }
      
      const response = await uaipAPI.client.capabilities.register(capability);
      if (response.success) {
        await capabilitiesState.refetch?.();
      }
      return response;
    } catch (error) {
      console.error('Failed to register capability:', error);
      throw error;
    }
  }, [capabilitiesState.refetch]);

  return {
    ...capabilitiesState,
    capabilities,
    searchCapabilities,
    registerCapability,
    refreshCapabilities: capabilitiesState.refetch
  };
}

// Enhanced WebSocket hook with better error handling
export function useWebSocket(url?: string) {
  const [isConnected, setIsConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<WebSocketEvent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [backendAvailable, setBackendAvailable] = useState<boolean | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;

  const connect = useCallback(async () => {
    // Check backend availability first
    const available = await uaipAPI.isBackendAvailable();
    setBackendAvailable(available);
    
    if (!available) {
      setError('Backend services unavailable - WebSocket disabled');
      setIsConnected(false);
      return;
    }

    const wsUrl = url || `ws://localhost:3000/ws`;
    
    try {
      wsRef.current = new WebSocket(wsUrl);
      
      wsRef.current.onopen = () => {
        setIsConnected(true);
        setError(null);
        reconnectAttempts.current = 0;
        console.log('[UAIP WebSocket] Connected successfully');
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
        console.log('[UAIP WebSocket] Disconnected');
        
        // Attempt to reconnect if we haven't exceeded max attempts
        if (reconnectAttempts.current < maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
          reconnectAttempts.current++;
          
          reconnectTimeoutRef.current = setTimeout(() => {
            console.log(`[UAIP WebSocket] Reconnection attempt ${reconnectAttempts.current}/${maxReconnectAttempts}`);
            connect();
          }, delay);
        } else {
          setError('Max reconnection attempts reached');
        }
      };
      
      wsRef.current.onerror = (error) => {
        setError('WebSocket connection error');
        console.error('[UAIP WebSocket] Error:', error);
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

  const forceReconnect = useCallback(() => {
    disconnect();
    reconnectAttempts.current = 0;
    setError(null);
    connect();
  }, [connect, disconnect]);

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
    backendAvailable,
    connect: forceReconnect,
    disconnect
  };
}

// Hook for system metrics with enhanced mock data
export function useSystemMetrics() {
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);

  const fetchMetrics = useCallback(async () => {
    // Enhanced mock metrics with more realistic data
    const mockMetrics: SystemMetrics = {
      timestamp: new Date(),
      performance: {
        cpu: 45 + Math.random() * 30, // 45-75%
        memory: 60 + Math.random() * 25, // 60-85%
        storage: 30 + Math.random() * 20, // 30-50%
        network: 10 + Math.random() * 40 // 10-50%
      },
      operations: {
        active: Math.floor(Math.random() * 5) + 1,
        queued: Math.floor(Math.random() * 3),
        completed: 147 + Math.floor(Math.random() * 20),
        failed: Math.floor(Math.random() * 3)
      },
      agents: {
        active: 2,
        idle: Math.floor(Math.random() * 2),
        busy: Math.floor(Math.random() * 2),
        offline: Math.floor(Math.random() * 1)
      },
      security: {
        pendingApprovals: Math.floor(Math.random() * 2),
        securityEvents: Math.floor(Math.random() * 5),
        threatLevel: 'low'
      }
    };
    setMetrics(mockMetrics);
    return mockMetrics;
  }, []);

  const metricsState = useAsyncData(fetchMetrics, () => {
    // Fallback mock data
    return {
      timestamp: new Date(),
      performance: { cpu: 50, memory: 65, storage: 35, network: 25 },
      operations: { active: 2, queued: 1, completed: 150, failed: 1 },
      agents: { active: 2, idle: 1, busy: 1, offline: 0 },
      security: { pendingApprovals: 0, securityEvents: 2, threatLevel: 'low' as const }
    };
  });

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
  }, [metricsState.refetch]);

  return {
    ...metricsState,
    metrics
  };
}

// Hook for approval workflows with enhanced mock data
export function useApprovals() {
  const [approvals, setApprovals] = useState<ApprovalWorkflow[]>([]);

  const fetchApprovals = useCallback(async () => {
    // Enhanced mock approvals
    const mockApprovals: ApprovalWorkflow[] = [
      {
        id: 'approval-1',
        operationId: 'mock-op-1',
        type: 'tool_execution',
        status: 'pending',
        requestedBy: 'mock-agent-1',
        requestedAt: new Date(Date.now() - 5 * 60 * 1000),
        priority: 'medium',
        description: 'Security review required for external API access',
        riskLevel: 'medium',
        requiredApprovers: ['security-officer-1'],
        approvals: [],
        context: {
          agentId: 'mock-agent-1',
          resourcesAccessed: ['external_api'],
          estimatedImpact: 'Low risk data access',
          securityImplications: ['external_api', 'data_access']
        },
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours from now
      }
    ];
    setApprovals(mockApprovals);
    return mockApprovals;
  }, []);

  const approvalsState = useAsyncData(fetchApprovals, () => []);

  // Update local state when data changes
  useEffect(() => {
    if (approvalsState.data) {
      setApprovals(approvalsState.data);
    }
  }, [approvalsState.data]);

  const processApproval = useCallback(async (
    workflowId: string, 
    decision: 'approved' | 'rejected', 
    reason?: string
  ) => {
    try {
      const isBackendAvailable = await uaipAPI.isBackendAvailable();
      
      if (!isBackendAvailable) {
        // Simulate approval processing in mock data
        setApprovals(prev => prev.map(approval => 
          approval.id === workflowId 
            ? { 
                ...approval, 
                status: decision,
                processedAt: new Date(),
                processedBy: 'user',
                reason 
              } 
            : approval
        ));
        return { success: true, data: null };
      }
      
      // TODO: Implement actual approval processing
      console.log('Processing approval:', { workflowId, decision, reason });
      await approvalsState.refetch?.();
      return { success: true, data: null };
    } catch (error) {
      console.error('Failed to process approval:', error);
      throw error;
    }
  }, [approvalsState.refetch]);

  return {
    ...approvalsState,
    approvals,
    processApproval,
    refreshApprovals: approvalsState.refetch
  };
} 