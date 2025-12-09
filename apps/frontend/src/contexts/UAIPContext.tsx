import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useAgents } from './AgentContext';
import { useAuth } from './AuthContext';
import uaipAPI from '@/utils/uaip-api';

// Import shared types
import type {
  Operation,
  OperationStatus,
  OperationPriority,
  Capability,
  ApprovalWorkflow,
  HealthStatus,
  SystemMetrics as SharedSystemMetrics,
  LLMModel,
  DiscussionEvent,
} from '@uaip/types';

// Import UI-specific types
import type {
  EnhancedAgentState,
  UIOperation,
  UICapability,
  UIApprovalWorkflow,
  AgentCapabilityMetrics,
  SecurityContext,
  OperationEvent,
  SystemMetrics,
  ToolIntegration,
  AIInsight,
  ConversationContext,
  CapabilityUsage,
  WebSocketEvent,
  UIState,
  UIError,
  DataState,
} from '@/types/ui-interfaces';

// Event types for the UAIP system
interface UAIPEvent {
  id: string;
  type: 'info' | 'warning' | 'error' | 'success';
  source: string;
  message: string;
  timestamp: Date;
  correlationId?: string;
}

// Context interface
interface UAIPContextType {
  // Data states
  agents: DataState<EnhancedAgentState[]>;
  operations: DataState<UIOperation[]>;
  capabilities: DataState<UICapability[]>;
  approvals: DataState<UIApprovalWorkflow[]>;
  insights: DataState<AIInsight[]>;
  events: DataState<UAIPEvent[]>;
  systemMetrics: DataState<SystemMetrics>;
  toolIntegrations: DataState<ToolIntegration[]>;

  // UI state
  uiState: UIState;
  setUIState: (state: Partial<UIState>) => void;

  // Actions
  refreshData: () => Promise<void>;
  executeOperation: (operationDef: any) => Promise<string>;
  approveExecution: (executionId: string) => Promise<void>;
  rejectExecution: (executionId: string, reason: string) => Promise<void>;

  // WebSocket status
  isWebSocketConnected: boolean;

  // Error handling
  clearError: (errorId: string) => void;
  addError: (error: Omit<UIError, 'id' | 'timestamp'>) => void;
}

const UAIPContext = createContext<UAIPContextType | undefined>(undefined);

// Data transformation utilities
const transformAgentToEnhanced = (agent: any): EnhancedAgentState => ({
  id: agent.id,
  name: agent.name || `Agent ${agent.id}`,
  role: agent.role || 'assistant',
  status: agent.isActive ? 'active' : 'idle',
  currentOperation: agent.currentToolExecution?.id,
  lastActivity: new Date(agent.lastActivity || Date.now()),
  metrics: {
    totalOperations: agent.toolUsageHistory?.length || 0,
    successRate:
      agent.toolUsageHistory?.length > 0
        ? agent.toolUsageHistory.filter((usage: any) => usage.success).length /
          agent.toolUsageHistory.length
        : 0,
    averageResponseTime: 250, // Default value, would come from actual metrics
    uptime: 0.95, // Default value, would come from actual metrics
  },
  configuration: {
    modelId: agent.modelId || 'default',
    apiType: agent.providerId?.includes('ollama') ? 'ollama' : 'llmstudio',
    temperature: 0.7,
    maxTokens: 2000,
    systemPrompt: agent.systemPrompt || 'You are a helpful AI assistant.',
  },
  capabilities: agent.availableTools || [],
  securityLevel: 'medium',
  intelligenceMetrics: {
    decisionAccuracy: 0.85,
    contextUnderstanding: 0.9,
    adaptationRate: 0.75,
    learningProgress: 0.6,
  },
});

const transformOperationToUI = (operation: Operation): UIOperation => ({
  ...operation,
  progress:
    operation.status === OperationStatus.RUNNING
      ? 50
      : operation.status === OperationStatus.COMPLETED
        ? 100
        : 0,
  startTime: operation.createdAt ? new Date(operation.createdAt) : new Date(),
  endTime: operation.completedAt ? new Date(operation.completedAt) : undefined,
});

const transformCapabilityToUI = (capability: Capability): UICapability => ({
  ...capability,
});

const transformApprovalToUI = (approval: ApprovalWorkflow): UIApprovalWorkflow => ({
  ...approval,
});

export function UAIPProvider({ children }: { children: React.ReactNode }) {
  const {
    agents: agentContextAgents,
    agentIntelligence,
    capabilityRegistry,
    orchestrationPipeline,
  } = useAgents();
  const { user } = useAuth();

  // Data states
  const [agents, setAgents] = useState<DataState<EnhancedAgentState[]>>({
    data: [],
    isLoading: false,
    lastUpdated: new Date(),
  });

  const [operations, setOperations] = useState<DataState<UIOperation[]>>({
    data: [],
    isLoading: false,
    lastUpdated: new Date(),
  });

  const [capabilities, setCapabilities] = useState<DataState<UICapability[]>>({
    data: [],
    isLoading: false,
    lastUpdated: new Date(),
  });

  const [approvals, setApprovals] = useState<DataState<UIApprovalWorkflow[]>>({
    data: [],
    isLoading: false,
    lastUpdated: new Date(),
  });

  const [insights, setInsights] = useState<DataState<AIInsight[]>>({
    data: [],
    isLoading: false,
    lastUpdated: new Date(),
  });

  const [events, setEvents] = useState<DataState<UAIPEvent[]>>({
    data: [],
    isLoading: false,
    lastUpdated: new Date(),
  });

  const [systemMetrics, setSystemMetrics] = useState<DataState<SystemMetrics>>({
    data: {
      timestamp: new Date(),
      performance: { cpu: 0, memory: 0, storage: 0, network: 0 },
      operations: { active: 0, queued: 0, completed: 0, failed: 0 },
      agents: { active: 0, idle: 0, busy: 0, offline: 0 },
      security: { pendingApprovals: 0, securityEvents: 0, threatLevel: 'low' },
    },
    isLoading: false,
    lastUpdated: new Date(),
  });

  const [toolIntegrations, setToolIntegrations] = useState<DataState<ToolIntegration[]>>({
    data: [],
    isLoading: false,
    lastUpdated: new Date(),
  });

  // UI state
  const [uiState, setUIStateInternal] = useState<UIState>({
    activePanel: 'intelligence',
    filters: {},
    preferences: {
      theme: 'auto',
      refreshInterval: 30000,
      notificationsEnabled: true,
      compactMode: false,
    },
  });

  const [isWebSocketConnected, setIsWebSocketConnected] = useState(false);

  // Transform agents from context
  useEffect(() => {
    const enhancedAgents = Object.values(agentContextAgents).map(transformAgentToEnhanced);
    setAgents((prev) => ({
      ...prev,
      data: enhancedAgents,
      lastUpdated: new Date(),
    }));

    // Update system metrics based on agent data
    const activeAgents = enhancedAgents.filter((a) => a.status === 'active').length;
    const idleAgents = enhancedAgents.filter((a) => a.status === 'idle').length;
    const busyAgents = enhancedAgents.filter((a) => a.status === 'busy').length;
    const offlineAgents = enhancedAgents.filter((a) => a.status === 'offline').length;

    setSystemMetrics((prev) => ({
      ...prev,
      data: {
        ...prev.data,
        agents: {
          active: activeAgents,
          idle: idleAgents,
          busy: busyAgents,
          offline: offlineAgents,
        },
        timestamp: new Date(),
      },
      lastUpdated: new Date(),
    }));
  }, [agentContextAgents]);

  // Load capabilities from API
  const loadCapabilities = useCallback(async () => {
    if (!user) return;

    setCapabilities((prev) => ({ ...prev, isLoading: true }));
    try {
      const toolsResponse = await uaipAPI.tools.list();
      // Handle different response formats - could be array or object with tools property
      const toolsArray = Array.isArray(toolsResponse)
        ? toolsResponse
        : toolsResponse?.tools || toolsResponse?.data?.tools || [];

      const uiCapabilities = toolsArray.map((tool: any) =>
        transformCapabilityToUI({
          id: tool.id,
          name: tool.name,
          description: tool.description,
          category: tool.category,
          isEnabled: tool.isEnabled,
          securityLevel: tool.securityLevel,
          version: tool.version,
          author: tool.author,
          tags: tool.tags || [],
          dependencies: tool.dependencies || [],
          parameters: tool.parameters,
          returnType: tool.returnType,
          examples: tool.examples || [],
        })
      );

      setCapabilities({
        data: uiCapabilities,
        isLoading: false,
        lastUpdated: new Date(),
      });
    } catch (error) {
      console.error('Failed to load capabilities:', error);
      setCapabilities((prev) => ({
        ...prev,
        isLoading: false,
        error: {
          id: `capability-error-${Date.now()}`,
          type: 'api_error',
          message: error instanceof Error ? error.message : 'Failed to load capabilities',
          timestamp: new Date(),
          resolved: false,
        },
      }));
    }
  }, [user]);

  // Load approvals from API
  const loadApprovals = useCallback(async () => {
    if (!user) return;

    setApprovals((prev) => ({ ...prev, isLoading: true }));
    try {
      const approvalsData = await uaipAPI.approvals.getPending();
      const uiApprovals = approvalsData.map(transformApprovalToUI);

      setApprovals({
        data: uiApprovals,
        isLoading: false,
        lastUpdated: new Date(),
      });

      // Update system metrics
      setSystemMetrics((prev) => ({
        ...prev,
        data: {
          ...prev.data,
          security: {
            ...prev.data.security,
            pendingApprovals: uiApprovals.length,
          },
        },
      }));
    } catch (error) {
      console.error('Failed to load approvals:', error);
      setApprovals((prev) => ({
        ...prev,
        isLoading: false,
        error: {
          id: `approval-error-${Date.now()}`,
          type: 'api_error',
          message: error instanceof Error ? error.message : 'Failed to load approvals',
          timestamp: new Date(),
          resolved: false,
        },
      }));
    }
  }, [user]);

  // Generate insights based on current data
  const generateInsights = useCallback(() => {
    const newInsights: AIInsight[] = [];
    const agentData = agents.data;
    const operationData = operations.data;

    // Agent collaboration insight
    if (agentData.length > 1) {
      const activeAgents = agentData.filter((a) => a.status === 'active');
      if (activeAgents.length > 1) {
        newInsights.push({
          id: 'collab-insight',
          type: 'opportunity',
          title: 'Multi-Agent Collaboration Opportunity',
          description: `${activeAgents.length} agents are active and ready for collaborative tasks`,
          confidence: 0.92,
          impact: 'high',
          category: 'performance',
          recommendations: [
            'Consider initiating multi-agent workflows',
            'Leverage diverse agent capabilities for complex tasks',
          ],
          data: { activeAgents: activeAgents.length },
          timestamp: new Date(),
          status: 'new',
        });
      }
    }

    // Performance optimization insight
    const avgResponseTime =
      agentData.length > 0
        ? agentData.reduce((sum, agent) => sum + agent.metrics.averageResponseTime, 0) /
          agentData.length
        : 0;

    if (avgResponseTime > 1000) {
      newInsights.push({
        id: 'perf-insight',
        type: 'optimization',
        title: 'Performance Optimization Needed',
        description: `Average response time of ${avgResponseTime.toFixed(0)}ms exceeds optimal threshold`,
        confidence: 0.85,
        impact: 'medium',
        category: 'performance',
        recommendations: [
          'Review agent configurations',
          'Consider model optimization',
          'Check system resources',
        ],
        data: { avgResponseTime },
        timestamp: new Date(),
        status: 'new',
      });
    }

    setInsights({
      data: newInsights,
      isLoading: false,
      lastUpdated: new Date(),
    });
  }, [agents.data, operations.data]);

  // WebSocket integration
  useEffect(() => {
    let wsClient: any = null;

    const initWebSocket = async () => {
      if (!user) return;

      try {
        // WebSocket initialization removed - using useWebSocket hook in components instead
        setIsWebSocketConnected(false);
        console.log('WebSocket initialization skipped - using useWebSocket hook in components');
      } catch (error) {
        console.warn('WebSocket not available:', error);
        setIsWebSocketConnected(false);
      }
    };

    initWebSocket();

    return () => {
      if (wsClient) {
        // Cleanup if needed
      }
    };
  }, [user]);

  // Periodic data refresh
  useEffect(() => {
    // Don't refresh if there are ongoing errors to prevent spam
    const hasErrors = capabilities.error || approvals.error;
    if (hasErrors) {
      console.warn('Skipping periodic refresh due to existing errors');
      return;
    }

    // Increase refresh interval if not connected to WebSocket to reduce load
    const refreshInterval = isWebSocketConnected
      ? uiState.preferences.refreshInterval
      : Math.max(uiState.preferences.refreshInterval * 2, 30000); // Min 30s when offline

    const interval = setInterval(() => {
      if (user && !hasErrors) {
        // Only refresh if not currently loading to prevent overlapping requests
        if (!capabilities.isLoading && !approvals.isLoading) {
          loadCapabilities();
          loadApprovals();
          generateInsights();
        }
      }
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [
    user,
    uiState.preferences.refreshInterval,
    isWebSocketConnected,
    capabilities.error,
    capabilities.isLoading,
    approvals.error,
    approvals.isLoading,
    loadCapabilities,
    loadApprovals,
    generateInsights,
  ]);

  // Error recovery removed - no automatic retries to prevent infinite loops

  // Initial data load
  useEffect(() => {
    if (user) {
      loadCapabilities();
      loadApprovals();
      generateInsights();
    }
  }, [user, loadCapabilities, loadApprovals, generateInsights]);

  // Actions
  const refreshData = useCallback(async () => {
    await Promise.all([loadCapabilities(), loadApprovals()]);
    generateInsights();
  }, [loadCapabilities, loadApprovals, generateInsights]);

  const executeOperation = useCallback(
    async (operationDef: any): Promise<string> => {
      const operationId = await orchestrationPipeline.createOperation(operationDef);
      await orchestrationPipeline.executeOperation(operationId);
      return operationId;
    },
    [orchestrationPipeline]
  );

  const approveExecution = useCallback(
    async (executionId: string) => {
      if (!user) throw new Error('User not authenticated');

      try {
        await uaipAPI.approvals.approve(executionId, { approverId: user.id });
        // Only refresh if approval was successful
        await loadApprovals();
      } catch (error) {
        console.error('Failed to approve execution:', error);
        // Add error to UI state for user feedback
        setApprovals((prev) => ({
          ...prev,
          error: {
            id: `approval-action-error-${Date.now()}`,
            type: 'api_error',
            message: `Failed to approve execution: ${error instanceof Error ? error.message : 'Unknown error'}`,
            timestamp: new Date(),
            resolved: false,
          },
        }));
        throw error; // Re-throw for component handling
      }
    },
    [user, loadApprovals]
  );

  const rejectExecution = useCallback(
    async (executionId: string, reason: string) => {
      if (!user) throw new Error('User not authenticated');

      try {
        await uaipAPI.approvals.reject(executionId, { approverId: user.id, reason });
        // Only refresh if rejection was successful
        await loadApprovals();
      } catch (error) {
        console.error('Failed to reject execution:', error);
        // Add error to UI state for user feedback
        setApprovals((prev) => ({
          ...prev,
          error: {
            id: `approval-action-error-${Date.now()}`,
            type: 'api_error',
            message: `Failed to reject execution: ${error instanceof Error ? error.message : 'Unknown error'}`,
            timestamp: new Date(),
            resolved: false,
          },
        }));
        throw error; // Re-throw for component handling
      }
    },
    [user, loadApprovals]
  );

  const setUIState = useCallback((newState: Partial<UIState>) => {
    setUIStateInternal((prev) => ({ ...prev, ...newState }));
  }, []);

  const clearError = useCallback((errorId: string) => {
    // Clear error from all data states
    const clearErrorFromState = (state: any) => ({
      ...state,
      error: state.error?.id === errorId ? undefined : state.error,
    });

    setAgents(clearErrorFromState);
    setOperations(clearErrorFromState);
    setCapabilities(clearErrorFromState);
    setApprovals(clearErrorFromState);
    setInsights(clearErrorFromState);
    setEvents(clearErrorFromState);
    setSystemMetrics(clearErrorFromState);
    setToolIntegrations(clearErrorFromState);
  }, []);

  const addError = useCallback((error: Omit<UIError, 'id' | 'timestamp'>) => {
    const fullError: UIError = {
      ...error,
      id: `error-${Date.now()}`,
      timestamp: new Date(),
    };

    // Add error as an event
    const errorEvent: UAIPEvent = {
      id: `event-${Date.now()}`,
      type: 'error',
      source: 'UAIP System',
      message: error.message,
      timestamp: new Date(),
      correlationId: fullError.id,
    };

    setEvents((prev) => ({
      ...prev,
      data: [errorEvent, ...prev.data.slice(0, 99)],
    }));
  }, []);

  const value: UAIPContextType = {
    // Data states
    agents,
    operations,
    capabilities,
    approvals,
    insights,
    events,
    systemMetrics,
    toolIntegrations,

    // UI state
    uiState,
    setUIState,

    // Actions
    refreshData,
    executeOperation,
    approveExecution,
    rejectExecution,

    // WebSocket status
    isWebSocketConnected,

    // Error handling
    clearError,
    addError,
  };

  return <UAIPContext.Provider value={value}>{children}</UAIPContext.Provider>;
}

export function useUAIP() {
  const context = useContext(UAIPContext);
  if (context === undefined) {
    throw new Error('useUAIP must be used within a UAIPProvider');
  }
  return context;
}
