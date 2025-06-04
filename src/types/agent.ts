import { Persona } from './persona';
import { 
  ToolPermissionSet, 
  ToolUsageRecord, 
  ToolExecution, 
  ToolPreferences, 
  ToolBudget,
  ToolCapableMessage,
  ToolCall,
  ToolResult
} from './tool';

// Backend-compatible enums and types
export type AgentRole = 'assistant' | 'analyzer' | 'orchestrator' | 'specialist';
export type AnalysisDepth = 'basic' | 'intermediate' | 'advanced';
export type CollaborationMode = 'independent' | 'collaborative';
export type SecurityLevel = 'low' | 'medium' | 'high';
export type AuditLevel = 'minimal' | 'standard' | 'comprehensive';

// Backend intelligence configuration
export interface IntelligenceConfig {
  analysisDepth: AnalysisDepth;
  contextWindowSize: number;
  decisionThreshold: number;
  learningEnabled: boolean;
  collaborationMode: CollaborationMode;
}

// Backend security context
export interface SecurityContext {
  securityLevel: SecurityLevel;
  allowedCapabilities: string[];
  approvalRequired: boolean;
  auditLevel: AuditLevel;
}

// Extended persona for backend compatibility
export interface BackendPersona {
  name: string;
  description: string;
  capabilities: string[];
  constraints: {
    modelId: string;
    apiType: string;
  };
  preferences: {
    temperature: number;
    maxTokens: number;
    systemPrompt: string;
  };
}

export interface AgentState {
  // Core Identity
  id: string;
  name: string;
  role: AgentRole; // Updated to use backend-compatible type
  
  // Runtime State (frontend-only, not persisted)
  currentResponse: string | null;
  conversationHistory: Message[];
  isThinking: boolean;
  error: string | null;
  
  // Model Configuration
  modelId: string;
  apiType: 'ollama' | 'llmstudio';
  
  // Persona & Behavior (hybrid - some persisted, some runtime)
  persona?: Persona; // Frontend persona (rich)
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  
  // Backend-compatible properties (NEW - for persistence)
  description?: string; // Maps to backend description
  capabilities?: string[]; // Maps to backend capabilities
  intelligenceConfig?: IntelligenceConfig; // Backend intelligence settings
  securityContext?: SecurityContext; // Backend security settings
  isActive?: boolean; // Backend active status
  createdBy?: string; // Backend creator tracking
  createdAt?: Date; // Backend timestamp
  updatedAt?: Date; // Backend timestamp
  
  // Tool System (frontend-only, not persisted to backend yet)
  availableTools: string[];
  toolPermissions: ToolPermissionSet;
  toolUsageHistory: ToolUsageRecord[];
  currentToolExecution?: ToolExecution;
  toolPreferences: ToolPreferences;
  maxConcurrentTools: number;
  toolBudget?: ToolBudget;
  isUsingTool?: boolean;
}

// Serialization helpers for backend compatibility
export interface SerializableAgentState {
  // Core properties for backend persistence
  name: string;
  description: string;
  role: AgentRole;
  capabilities: string[];
  persona: BackendPersona;
  intelligenceConfig: IntelligenceConfig;
  securityContext: SecurityContext;
  isActive: boolean;
  createdBy: string;
}

// Utility functions for conversion between frontend and backend formats
export const toBackendAgent = (agentState: AgentState): SerializableAgentState => {
  return {
    name: agentState.name,
    description: agentState.description || agentState.persona?.description || agentState.persona?.background || `AI agent: ${agentState.name}`,
    role: agentState.role,
    capabilities: agentState.capabilities || agentState.persona?.expertise || ['general_assistance'],
    persona: {
      name: agentState.persona?.name || agentState.name,
      description: agentState.persona?.description || agentState.persona?.background || `AI agent with ${agentState.persona?.name || 'default'} persona`,
      capabilities: agentState.persona?.expertise || ['general_assistance'],
      constraints: {
        modelId: agentState.modelId,
        apiType: agentState.apiType
      },
      preferences: {
        temperature: agentState.temperature || 0.7,
        maxTokens: agentState.maxTokens || 2048,
        systemPrompt: agentState.systemPrompt || agentState.persona?.systemPrompt || `You are ${agentState.name}.`
      }
    },
    intelligenceConfig: agentState.intelligenceConfig || {
      analysisDepth: 'intermediate',
      contextWindowSize: 4096,
      decisionThreshold: 0.7,
      learningEnabled: true,
      collaborationMode: 'collaborative'
    },
    securityContext: agentState.securityContext || {
      securityLevel: 'medium',
      allowedCapabilities: agentState.capabilities || agentState.persona?.expertise || ['general_assistance'],
      approvalRequired: false,
      auditLevel: 'standard'
    },
    isActive: agentState.isActive !== undefined ? agentState.isActive : true,
    createdBy: agentState.createdBy || 'frontend-user'
  };
};

export const fromBackendAgent = (backendAgent: any, existingState?: Partial<AgentState>): AgentState => {
  return {
    // Core identity from backend
    id: backendAgent.id,
    name: backendAgent.name,
    role: backendAgent.role,
    
    // Runtime state (preserved from existing or defaults)
    currentResponse: existingState?.currentResponse || null,
    conversationHistory: existingState?.conversationHistory || [],
    isThinking: existingState?.isThinking || false,
    error: existingState?.error || null,
    
    // Model configuration from backend
    modelId: backendAgent.persona?.constraints?.modelId || 'unknown',
    apiType: (backendAgent.persona?.constraints?.apiType as 'ollama' | 'llmstudio') || 'ollama',
    
    // Persona reconstruction
    persona: existingState?.persona || {
      id: `persona-${backendAgent.id}`,
      name: backendAgent.persona?.name || backendAgent.name,
      role: backendAgent.role,
      description: backendAgent.persona?.description || backendAgent.description,
      background: backendAgent.persona?.description || backendAgent.description,
      expertise: backendAgent.persona?.capabilities || backendAgent.capabilities || [],
      systemPrompt: backendAgent.persona?.preferences?.systemPrompt || '',
      traits: [],
      createdAt: backendAgent.createdAt ? new Date(backendAgent.createdAt) : new Date(),
      updatedAt: backendAgent.updatedAt ? new Date(backendAgent.updatedAt) : new Date(),
      createdBy: backendAgent.createdBy || 'unknown',
      isPublic: false,
      usageCount: 0,
      version: 1
    },
    
    // Behavior settings from backend
    systemPrompt: backendAgent.persona?.preferences?.systemPrompt,
    temperature: backendAgent.persona?.preferences?.temperature || 0.7,
    maxTokens: backendAgent.persona?.preferences?.maxTokens || 2048,
    
    // Backend properties
    description: backendAgent.description,
    capabilities: backendAgent.capabilities,
    intelligenceConfig: backendAgent.intelligenceConfig,
    securityContext: backendAgent.securityContext,
    isActive: backendAgent.isActive,
    createdBy: backendAgent.createdBy,
    createdAt: backendAgent.createdAt ? new Date(backendAgent.createdAt) : undefined,
    updatedAt: backendAgent.updatedAt ? new Date(backendAgent.updatedAt) : undefined,
    
    // Tool system (preserved from existing or defaults)
    availableTools: existingState?.availableTools || [],
    toolPermissions: existingState?.toolPermissions || {
      allowedTools: [],
      deniedTools: [],
      requireApprovalFor: [],
      canApproveTools: false,
      maxCostPerHour: 100,
      maxExecutionsPerHour: 50
    },
    toolUsageHistory: existingState?.toolUsageHistory || [],
    currentToolExecution: existingState?.currentToolExecution,
    toolPreferences: existingState?.toolPreferences || {
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
    maxConcurrentTools: existingState?.maxConcurrentTools || 1,
    toolBudget: existingState?.toolBudget,
    isUsingTool: existingState?.isUsingTool || false
  };
};

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

export interface AgentProps {
  id: string;
  name: string;
  persona: Persona;
  onResponse: (response: string) => void;
  conversationHistory: Message[];
}

export interface AgentContextValue {
  agents: Record<string, AgentState>;
  addAgent: (agent: AgentState) => void;
  removeAgent: (id: string) => void;
  updateAgentState: (id: string, updates: Partial<AgentState>) => void;
  addMessage: (agentId: string, message: Message) => void;
  removeMessage: (agentId: string, messageId: string) => void;
  getAllMessages: () => Message[];
  
  // Tool-related methods (new)
  executeToolCall: (agentId: string, toolCall: ToolCall) => Promise<ToolResult>;
  approveToolExecution: (executionId: string, approverId: string) => Promise<boolean>;
  getToolUsageHistory: (agentId: string) => ToolUsageRecord[];
  updateToolPermissions: (agentId: string, permissions: Partial<ToolPermissionSet>) => void;
} 