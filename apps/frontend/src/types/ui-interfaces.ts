/**
 * UI-Specific Interfaces
 * These types are purely frontend/UI related and don't belong in shared types
 */

import type {
  Operation,
  OperationStatus,
  OperationPriority,
  Capability,
  ApprovalWorkflow as SharedApprovalWorkflow
} from '@uaip/types';

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

// Frontend-specific operation interface (extends shared Operation with UI properties)
export interface UIOperation extends Operation {
  progress?: number;
  startTime?: Date;
  endTime?: Date;
}

// Frontend-specific capability interface (extends shared Capability with UI properties)
export interface UICapability extends Capability {
  // UI-specific extensions can be added here
}

// Frontend-specific approval workflow interface
export interface UIApprovalWorkflow extends SharedApprovalWorkflow {
  // UI-specific extensions can be added here
}

// Agent capability metrics for UI display
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

// Security context for UI
export interface SecurityContext {
  userId: string;
  permissions: string[];
  securityLevel: 'basic' | 'standard' | 'elevated' | 'admin';
  restrictions?: string[];
  auditRequired: boolean;
}

// Operation events for UI
export interface OperationEvent {
  id: string;
  operationId: string;
  type: 'started' | 'progress' | 'completed' | 'failed' | 'cancelled' | 'paused';
  timestamp: Date;
  message: string;
  data?: Record<string, any>;
  severity: 'info' | 'warning' | 'error' | 'critical';
}

// System metrics for dashboard
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

// Tool integration status for UI
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

// AI insights for dashboard
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

// Conversation context for UI
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

// Capability usage statistics for UI
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

// WebSocket events for real-time UI updates
export interface WebSocketEvent {
  type: 'operation_update' | 'agent_status' | 'approval_request' | 'system_alert' | 'insight_generated';
  data: any;
  timestamp: Date;
}

// UI state management
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

// UI error handling
export interface UIError {
  id: string;
  type: 'api_error' | 'websocket_error' | 'validation_error' | 'permission_error';
  message: string;
  details?: any;
  timestamp: Date;
  resolved: boolean;
}

// Generic data state for UI components
export interface DataState<T> {
  data: T;
  isLoading: boolean;
  error?: UIError;
  lastUpdated?: Date;
  refetch?: () => Promise<void>;
} 