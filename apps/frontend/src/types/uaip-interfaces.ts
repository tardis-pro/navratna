/**
 * Frontend Types Extension
 * This file extends backend types with additional frontend-specific functionality
 */

// Import all required types from backend
import type {
  PersonaAnalytics,
  PersonaValidation,
  PersonaUsageStats,
  PersonaTemplate
} from '../../backend/shared/types/src/persona.js';

// Re-export the backend types
export type {
  PersonaAnalytics,
  PersonaValidation,
  PersonaUsageStats,
  PersonaTemplate
};

// Frontend-specific agent capability metrics type
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

// Operation types matching backend schemas
export interface Operation {
  id: string;
  type: 'tool_execution' | 'artifact_generation' | 'hybrid_workflow' | 'approval_workflow' | 'composite_operation';
  status: 'queued' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled' | 'waiting_approval' | 'compensating';
  agentId: string;
  userId: string;
  name: string;
  description: string;
  context: {
    executionContext: {
      agentId: string;
      userId: string;
      conversationId?: string;
      environment: string;
      timeout: number;
      resourceLimits: {
        maxMemory: number;
        maxCpu: number;
        maxDuration: number;
      };
    };
  };
  executionPlan: {
    id: string;
    type: string;
    agentId: string;
    steps: Array<{
      id: string;
      type: string;
      description: string;
      estimatedDuration: number;
      dependencies?: string[];
    }>;
    dependencies: string[];
    estimatedDuration: number;
    metadata: Record<string, any>;
  };
  results?: Record<string, any>;
  metadata: {
    priority: 'low' | 'medium' | 'high' | 'urgent';
    tags: string[];
    estimatedDuration: number;
    resourceRequirements: {
      cpu: number;
      memory: number;
      network: boolean;
      gpu: boolean;
    };
  };
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  estimatedDuration?: number;
  actualDuration?: number;
  progress?: number;
  startTime?: Date;
  endTime?: Date;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  updatedAt: Date;
}

// Capability types matching backend schemas
export interface Capability {
  id: string;
  name: string;
  description: string;
  type: 'tool' | 'artifact' | 'hybrid';
  status: 'active' | 'deprecated' | 'disabled' | 'experimental';
  category: string;
  version: string;
  provider: string;
  metadata: {
    version?: string;
    author?: string;
    tags: string[];
    category: string;
    trustScore: number;
    usageCount: number;
  };
  toolConfig?: {
    endpoint: string;
    method: string;
    parameters: Record<string, any>;
    authentication?: Record<string, any>;
    timeout: number;
    retryPolicy: {
      maxRetries: number;
      backoffStrategy: string;
    };
  };
  artifactConfig?: {
    templateEngine: string;
    template: string;
    outputFormat: string;
    variables: Array<{
      name: string;
      type: string;
      required: boolean;
      description: string;
    }>;
  };
  dependencies?: string[];
  securityRequirements: {
    minimumSecurityLevel: 'low' | 'medium' | 'high' | 'critical';
    requiredPermissions: string[];
    sensitiveData: boolean;
    auditRequired: boolean;
  };
  resourceRequirements?: {
    cpu: number;
    memory: number;
    network: boolean;
    gpu: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
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
  approvedBy?: string;
  approvedAt?: Date;
  processedAt?: Date;
  processedBy?: string;
  reason?: string;
}

export interface PersonaAnalytics {
  id: string;
  personaId: string;
  usageMetrics: {
    totalInteractions: number;
    uniqueUsers: number;
    averageInteractionDuration: number;
    activeSessionsCount: number;
  };
  performanceMetrics: {
    responseAccuracy: number;
    contextRetention: number;
    adaptabilityScore: number;
    consistencyRating: number;
  };
  behaviorMetrics: {
    emotionalIntelligence: number;
    communicationClarity: number;
    domainExpertise: number;
    learningRate: number;
  };
  engagementMetrics: {
    userSatisfaction: number;
    reengagementRate: number;
    problemResolutionRate: number;
    averageResponseTime: number;
  };
  timestamp: Date;
}

export interface PersonaValidation {
  id: string;
  personaId: string;
  status: 'pending' | 'valid' | 'invalid' | 'needs_review';
  validators: Array<{
    validatorId: string;
    validationType: 'behavioral' | 'technical' | 'domain_expertise' | 'ethical';
    result: boolean;
    confidence: number;
    feedback: string;
    timestamp: Date;
  }>;
  overallScore: number;
  validationCriteria: {
    roleAlignment: number;
    knowledgeAccuracy: number;
    behavioralConsistency: number;
    ethicalCompliance: number;
  };
  lastValidated: Date;
  nextValidationDue: Date;
  remediationSteps?: string[];
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

export interface PersonaAnalytics {
  id: string;
  personaId: string;
  usageMetrics: {
    totalInteractions: number;
    uniqueUsers: number;
    averageInteractionDuration: number;
    activeSessionsCount: number;
  };
  performanceMetrics: {
    responseAccuracy: number;
    contextRetention: number;
    adaptabilityScore: number;
    consistencyRating: number;
  };
  behaviorMetrics: {
    emotionalIntelligence: number;
    communicationClarity: number;
    domainExpertise: number;
    learningRate: number;
  };
  engagementMetrics: {
    userSatisfaction: number;
    reengagementRate: number;
    problemResolutionRate: number;
    averageResponseTime: number;
  };
  timestamp: Date;
}

export interface PersonaValidation {
  id: string;
  personaId: string;
  status: 'pending' | 'valid' | 'invalid' | 'needs_review';
  validators: Array<{
    validatorId: string;
    validationType: 'behavioral' | 'technical' | 'domain_expertise' | 'ethical';
    result: boolean;
    confidence: number;
    feedback: string;
    timestamp: Date;
  }>;
  overallScore: number;
  validationCriteria: {
    roleAlignment: number;
    knowledgeAccuracy: number;
    behavioralConsistency: number;
    ethicalCompliance: number;
  };
  lastValidated: Date;
  nextValidationDue: Date;
  remediationSteps?: string[];
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

// Fix UIError type to match backend error types
export interface UIError {
  id: string;
  type: 'api_error' | 'websocket_error' | 'validation_error' | 'permission_error';
  message: string;
  details?: any;
  timestamp: Date;
  resolved: boolean;
}

// Add DataState interface with refetch method
export interface DataState<T> {
  data: T;
  isLoading: boolean;
  error?: UIError;
  lastUpdated?: Date;
  refetch?: () => Promise<void>;
} 