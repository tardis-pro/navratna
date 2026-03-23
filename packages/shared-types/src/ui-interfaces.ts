import type { Operation } from './operation.js';
import type { Capability } from './capability.js';
import type { ApprovalWorkflow as SharedApprovalWorkflow } from './security.js';

export interface EnhancedAgentState {
  id: string;
  name: string;
  role: 'assistant' | 'analyzer' | 'orchestrator' | 'specialist';
  status: 'active' | 'idle' | 'busy' | 'offline' | 'error';
  currentOperation?: string;
  lastActivity: Date;
  metrics: {
    totalOperations: number;
    successRate: number;
    averageResponseTime: number;
    uptime: number;
  };
  configuration: {
    modelId: string;
    apiType: 'ollama' | 'llmstudio';
    temperature: number;
    maxTokens: number;
    systemPrompt: string;
  };
  capabilities: string[];
  securityLevel: 'low' | 'medium' | 'high' | 'critical';
  intelligenceMetrics: {
    decisionAccuracy: number;
    contextUnderstanding: number;
    adaptationRate: number;
    learningProgress: number;
  };
}

export interface UIOperation extends Operation {
  startTime?: Date;
  endTime?: Date;
  name?: string;
  description?: string;
  actualDuration?: number;
}

export interface UICapability extends Capability {
  lastUsed?: Date;
  usageCount?: number;
  agentId?: string;
  agentName?: string;
  category?: string;
  version?: string;
}

export interface UIApprovalWorkflow extends SharedApprovalWorkflow {
  operationType?: string;
  description?: string;
  riskLevel?: 'low' | 'medium' | 'high' | 'critical';
  requestedBy?: string;
}

export interface AgentCapabilityMetrics {
  id: string;
  agentId: string;
  capabilityId: string;
  performanceMetrics: {
    successRate: number;
    averageExecutionTime: number;
    errorRate: number;
    resourceUtilization: number;
  };
  usageMetrics: {
    totalExecutions: number;
    uniqueContexts: number;
    peakConcurrency: number;
    lastUsed: Date;
  };
  qualityMetrics: {
    accuracy: number;
    reliability: number;
    consistency: number;
    adaptability: number;
  };
  securityMetrics: {
    authorizationSuccess: number;
    validationRate: number;
    complianceScore: number;
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
  };
  timestamp: Date;
}

export interface UISecurityContext {
  userId: string;
  permissions: string[];
  securityLevel: 'basic' | 'standard' | 'elevated' | 'admin';
  restrictions?: string[];
  auditRequired: boolean;
}

export interface UIOperationEvent {
  id: string;
  operationId: string;
  type: 'started' | 'progress' | 'completed' | 'failed' | 'cancelled' | 'paused';
  timestamp: Date;
  message: string;
  data?: Record<string, unknown>;
  severity: 'info' | 'warning' | 'error' | 'critical';
}

export interface UISystemMetrics {
  timestamp: Date;
  performance: {
    cpu: number;
    memory: number;
    storage: number;
    network: number;
  };
  operations: {
    active: number;
    queued: number;
    completed: number;
    failed: number;
  };
  agents: {
    active: number;
    idle: number;
    busy: number;
    offline: number;
  };
  security: {
    pendingApprovals: number;
    securityEvents: number;
    threatLevel: 'low' | 'medium' | 'high' | 'critical';
  };
}

export interface ToolIntegration {
  id: string;
  name: string;
  type: 'mcp' | 'api' | 'webhook' | 'custom';
  status: 'connected' | 'disconnected' | 'error' | 'configuring';
  lastUsed?: Date;
  usageCount: number;
  configuration: Record<string, unknown>;
  healthStatus: {
    isHealthy: boolean;
    lastCheck: Date;
    responseTime?: number;
    errorRate?: number;
  };
}

export interface AIInsight {
  id: string;
  type: 'pattern' | 'optimization' | 'risk' | 'opportunity' | 'anomaly';
  title: string;
  description: string;
  confidence: number;
  impact: 'low' | 'medium' | 'high' | 'critical';
  category: 'performance' | 'security' | 'user_behavior' | 'system_health' | 'business';
  recommendations: string[];
  data: Record<string, unknown>;
  timestamp: Date;
  status: 'new' | 'acknowledged' | 'acted_upon' | 'dismissed';
}

export interface UIConversationContext {
  id: string;
  agentId: string;
  userId: string;
  startedAt: Date;
  lastActivityAt: Date;
  messageCount: number;
  topics: string[];
  sentiment: 'positive' | 'neutral' | 'negative';
  complexity: number;
  operationsTriggered: string[];
  status: 'active' | 'paused' | 'completed' | 'archived';
}

export interface CapabilityUsage {
  capabilityId: string;
  name: string;
  usageCount: number;
  successRate: number;
  averageExecutionTime: number;
  lastUsed: Date;
  popularityTrend: 'increasing' | 'stable' | 'decreasing';
  userSatisfaction: number;
}

export interface UIWebSocketEvent {
  type:
    | 'operation_update'
    | 'agent_status'
    | 'approval_request'
    | 'system_alert'
    | 'insight_generated';
  data: unknown;
  timestamp: Date;
}

export interface UIState {
  activePanel: string;
  selectedAgent?: string;
  selectedOperation?: string;
  filters: {
    agentStatus?: string[];
    operationStatus?: string[];
    timeRange?: {
      start: Date;
      end: Date;
    };
  };
  preferences: {
    theme: 'light' | 'dark' | 'auto';
    refreshInterval: number;
    notificationsEnabled: boolean;
    compactMode: boolean;
  };
}

export interface UIError {
  id: string;
  type: 'api_error' | 'websocket_error' | 'validation_error' | 'permission_error';
  message: string;
  details?: unknown;
  timestamp: Date;
  resolved: boolean;
}

export interface DataState<T> {
  data: T;
  isLoading: boolean;
  error?: UIError;
  lastUpdated?: Date;
  refetch?: () => Promise<void>;
}
