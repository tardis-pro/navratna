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
  personaId?: string; // Frontend persona (rich)
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

// Helper function to convert backend agent response to frontend AgentState
export const createAgentStateFromBackend = (backendAgent: any): AgentState => {
  return {
    // Core identity from backend
    id: backendAgent.id,
    name: backendAgent.name,
    role: backendAgent.role,
    
    // Runtime state (defaults)
    currentResponse: null,
    conversationHistory: [],
    isThinking: false,
    error: null,
    
    // Model configuration from backend persona constraints
    modelId: backendAgent.persona?.constraints?.modelId || 'unknown',
    apiType: (backendAgent.persona?.constraints?.apiType as 'ollama' | 'llmstudio') || 'ollama',
    
    // Persona from backend (simplified mapping)
    personaId: backendAgent.personaId,
    
    
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
    
    // Tool system (defaults)
    availableTools: [],
    toolPermissions: {
      allowedTools: [],
      deniedTools: [],
      requireApprovalFor: [],
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
  personaId: string;
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
  
  // Tool-related methods
  executeToolCall: (agentId: string, toolCall: ToolCall) => Promise<ToolResult>;
  approveToolExecution: (executionId: string, approverId: string) => Promise<boolean>;
  getToolUsageHistory: (agentId: string) => ToolUsageRecord[];
  updateToolPermissions: (agentId: string, permissions: Partial<ToolPermissionSet>) => void;
  
  // UAIP Backend Flow Integration
  agentIntelligence: {
    registerAgent: (config: any) => Promise<string>;
    analyzeContext: (context: any) => Promise<any>;
    makeDecision: (options: any) => Promise<any>;
    generatePlan: (request: any) => Promise<any>;
    discoverCapabilities: () => Promise<any>;
    recognizeIntent: (input: string) => Promise<any>;
    generateResponse: (context: any) => Promise<string>;
    retrieveKnowledge: (query: string) => Promise<any>;
    adaptBehavior: (metrics: any) => Promise<any>;
    manageMemory: (context: any) => Promise<any>;
    assessSkills: (agentId: string) => Promise<any>;
    optimizePerformance: (agentId: string) => Promise<any>;
    collaborate: (requirements: any) => Promise<any>;
    reasonChain: (problem: any) => Promise<any>;
    recognizeEmotion: (text: string) => Promise<any>;
    manageGoals: (objectives: any) => Promise<any>;
    resolveConflict: (conflict: any) => Promise<any>;
    assessQuality: (response: any) => Promise<any>;
    managePersona: (persona: any) => Promise<string>;
    searchPersonas: (criteria: any) => Promise<any>;
    analyzePersona: (personaId: string) => Promise<any>;
    coordinateAgents: (tasks: any) => Promise<any>;
    switchContext: (newContext: any) => Promise<any>;
  };
  
  capabilityRegistry: {
    registerTool: (toolDef: any) => Promise<string>;
    discoverTools: (criteria: any) => Promise<any>;
    executeTool: (toolId: string, params: any) => Promise<any>;
    validateCapability: (toolId: string) => Promise<any>;
    recommendTools: (context: any) => Promise<any>;
    getToolDependencies: (toolId: string) => Promise<any>;
    getToolPerformance: (toolId: string) => Promise<any>;
    getToolCategories: () => Promise<any>;
    versionTool: (toolId: string, version: any) => Promise<any>;
    getUsageAnalytics: () => Promise<any>;
    getToolDocumentation: (toolId: string) => Promise<any>;
    assessToolSecurity: (toolId: string) => Promise<any>;
    integrateTool: (integration: any) => Promise<any>;
    mapCapabilities: () => Promise<any>;
    monitorTool: (toolId: string) => Promise<any>;
    getToolMarketplace: () => Promise<any>;
    createCustomTool: (spec: any) => Promise<string>;
    backupTool: (toolId: string) => Promise<any>;
    migrateTool: (toolId: string, target: any) => Promise<any>;
    auditCapabilities: () => Promise<any>;
  };
  
  orchestrationPipeline: {
    createOperation: (operationDef: any) => Promise<string>;
    executeOperation: (operationId: string) => Promise<any>;
    getOperationStatus: (operationId: string) => Promise<any>;
    cancelOperation: (operationId: string) => Promise<void>;
    defineWorkflow: (workflowSpec: any) => Promise<string>;
    executeStep: (operationId: string, stepId: string) => Promise<any>;
    manageResources: () => Promise<any>;
    getOperationLogs: (operationId: string) => Promise<any>;
    executeBatch: (operations: any[]) => Promise<string>;
    getOperationTemplates: () => Promise<any>;
    monitorPipeline: () => Promise<any>;
    recoverOperation: (operationId: string) => Promise<any>;
    resolveDependencies: (operationId: string) => Promise<any>;
    scheduleOperation: (schedule: any) => Promise<any>;
    optimizePerformance: () => Promise<any>;
  };
  
  artifactManagement: {
    generateArtifact: (request: any) => Promise<any>;
    generateCode: (requirements: any) => Promise<any>;
    generateDocumentation: (codebase: any) => Promise<any>;
    generateTests: (code: any) => Promise<any>;
    generatePRD: (requirements: any) => Promise<any>;
    getArtifactTemplates: () => Promise<any>;
    validateArtifact: (artifactId: string) => Promise<any>;
    versionArtifact: (artifactId: string) => Promise<any>;
    exportArtifact: (artifactId: string, format: string) => Promise<string>;
    assessArtifactQuality: (artifactId: string) => Promise<any>;
    searchArtifacts: (query: string) => Promise<any>;
    analyzeArtifactDependencies: (artifactId: string) => Promise<any>;
    collaborateOnArtifact: (artifactId: string) => Promise<any>;
    testArtifactIntegration: (artifactId: string) => Promise<any>;
    getArtifactAnalytics: () => Promise<any>;
  };
  
  // UI State Management
  activeFlows: string[];
  flowResults: Map<string, any>;
  flowErrors: Map<string, string>;
  executeFlow: (service: string, flow: string, params?: any) => Promise<any>;
  getFlowStatus: (flowId: string) => 'idle' | 'running' | 'completed' | 'error';
  clearFlowResult: (flowId: string) => void;
} 