/**
 * Frontend Type Extensions
 * This file extends shared types with frontend-specific properties
 * Import shared types and add UI/runtime state properties
 */

import type {
  Agent,
  AgentRole,
  AgentIntelligenceConfig,
  AgentSecurityContext,
  AgentCreateRequest,
  AgentUpdate,
  Operation,
  OperationStatus,
  OperationPriority,
  OperationType,
  ExecuteOperationRequest,
  OperationStatusResponse,
  Message as SharedMessage,
  MessageRole,
  ConversationContext,
  ContextAnalysis,
  ActionRecommendation,
  AgentAnalysisResult,
  ExecutionPlan,
  ToolCall,
  ToolResult,
  ToolPermissionSet,
  ToolUsageRecord,
  ToolExecution,
  ToolPreferences,
  ToolBudget,
  ToolCapableMessage,
  ToolDefinition,
  ToolCategory,
  ToolExecutionStatus,
  SecurityLevel,
  Capability,
  CapabilityType,
  CapabilityStatus,
  CapabilitySearchRequest,
  CapabilityRecommendation,
  Persona,
  PersonaStatus,
  PersonaVisibility,
  PersonaValidation,
  PersonaAnalytics,
  PersonaTemplate,
  PersonaRecommendation,
  Discussion,
  DiscussionStatus,
  DiscussionParticipant,
  DiscussionMessage,
  DiscussionSettings,
  DiscussionState,
  TurnStrategy,
  TurnStrategyConfig,
  DiscussionAnalytics,
  DiscussionSummary,
  CreateDiscussionRequest,
  UpdateDiscussionRequest,
  Artifact,
  ArtifactType,
  ArtifactGenerationRequest,
  ArtifactGenerationResponse,
  ArtifactGenerationTemplate,
  ArtifactConversationContext,
  Decision,
  ActionItem,
  Requirement
} from '@uaip/types';

import { Persona } from './persona';

// Frontend-specific message extensions
export type ConversationPattern = 'interruption' | 'build-on' | 'clarification' | 'concern' | 'expertise';

export interface Message extends ToolCapableMessage {
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
  conversationPattern?: ConversationPattern;
  triggeredPersonas?: string[];
  sentiment?: {
    score: number;  // -1 to 1, where -1 is very negative, 1 is very positive
    keywords: string[];  // Words that influenced the sentiment
  };
  logicalAnalysis?: {
    fallacies: Array<{
      type: string;
      confidence: number;
      snippet: string;
    }>;
    hasValidArgument: boolean;
  };
}

// Frontend-specific agent state (extends shared Agent with runtime properties)
export interface AgentState extends Omit<Agent, 'apiType'> {
  // Override apiType to include frontend-specific options
  apiType?: 'ollama' | 'llmstudio' | 'openai' | 'anthropic' | 'custom';
  
  // Runtime State (frontend-only, not persisted)
  currentResponse: string | null;
  conversationHistory: Message[];
  isThinking: boolean;
  error: string | null;
  
  // Model Configuration (frontend-specific)
  modelId: string;
  providerId?: string; // ID of the selected model provider
  
  // Frontend persona integration
  persona?: Persona;
  
  // Tool System (frontend runtime state)
  availableTools: string[];
  toolPermissions: ToolPermissionSet;
  toolUsageHistory: ToolUsageRecord[];
  currentToolExecution?: ToolExecution;
  toolPreferences: ToolPreferences;
  maxConcurrentTools: number;
  toolBudget?: ToolBudget;
  isUsingTool?: boolean;
}

// Helper function to convert shared Agent to frontend AgentState
export const createAgentStateFromShared = (sharedAgent: Agent, persona?: Persona): AgentState => {
  return {
    ...sharedAgent,
    // Ensure required properties are set
    role: sharedAgent.role || AgentRole.ASSISTANT,
    
    // Runtime state (defaults)
    currentResponse: null,
    conversationHistory: [],
    isThinking: false,
    error: null,
    
    // Model configuration from shared agent
    modelId: sharedAgent.modelId || 'unknown',
    apiType: (sharedAgent.apiType || 'ollama') as 'ollama' | 'llmstudio' | 'openai' | 'anthropic' | 'custom',
    
    // Frontend persona
    persona,
    
    // Tool system (defaults)
    availableTools: [],
    toolPermissions: {
      allowedTools: [],
      deniedTools: [],
      requireApprovalFor: ['restricted', 'dangerous'],
      canApproveTools: false,
      maxCostPerHour: 100,
      maxExecutionsPerHour: 50
    },
    toolUsageHistory: [],
    toolPreferences: {
      preferredTools: {
        'api': [],
        'computation': [],
        'file-system': [],
        'database': [],
        'web-search': [],
        'code-execution': [],
        'communication': [],
        'knowledge-graph': [],
        'deployment': [],
        'monitoring': [],
        'analysis': [],
        'generation': []
      },
      fallbackTools: {},
      timeoutPreference: 30000,
      costLimit: 10
    },
    maxConcurrentTools: 1,
    isUsingTool: false
  };
};

// Frontend-specific agent context
export interface AgentProps {
  id: string;
  name: string;
  personaId: string;
  onResponse: (response: string) => void;
  conversationHistory: Message[];
}

// Model Provider UI Types
export interface ModelProvider {
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

export interface ModelInfo {
  id: string;
  name: string;
  description?: string;
  source: string;
  apiEndpoint: string;
  apiType: 'ollama' | 'llmstudio' | 'openai' | 'anthropic' | 'custom';
  provider: string;
  isAvailable: boolean;
}

// Frontend-specific context interface
export interface AgentContextValue {
  agents: Record<string, AgentState>;
  addAgent: (agent: AgentState) => void;
  removeAgent: (id: string) => void;
  updateAgentState: (id: string, updates: Partial<AgentState>) => void;
  addMessage: (agentId: string, message: Message) => void;
  removeMessage: (agentId: string, messageId: string) => void;
  getAllMessages: () => Message[];
  
  // Tool-related methods
  executeToolCall: (agentId: string, toolCall: ToolCall) => Promise<ToolResult>;
  approveToolExecution: (executionId: string, approverId: string) => Promise<boolean>;
  getToolUsageHistory: (agentId: string) => ToolUsageRecord[];
  updateToolPermissions: (agentId: string, permissions: Partial<ToolPermissionSet>) => void;
  setAgentModel: (agentId: string, modelId: string, providerId: string) => void;
  
  // Model Provider Management
  modelState: {
    providers: ModelProvider[];
    models: ModelInfo[];
    loadingProviders: boolean;
    loadingModels: boolean;
    providersError: string | null;
    modelsError: string | null;
  };
  loadProviders: () => Promise<void>;
  loadModels: () => Promise<void>;
  refreshModelData: () => Promise<void>;
  
  // Provider management methods
  createProvider: (config: {
    name: string;
    description?: string;
    type: string;
    baseUrl: string;
    apiKey?: string;
    defaultModel?: string;
    configuration?: Record<string, unknown>;
    priority?: number;
  }) => Promise<boolean>;
  updateProvider: (providerId: string, config: {
    name?: string;
    description?: string;
    baseUrl?: string;
    defaultModel?: string;
    priority?: number;
    configuration?: Record<string, unknown>;
  }) => Promise<boolean>;
  testProvider: (providerId: string) => Promise<Record<string, unknown>>;
  deleteProvider: (providerId: string) => Promise<boolean>;
  getModelsForProvider: (providerId: string) => ModelInfo[];
  getRecommendedModels: (agentRole?: string) => ModelInfo[];
  
  // UAIP Backend Flow Integration
  agentIntelligence: {
    registerAgent: (config: AgentCreateRequest) => Promise<string>;
    analyzeContext: (context: ContextAnalysis) => Promise<AgentAnalysisResult>;
    makeDecision: (options: Record<string, unknown>) => Promise<ActionRecommendation>;
    generatePlan: (request: ContextAnalysis) => Promise<ExecutionPlan>;
    discoverCapabilities: () => Promise<Capability[]>;
    recognizeIntent: (input: string) => Promise<{ intent: string; confidence: number; entities: Record<string, unknown>[] }>;
    generateResponse: (context: ConversationContext) => Promise<string>;
    retrieveKnowledge: (query: string) => Promise<Record<string, unknown>>;
    adaptBehavior: (metrics: Record<string, unknown>) => Promise<void>;
    manageMemory: (context: ConversationContext) => Promise<void>;
    assessSkills: (agentId: string) => Promise<Record<string, unknown>>;
    optimizePerformance: (agentId: string) => Promise<Record<string, unknown>>;
    collaborate: (requirements: Record<string, unknown>) => Promise<Record<string, unknown>>;
    reasonChain: (problem: Record<string, unknown>) => Promise<Record<string, unknown>>;
    recognizeEmotion: (text: string) => Promise<{ emotion: string; confidence: number }>;
    manageGoals: (objectives: Record<string, unknown>) => Promise<Record<string, unknown>>;
    resolveConflict: (conflict: Record<string, unknown>) => Promise<Record<string, unknown>>;
    assessQuality: (response: Record<string, unknown>) => Promise<{ score: number; feedback: string }>;
    managePersona: (persona: Persona) => Promise<string>;
    searchPersonas: (criteria: Record<string, unknown>) => Promise<PersonaRecommendation[]>;
    analyzePersona: (personaId: string) => Promise<PersonaAnalytics>;
    coordinateAgents: (tasks: Record<string, unknown>) => Promise<Record<string, unknown>>;
    switchContext: (newContext: ConversationContext) => Promise<void>;
  };
  
  capabilityRegistry: {
    registerTool: (toolDef: ToolDefinition) => Promise<string>;
    discoverTools: (criteria: CapabilitySearchRequest) => Promise<Capability[]>;
    executeTool: (toolId: string, params: Record<string, unknown>) => Promise<ToolResult>;
    validateCapability: (toolId: string) => Promise<{ valid: boolean; errors?: string[] }>;
    recommendTools: (context: Record<string, unknown>) => Promise<CapabilityRecommendation[]>;
    getToolDependencies: (toolId: string) => Promise<string[]>;
    getToolPerformance: (toolId: string) => Promise<Record<string, unknown>>;
    getToolCategories: () => Promise<string[]>;
    versionTool: (toolId: string, version: Record<string, unknown>) => Promise<string>;
    getUsageAnalytics: () => Promise<Record<string, unknown>>;
    getToolDocumentation: (toolId: string) => Promise<string>;
    assessToolSecurity: (toolId: string) => Promise<{ level: SecurityLevel; risks: string[] }>;
    integrateTool: (integration: Record<string, unknown>) => Promise<string>;
    mapCapabilities: () => Promise<Record<string, Capability[]>>;
    monitorTool: (toolId: string) => Promise<Record<string, unknown>>;
    getToolMarketplace: () => Promise<Capability[]>;
    createCustomTool: (spec: Omit<ToolDefinition, 'id'>) => Promise<string>;
    backupTool: (toolId: string) => Promise<string>;
    migrateTool: (toolId: string, target: Record<string, unknown>) => Promise<void>;
    auditCapabilities: () => Promise<Record<string, unknown>>;
  };
  
  orchestrationPipeline: {
    createOperation: (operationDef: ExecuteOperationRequest) => Promise<string>;
    executeOperation: (operationId: string) => Promise<OperationStatusResponse>;
    getOperationStatus: (operationId: string) => Promise<OperationStatusResponse>;
    cancelOperation: (operationId: string) => Promise<void>;
    defineWorkflow: (workflowSpec: Record<string, unknown>) => Promise<string>;
    executeStep: (operationId: string, stepId: string) => Promise<Record<string, unknown>>;
    manageResources: () => Promise<Record<string, unknown>>;
    getOperationLogs: (operationId: string) => Promise<string[]>;
    executeBatch: (operations: ExecuteOperationRequest[]) => Promise<string>;
    getOperationTemplates: () => Promise<Record<string, unknown>[]>;
    monitorPipeline: () => Promise<Record<string, unknown>>;
    recoverOperation: (operationId: string) => Promise<void>;
    resolveDependencies: (operationId: string) => Promise<string[]>;
    scheduleOperation: (schedule: Record<string, unknown>) => Promise<string>;
    optimizePerformance: () => Promise<Record<string, unknown>>;
  };
  
  artifactManagement: {
    generateArtifact: (request: ArtifactGenerationRequest) => Promise<ArtifactGenerationResponse>;
    generateCode: (requirements: Record<string, unknown>) => Promise<Artifact>;
    generateDocumentation: (codebase: Record<string, unknown>) => Promise<Artifact>;
    generateTests: (code: string) => Promise<Artifact>;
    generatePRD: (requirements: Requirement[]) => Promise<Artifact>;
    getArtifactTemplates: () => Promise<ArtifactGenerationTemplate[]>;
    validateArtifact: (artifactId: string) => Promise<{ valid: boolean; errors?: string[] }>;
    versionArtifact: (artifactId: string) => Promise<string>;
    exportArtifact: (artifactId: string, format: string) => Promise<string>;
    assessArtifactQuality: (artifactId: string) => Promise<{ score: number; feedback: string }>;
    searchArtifacts: (query: string) => Promise<Artifact[]>;
    analyzeArtifactDependencies: (artifactId: string) => Promise<string[]>;
    collaborateOnArtifact: (artifactId: string) => Promise<Record<string, unknown>>;
    testArtifactIntegration: (artifactId: string) => Promise<{ success: boolean; results: Record<string, unknown> }>;
    getArtifactAnalytics: () => Promise<Record<string, unknown>>;
  };
  
  // Discussion Management
  discussionManagement: {
    createDiscussion: (request: CreateDiscussionRequest) => Promise<Discussion>;
    updateDiscussion: (discussionId: string, updates: UpdateDiscussionRequest) => Promise<Discussion>;
    getDiscussion: (discussionId: string) => Promise<Discussion>;
    startDiscussion: (discussionId: string) => Promise<void>;
    endDiscussion: (discussionId: string, summary: string) => Promise<DiscussionSummary>;
    addParticipant: (discussionId: string, participant: Omit<DiscussionParticipant, 'id' | 'createdAt' | 'updatedAt'>) => Promise<DiscussionParticipant>;
    removeParticipant: (discussionId: string, participantId: string) => Promise<void>;
    sendMessage: (discussionId: string, message: Omit<DiscussionMessage, 'id' | 'createdAt' | 'updatedAt'>) => Promise<DiscussionMessage>;
    getMessages: (discussionId: string, limit?: number, offset?: number) => Promise<DiscussionMessage[]>;
    advanceTurn: (discussionId: string, force?: boolean) => Promise<void>;
    getAnalytics: (discussionId: string) => Promise<DiscussionAnalytics>;
    updateSettings: (discussionId: string, settings: Partial<DiscussionSettings>) => Promise<DiscussionSettings>;
    getState: (discussionId: string) => Promise<DiscussionState>;
  };
  
  // UI State Management
  activeFlows: string[];
  flowResults: Map<string, Record<string, unknown>>;
  flowErrors: Map<string, string>;
  executeFlow: (service: string, flow: string, params?: Record<string, unknown>) => Promise<Record<string, unknown>>;
  getFlowStatus: (flowId: string) => 'idle' | 'running' | 'completed' | 'error';
  clearFlowResult: (flowId: string) => void;
} 