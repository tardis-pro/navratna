import type {
  AgentCreate,
  FrontendAgentContextValue as BaseAgentContextValue,
  FrontendAgentState as AgentState,
  FrontendMessage as Message,
  FrontendModelProvider as ModelProvider,
  LLMModel,
  PersonaCreate,
  ToolBudget,
  ToolPermissionSet,
  ToolPreferences,
  ToolUsageRecord,
} from '@uaip/types';
import type { ToolCreate } from '@uaip/contracts/api';
import type uaipAPI from '@/utils/uaip_api';

export type FlowParams = Record<string, unknown>;
export type FlowResult = Record<string, unknown>;
export type FlowStatus = 'idle' | 'running' | 'completed' | 'error';

export type PersonaSearchFlowParams = {
  query?: string;
  expertise?: string;
};

export type DiscoverToolsFlowParams = {
  criteria?: Parameters<typeof uaipAPI.tools.list>[0];
};

export type AgentContextValue = BaseAgentContextValue & {
  agentIntelligence: AgentIntelligenceFlow;
  capabilityRegistry: CapabilityRegistryFlow;
  orchestrationPipeline: OrchestrationPipelineFlow;
  artifactManagement: ArtifactManagementFlow;
};

export interface AgentIntelligenceFlow {
  registerAgent: (config: AgentCreate) => Promise<string>;
  analyzeContext: (context: FlowParams) => Promise<FlowResult>;
  makeDecision: (options: FlowParams) => Promise<FlowResult>;
  generatePlan: (request: FlowParams) => Promise<FlowResult>;
  discoverCapabilities: () => Promise<FlowResult>;
  recognizeIntent: (input: string) => Promise<FlowResult>;
  generateResponse: (context: unknown) => Promise<string>;
  retrieveKnowledge: (query: string) => Promise<FlowResult>;
  adaptBehavior: (metrics: FlowParams) => Promise<FlowResult>;
  manageMemory: (context: FlowParams) => Promise<FlowResult>;
  assessSkills: (agentId: string) => Promise<FlowResult>;
  optimizePerformance: (agentId: string) => Promise<FlowResult>;
  collaborate: (requirements: FlowParams) => Promise<FlowResult>;
  reasonChain: (problem: FlowParams) => Promise<FlowResult>;
  recognizeEmotion: (text: string) => Promise<FlowResult>;
  manageGoals: (objectives: FlowParams) => Promise<FlowResult>;
  resolveConflict: (conflict: FlowParams) => Promise<FlowResult>;
  assessQuality: (response: FlowParams) => Promise<FlowResult>;
  managePersona: (persona: PersonaCreate) => Promise<string>;
  searchPersonas: (criteria: PersonaSearchFlowParams) => Promise<FlowResult>;
  analyzePersona: (personaId: string) => Promise<unknown>;
  getPersonaCategories: () => Promise<string[]>;
  coordinateAgents: (tasks: FlowParams) => Promise<FlowResult>;
  switchContext: (newContext: FlowParams) => Promise<FlowResult>;
}

export interface CapabilityRegistryFlow {
  registerTool: (toolDef: ToolCreate) => Promise<string>;
  discoverTools: (criteria: DiscoverToolsFlowParams['criteria']) => Promise<FlowResult>;
  executeTool: (toolId: string, params: FlowParams) => Promise<FlowResult>;
  validateCapability: (toolId: string) => Promise<FlowResult>;
  recommendTools: (context: FlowParams) => Promise<FlowResult>;
  getToolDependencies: (toolId: string) => Promise<FlowResult>;
  getToolPerformance: (toolId: string) => Promise<FlowResult>;
  getToolCategories: () => Promise<unknown>;
  versionTool: (toolId: string, version: FlowParams) => Promise<FlowResult>;
  getUsageAnalytics: () => Promise<FlowResult>;
  getToolDocumentation: (toolId: string) => Promise<FlowResult>;
  assessToolSecurity: (toolId: string) => Promise<FlowResult>;
  integrateTool: (integration: FlowParams) => Promise<FlowResult>;
  mapCapabilities: () => Promise<FlowResult>;
  monitorTool: (toolId: string) => Promise<FlowResult>;
  getToolMarketplace: () => Promise<FlowResult>;
  createCustomTool: (spec: ToolCreate) => Promise<string>;
  backupTool: (toolId: string) => Promise<FlowResult>;
  migrateTool: (toolId: string, target: FlowParams) => Promise<FlowResult>;
  auditCapabilities: () => Promise<FlowResult>;
}

export interface OrchestrationPipelineFlow {
  createOperation: (operationDef: FlowParams) => Promise<string>;
  executeOperation: (operationId: string) => Promise<FlowResult>;
  getOperationStatus: (operationId: string) => Promise<FlowResult>;
  cancelOperation: (operationId: string) => Promise<void>;
  defineWorkflow: (workflowSpec: FlowParams) => Promise<string>;
  executeStep: (operationId: string, stepId: string) => Promise<FlowResult>;
  manageResources: () => Promise<FlowResult>;
  getOperationLogs: (operationId: string) => Promise<FlowResult>;
  executeBatch: (operations: FlowParams[]) => Promise<string>;
  getOperationTemplates: () => Promise<FlowResult>;
  monitorPipeline: () => Promise<FlowResult>;
  recoverOperation: (operationId: string) => Promise<FlowResult>;
  resolveDependencies: (operationId: string) => Promise<FlowResult>;
  scheduleOperation: (schedule: FlowParams) => Promise<FlowResult>;
  optimizePerformance: () => Promise<FlowResult>;
}

export interface ArtifactManagementFlow {
  generateArtifact: (request: FlowParams) => Promise<FlowResult>;
  generateCode: (requirements: FlowParams) => Promise<FlowResult>;
  generateDocumentation: (codebase: FlowParams) => Promise<FlowResult>;
  generateTests: (code: FlowParams) => Promise<FlowResult>;
  generatePRD: (requirements: FlowParams) => Promise<FlowResult>;
  getArtifactTemplates: () => Promise<FlowResult>;
  validateArtifact: (artifactId: string) => Promise<FlowResult>;
  versionArtifact: (artifactId: string) => Promise<FlowResult>;
  exportArtifact: (artifactId: string, format: string) => Promise<string>;
  assessArtifactQuality: (artifactId: string) => Promise<FlowResult>;
  searchArtifacts: (query: string) => Promise<FlowResult>;
  analyzeArtifactDependencies: (artifactId: string) => Promise<FlowResult>;
  collaborateOnArtifact: (artifactId: string) => Promise<FlowResult>;
  testArtifactIntegration: (artifactId: string) => Promise<FlowResult>;
  getArtifactAnalytics: () => Promise<FlowResult>;
}

export interface ModelSelectionState {
  providers: ModelProvider[];
  models: LLMModel[];
  loadingProviders: boolean;
  loadingModels: boolean;
  providersError: string | null;
  modelsError: string | null;
}

export type DefaultToolProperties = {
  availableTools: string[];
  toolPermissions: ToolPermissionSet;
  toolUsageHistory: ToolUsageRecord[];
  toolPreferences: ToolPreferences;
  maxConcurrentTools: number;
  toolBudget?: ToolBudget;
};

export type AgentAction =
  | { type: 'ADD_AGENT'; payload: AgentState }
  | { type: 'ADD_AGENTS'; payload: AgentState[] }
  | { type: 'REMOVE_AGENT'; payload: string }
  | { type: 'UPDATE_AGENT'; payload: { id: string; updates: Partial<AgentState> } }
  | { type: 'ADD_MESSAGE'; payload: { agentId: string; message: Message } }
  | { type: 'REMOVE_MESSAGE'; payload: { agentId: string; messageId: string } }
  | {
      type: 'UPDATE_TOOL_PERMISSIONS';
      payload: { agentId: string; permissions: Partial<ToolPermissionSet> };
    }
  | { type: 'ADD_TOOL_USAGE'; payload: { agentId: string; usage: ToolUsageRecord } }
  | { type: 'SET_AGENT_MODEL'; payload: { agentId: string; modelId: string; providerId: string } }
  | { type: 'CLEAR_AGENTS' };

export type DebounceRefs = {
  providersTimer: ReturnType<typeof setTimeout> | null;
  modelsTimer: ReturnType<typeof setTimeout> | null;
};
