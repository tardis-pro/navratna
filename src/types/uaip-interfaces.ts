// UAIP Frontend Interface Definitions
// This file contains all TypeScript interfaces used by UAIP frontend components

// Re-export backend API types for frontend use
export type {
  Agent,
  AgentCreate,
  AgentUpdate,
  AgentAnalysisRequest,
  AgentAnalysisResponse,
  AgentPlanRequest,
  AgentPlanResponse,
  Capability,
  CapabilitySearchRequest,
  CapabilitySearchResponse,
  CapabilityRecommendation,
  Operation,
  OperationStatusResponse,
  ExecuteOperationRequest,
  APIResponse,
  HealthStatus
} from '../../backend/api';

// Enhanced frontend-specific interfaces
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
  capabilities: string[];
  securityLevel: 'low' | 'medium' | 'high' | 'critical';
  intelligenceMetrics: {
    decisionAccuracy: number;
    contextUnderstanding: number;
    adaptationRate: number;
    learningProgress: number;
  };
}

export interface ApprovalWorkflow {
  id: string;
  operationId: string;
  requestedBy: string;
  requestedAt: Date;
  type: 'tool_execution' | 'artifact_generation' | 'system_access' | 'data_modification';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  description: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  requiredApprovers: string[];
  approvals: Array<{
    approverId: string;
    decision: 'approved' | 'rejected';
    reason?: string;
    timestamp: Date;
  }>;
  context: {
    agentId: string;
    conversationId?: string;
    resourcesAccessed: string[];
    estimatedImpact: string;
    securityImplications: string[];
  };
  expiresAt: Date;
}

export interface SecurityContext {
  userId: string;
  permissions: string[];
  securityLevel: 'basic' | 'standard' | 'elevated' | 'admin';
  restrictions?: string[];
  auditRequired: boolean;
}

export interface OperationEvent {
  id: string;
  operationId: string;
  type: 'started' | 'progress' | 'completed' | 'failed' | 'cancelled' | 'paused';
  timestamp: Date;
  message: string;
  data?: Record<string, any>;
  severity: 'info' | 'warning' | 'error' | 'critical';
}

export interface SystemMetrics {
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
  configuration: Record<string, any>;
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
  data: Record<string, any>;
  timestamp: Date;
  status: 'new' | 'acknowledged' | 'acted_upon' | 'dismissed';
}

export interface ConversationContext {
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

// WebSocket event types for real-time updates
export interface WebSocketEvent {
  type: 'operation_update' | 'agent_status' | 'approval_request' | 'system_alert' | 'insight_generated';
  data: any;
  timestamp: Date;
}

// UI State interfaces
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

// Error handling interfaces
export interface UIError {
  id: string;
  type: 'api_error' | 'websocket_error' | 'validation_error' | 'permission_error';
  message: string;
  details?: Record<string, any>;
  timestamp: Date;
  resolved: boolean;
}

// Data loading states
export interface LoadingState {
  isLoading: boolean;
  error?: UIError;
  lastUpdated?: Date;
}

export interface DataState<T> extends LoadingState {
  data: T;
} 