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
  tags?: string[];
  successRate?: number;
  avgDuration?: number;
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

// ============================================================================
// Frontend document context types
// ============================================================================

export interface FrontendDocumentContext {
  id: string;
  title: string;
  content: string;
  type: 'policy' | 'technical' | 'general';
  metadata: {
    author?: string;
    createdAt: Date;
    lastModified: Date;
    version?: string;
  };
  tags: string[];
}

export interface FrontendDocumentContextState {
  documents: Record<string, FrontendDocumentContext>;
  activeDocumentId: string | null;
  isLoading: boolean;
  error: string | null;
  content?: string;
}

export interface FrontendDocumentContextValue extends FrontendDocumentContextState {
  addDocument: (document: FrontendDocumentContext) => void;
  removeDocument: (id: string) => void;
  setActiveDocument: (id: string) => void;
  updateDocument: (id: string, updates: Partial<FrontendDocumentContext>) => void;
}

// ============================================================================
// Frontend extension types (migrated from frontend/src/types/frontend-extensions.ts)
// ============================================================================
import type { Agent } from './agent.js';
import type { Discussion, MessageType } from './discussion.js';
import type {
  ToolCapableMessage,
  ToolPermissionSet,
  ToolUsageRecord,
  ToolExecution,
  ToolPreferences,
  ToolBudget,
} from './tool.js';
import type { Persona } from './persona.js';

export type FrontendConversationPattern =
  | 'interruption'
  | 'build-on'
  | 'clarification'
  | 'concern'
  | 'expertise';

export interface FrontendMessage extends ToolCapableMessage {
  id: string;
  content: string;
  sender: string;
  timestamp: Date;
  type: 'thought' | 'response' | 'question' | 'system' | 'tool-call' | 'tool-result';
  threadRoot?: string;
  threadDepth?: number;
  replyTo?: string;
  mentions?: string[];
  importance?: number;
  keywords?: string[];
  isAgreement?: boolean;
  isDisagreement?: boolean;
  summary?: string;
  conversationPattern?: FrontendConversationPattern;
  triggeredPersonas?: string[];
  sentiment?: { score: number; keywords: string[] };
  logicalAnalysis?: {
    fallacies: Array<{ type: string; confidence: number; snippet: string }>;
    hasValidArgument: boolean;
  };
}

export interface MessageSearchOptions {
  participantId?: string;
  messageType?: string[];
  dateFrom?: Date;
  dateTo?: Date;
  limit?: number;
  offset?: number;
  order?: 'asc' | 'desc';
}

export interface FrontendDiscussionEvent {
  type: 'turn_started' | 'turn_ended' | 'message_added' | 'participant_joined' | 'participant_left';
  discussionId: string;
  data: unknown;
  timestamp: Date;
}

export interface PersonaSearchResponse {
  personas: import('./persona.js').PersonaDisplay[];
  total: number;
  hasMore: boolean;
}

export interface DiscussionSearchResponse {
  discussions: Discussion[];
  totalCount: number;
  searchTime: number;
}

export interface DiscussionParticipantCreate {
  agentId: string;
  role?: 'participant' | 'moderator' | 'observer' | 'facilitator';
}

export interface DiscussionMessageCreate {
  content: string;
  messageType?: MessageType;
  metadata?: Record<string, unknown>;
}

export interface FrontendAgentState extends Agent {
  currentResponse: string | null;
  conversationHistory: FrontendMessage[];
  isThinking: boolean;
  error: string | null;
  modelId: string;
  providerId?: string;
  persona?: Persona;
  availableTools: string[];
  toolPermissions: ToolPermissionSet;
  toolUsageHistory: ToolUsageRecord[];
  currentToolExecution?: ToolExecution;
  toolPreferences: ToolPreferences;
  maxConcurrentTools: number;
  toolBudget?: ToolBudget;
  isUsingTool?: boolean;
}

export interface FrontendAgentProps {
  id: string;
  name: string;
  personaId: string;
  onResponse: (response: string) => void;
  conversationHistory: FrontendMessage[];
}

export interface FrontendModelProvider {
  id: string;
  name: string;
  description?: string;
  type: string;
  baseUrl: string;
  defaultModel?: string;
  status: string;
  isActive: boolean;
  priority: number;
  totalTokensUsed: number;
  totalRequests: number;
  totalErrors: number;
  lastUsedAt?: string;
  healthCheckResult?: Record<string, unknown>;
  hasApiKey: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FrontendModelInfo {
  id: string;
  name: string;
  description?: string;
  source: string;
  apiEndpoint: string;
  apiType: 'ollama' | 'llmstudio' | 'openai' | 'anthropic' | 'custom';
  provider: string;
  isAvailable: boolean;
}

export interface FrontendAgentContextValue {
  agents: Record<string, FrontendAgentState>;
  addAgent: (agent: FrontendAgentState) => void;
  addAgents: (agents: FrontendAgentState[]) => void;
  removeAgent: (id: string) => void;
  updateAgentState: (id: string, updates: Partial<FrontendAgentState>) => void;
  addMessage: (agentId: string, message: FrontendMessage) => void;
  removeMessage: (agentId: string, messageId: string) => void;
  getAllMessages: () => FrontendMessage[];
  executeToolCall: (
    agentId: string,
    toolCall: import('./tool.js').ToolCall
  ) => Promise<import('./tool.js').ToolResult>;
  approveToolExecution: (executionId: string, approverId: string) => Promise<boolean>;
  getToolUsageHistory: (agentId: string) => import('./tool.js').ToolUsageRecord[];
  updateToolPermissions: (
    agentId: string,
    permissions: Partial<import('./tool.js').ToolPermissionSet>
  ) => void;
  setAgentModel: (agentId: string, modelId: string, providerId: string) => void;
  refreshAgents: () => Promise<void>;
  modelState: {
    providers: FrontendModelProvider[];
    models: import('./llm.js').LLMModel[];
    loadingProviders: boolean;
    loadingModels: boolean;
    providersError: string | null;
    modelsError: string | null;
  };
  loadProviders: () => Promise<void>;
  loadModels: () => Promise<void>;
  refreshModelData: () => Promise<void>;
  createProvider: (config: FrontendModelProvider) => Promise<boolean>;
  updateProvider: (providerId: string, config: FrontendModelProvider) => Promise<boolean>;
  testProvider: (providerId: string) => Promise<Record<string, unknown>>;
  deleteProvider: (providerId: string) => Promise<boolean>;
  getModelsForProvider: (providerId: string) => import('./llm.js').LLMModel[];
  getRecommendedModels: (agentRole?: string) => import('./llm.js').LLMModel[];
  activeFlows: string[];
  flowResults: Map<string, Record<string, unknown>>;
  flowErrors: Map<string, string>;
  executeFlow: (
    service: string,
    flow: string,
    params?: Record<string, unknown>
  ) => Promise<Record<string, unknown>>;
  getFlowStatus: (flowId: string) => 'idle' | 'running' | 'completed' | 'error';
  clearFlowResult: (flowId: string) => void;
}

export interface UIOperationExtensions {
  displayName?: string;
  icon?: string;
  color?: string;
  category?: string;
  tags?: string[];
  priority?: 'low' | 'normal' | 'high' | 'critical';
}
