import React, {
  createContext,
  useContext,
  useReducer,
  useState,
  useCallback,
  useMemo,
  useRef,
  useEffect,
} from 'react';
import type {
  FrontendAgentState as AgentState,
  FrontendAgentContextValue as AgentContextValue,
  FrontendMessage as Message,
  FrontendModelProvider as ModelProvider,
} from '@uaip/types';
import { createAgentStateFromShared as createAgentStateFromBackend } from '../types/frontend_extensions';
import {
  ToolCall,
  ToolResult,
  ToolUsageRecord,
  ToolPermissionSet,
  ToolPreferences,
  ToolBudget,
  LLMModel,
  _ProviderConfig,
  _ProviderTestResult,
  _HealthStatus,
  _SystemMetrics,
  SecurityLevel,
  ToolExecutionStatus,
} from '@uaip/types';
import uaipAPI from '@/utils/uaip_api';
import { llmAPI } from '@/api/llm_api';
import { PERSONA_CATEGORIES } from '@uaip/types';
import { logger } from '@/utils/browser_logger';

// Agent Intelligence Flow - using backend API
interface AgentIntelligenceFlow {
  registerAgent: (config: unknown) => Promise<string>;
  analyzeContext: (context: unknown) => Promise<unknown>;
  makeDecision: (options: unknown) => Promise<unknown>;
  generatePlan: (request: unknown) => Promise<unknown>;
  discoverCapabilities: () => Promise<unknown>;
  recognizeIntent: (input: string) => Promise<unknown>;
  generateResponse: (context: unknown) => Promise<string>;
  retrieveKnowledge: (query: string) => Promise<unknown>;
  adaptBehavior: (metrics: unknown) => Promise<unknown>;
  manageMemory: (context: unknown) => Promise<unknown>;
  assessSkills: (agentId: string) => Promise<unknown>;
  optimizePerformance: (agentId: string) => Promise<unknown>;
  collaborate: (requirements: unknown) => Promise<unknown>;
  reasonChain: (problem: unknown) => Promise<unknown>;
  recognizeEmotion: (text: string) => Promise<unknown>;
  manageGoals: (objectives: unknown) => Promise<unknown>;
  resolveConflict: (conflict: unknown) => Promise<unknown>;
  assessQuality: (response: unknown) => Promise<unknown>;
  managePersona: (persona: unknown) => Promise<string>;
  searchPersonas: (criteria: unknown) => Promise<unknown>;
  analyzePersona: (personaId: string) => Promise<unknown>;
  getPersonaCategories: () => Promise<string[]>;
  coordinateAgents: (tasks: unknown) => Promise<unknown>;
  switchContext: (newContext: unknown) => Promise<unknown>;
}

// Capability Registry Flow
interface CapabilityRegistryFlow {
  registerTool: (toolDef: unknown) => Promise<string>;
  discoverTools: (criteria: unknown) => Promise<unknown>;
  executeTool: (toolId: string, params: unknown) => Promise<unknown>;
  validateCapability: (toolId: string) => Promise<unknown>;
  recommendTools: (context: unknown) => Promise<unknown>;
  getToolDependencies: (toolId: string) => Promise<unknown>;
  getToolPerformance: (toolId: string) => Promise<unknown>;
  getToolCategories: () => Promise<unknown>;
  versionTool: (toolId: string, version: unknown) => Promise<unknown>;
  getUsageAnalytics: () => Promise<unknown>;
  getToolDocumentation: (toolId: string) => Promise<unknown>;
  assessToolSecurity: (toolId: string) => Promise<unknown>;
  integrateTool: (integration: unknown) => Promise<unknown>;
  mapCapabilities: () => Promise<unknown>;
  monitorTool: (toolId: string) => Promise<unknown>;
  getToolMarketplace: () => Promise<unknown>;
  createCustomTool: (spec: unknown) => Promise<string>;
  backupTool: (toolId: string) => Promise<unknown>;
  migrateTool: (toolId: string, target: unknown) => Promise<unknown>;
  auditCapabilities: () => Promise<unknown>;
}

// Orchestration Pipeline Flow
interface OrchestrationPipelineFlow {
  createOperation: (operationDef: unknown) => Promise<string>;
  executeOperation: (operationId: string) => Promise<unknown>;
  getOperationStatus: (operationId: string) => Promise<unknown>;
  cancelOperation: (operationId: string) => Promise<void>;
  defineWorkflow: (workflowSpec: unknown) => Promise<string>;
  executeStep: (operationId: string, stepId: string) => Promise<unknown>;
  manageResources: () => Promise<unknown>;
  getOperationLogs: (operationId: string) => Promise<unknown>;
  executeBatch: (operations: unknown[]) => Promise<string>;
  getOperationTemplates: () => Promise<unknown>;
  monitorPipeline: () => Promise<unknown>;
  recoverOperation: (operationId: string) => Promise<unknown>;
  resolveDependencies: (operationId: string) => Promise<unknown>;
  scheduleOperation: (schedule: unknown) => Promise<unknown>;
  optimizePerformance: () => Promise<unknown>;
}

// Artifact Management Flow
interface ArtifactManagementFlow {
  generateArtifact: (request: unknown) => Promise<unknown>;
  generateCode: (requirements: unknown) => Promise<unknown>;
  generateDocumentation: (codebase: unknown) => Promise<unknown>;
  generateTests: (code: unknown) => Promise<unknown>;
  generatePRD: (requirements: unknown) => Promise<unknown>;
  getArtifactTemplates: () => Promise<unknown>;
  validateArtifact: (artifactId: string) => Promise<unknown>;
  versionArtifact: (artifactId: string) => Promise<unknown>;
  exportArtifact: (artifactId: string, format: string) => Promise<string>;
  assessArtifactQuality: (artifactId: string) => Promise<unknown>;
  searchArtifacts: (query: string) => Promise<unknown>;
  analyzeArtifactDependencies: (artifactId: string) => Promise<unknown>;
  collaborateOnArtifact: (artifactId: string) => Promise<unknown>;
  testArtifactIntegration: (artifactId: string) => Promise<unknown>;
  getArtifactAnalytics: () => Promise<unknown>;
}

// Model Provider State - using shared types
interface ModelSelectionState {
  providers: ModelProvider[];
  models: LLMModel[];
  loadingProviders: boolean;
  loadingModels: boolean;
  providersError: string | null;
  modelsError: string | null;
}

const AgentContext = createContext<AgentContextValue | undefined>(undefined);

// Helper function to create default tool properties for new agents
function createDefaultToolProperties(): {
  availableTools: string[];
  toolPermissions: ToolPermissionSet;
  toolUsageHistory: ToolUsageRecord[];
  toolPreferences: ToolPreferences;
  maxConcurrentTools: number;
  toolBudget?: ToolBudget;
} {
  return {
    availableTools: ['math-calculator', 'text-analysis', 'time-utility', 'uuid-generator'], // Default safe tools
    toolPermissions: {
      allowedTools: ['math-calculator', 'text-analysis', 'time-utility', 'uuid-generator'],
      deniedTools: [],
      maxCostPerHour: 100,
      maxExecutionsPerHour: 50,
      requireApprovalFor: [SecurityLevel.MEDIUM, SecurityLevel.HIGH],
      canApproveTools: false,
    },
    toolUsageHistory: [],
    toolPreferences: {
      preferredTools: {
        computation: ['math-calculator', 'time-utility'],
        analysis: ['text-analysis'],
        api: [],
        'file-system': [],
        database: [],
        'web-search': [],
        'code-execution': [],
        communication: [],
        'knowledge-graph': [],
        deployment: [],
        monitoring: [],
        generation: ['uuid-generator'],
      },
      fallbackTools: {},
      timeoutPreference: 30000, // 30 seconds
      costLimit: 10, // Max cost per operation
    },
    maxConcurrentTools: 3,
    toolBudget: {
      dailyLimit: 200,
      hourlyLimit: 50,
      currentDailySpent: 0,
      currentHourlySpent: 0,
      resetTime: new Date(),
    },
  };
}

type AgentAction =
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

function agentReducer(
  state: Record<string, AgentState>,
  action: AgentAction
): Record<string, AgentState> {
  switch (action.type) {
    case 'ADD_AGENT': {
      // Validate payload
      if (!action.payload || !action.payload.id) {
        logger.error(
          '❌ REDUCER: ADD_AGENT: Invalid payload - missing agent or id',
          action.payload
        );
        return state;
      }

      // Ensure new agents have tool properties
      const toolProperties = createDefaultToolProperties();
      const newState = {
        ...state,
        [action.payload.id]: {
          ...action.payload,
          ...toolProperties,
          conversationHistory: [],
        },
      };

      return newState;
    }
    case 'ADD_AGENTS': {
      const toolProperties = createDefaultToolProperties();
      const newAgents = action.payload.reduce<Record<string, AgentState>>(
        (acc, agent) => {
          if (agent && agent.id) {
            acc[agent.id] = {
              ...agent,
              ...toolProperties,
              conversationHistory: [],
            };
          }
          return acc;
        },
        {}
      );

      const newState = { ...state, ...newAgents };

      return newState;
    }
    case 'REMOVE_AGENT': {
      if (!action.payload) {
        logger.error('REMOVE_AGENT: Invalid payload - missing agent id', action.payload);
        return state;
      }
      const { [action.payload]: _removed, ...rest } = state;
      return rest;
    }
    case 'UPDATE_AGENT': {
      if (!action.payload || !action.payload.id) {
        logger.error('UPDATE_AGENT: Invalid payload - missing id', action.payload);
        return state;
      }
      const existingAgent = state[action.payload.id];
      if (!existingAgent) return state;
      return {
        ...state,
        [action.payload.id]: {
          ...existingAgent,
          ...action.payload.updates,
          conversationHistory:
            action.payload.updates.conversationHistory || existingAgent.conversationHistory,
        },
      };
    }
    case 'ADD_MESSAGE': {
      const agent = state[action.payload.agentId];
      if (!agent) return state;
      return {
        ...state,
        [action.payload.agentId]: {
          ...agent,
          conversationHistory: [...agent.conversationHistory, action.payload.message],
        },
      };
    }
    case 'REMOVE_MESSAGE': {
      const targetAgent = state[action.payload.agentId];
      if (!targetAgent) return state;
      return {
        ...state,
        [action.payload.agentId]: {
          ...targetAgent,
          conversationHistory: targetAgent.conversationHistory.filter(
            (msg) => msg.id !== action.payload.messageId
          ),
        },
      };
    }
    case 'UPDATE_TOOL_PERMISSIONS': {
      const agent = state[action.payload.agentId];
      if (!agent) return state;
      return {
        ...state,
        [action.payload.agentId]: {
          ...agent,
          toolPermissions: {
            ...agent.toolPermissions,
            ...action.payload.permissions,
          },
        },
      };
    }
    case 'ADD_TOOL_USAGE': {
      const agent = state[action.payload.agentId];
      if (!agent) return state;
      return {
        ...state,
        [action.payload.agentId]: {
          ...agent,
          toolUsageHistory: [...agent.toolUsageHistory, action.payload.usage],
        },
      };
    }
    case 'SET_AGENT_MODEL': {
      const agent = state[action.payload.agentId];
      if (!agent) return state;
      return {
        ...state,
        [action.payload.agentId]: {
          ...agent,
          modelId: action.payload.modelId,
          providerId: action.payload.providerId,
        },
      };
    }
    case 'CLEAR_AGENTS': {
      return {};
    }
    default:
      return state;
  }
}

export function AgentProvider({ children }: { children: React.ReactNode }) {
  const [agents, dispatch] = useReducer(agentReducer, {});
  const [activeFlows, setActiveFlows] = useState<string[]>([]);
  const [flowResults, setFlowResults] = useState<Map<string, unknown>>(new Map());
  const [flowErrors, setFlowErrors] = useState<Map<string, string>>(new Map());

  // Model Provider Management State
  const [modelState, setModelState] = useState<ModelSelectionState>({
    providers: [],
    models: [],
    loadingProviders: false,
    loadingModels: false,
    providersError: null,
    modelsError: null,
  });

  // Use refs to track loading operations and prevent concurrent calls
  const loadingRefs = useRef({
    providersLoading: false,
    modelsLoading: false,
    providersLoaded: false,
    modelsLoaded: false,
  });

  // Debounce timer refs
  type DebounceRefs = { providersTimer: NodeJS.Timeout | null; modelsTimer: NodeJS.Timeout | null };
  const debounceRefs = useRef<DebounceRefs>({
    providersTimer: null,
    modelsTimer: null,
  });

  // Cleanup function for timers
  React.useEffect(() => {
    const timers = debounceRefs.current;
    return () => {
      // Clear all timers on unmount
      if (timers.providersTimer) {
        clearTimeout(timers.providersTimer);
      }
      if (timers.modelsTimer) {
        clearTimeout(timers.modelsTimer);
      }
    };
  }, []);

  // Load available providers - Fixed to eliminate infinite loops
  const loadProviders = useCallback(async () => {
    // Prevent concurrent calls using refs instead of state
    if (loadingRefs.current.providersLoading || loadingRefs.current.providersLoaded) {
      return;
    }

    // Clear unknown existing debounce timer
    if (debounceRefs.current.providersTimer) {
      clearTimeout(debounceRefs.current.providersTimer);
    }

    // Debounce the actual loading
    debounceRefs.current.providersTimer = setTimeout(async () => {
      loadingRefs.current.providersLoading = true;
      setModelState((prev) => ({ ...prev, loadingProviders: true, providersError: null }));

      try {
        const providers = await uaipAPI.llm.getProviders();

        setModelState((prev) => ({
          ...prev,
          // @ts-expect-error -- getProviders returns a compatible shape; FrontendModelProvider is a superset
          providers,
          loadingProviders: false,
        }));
        loadingRefs.current.providersLoaded = true;
      } catch (error) {
        logger.error('[AgentContext] Failed to load providers:', error);
        setModelState((prev) => ({
          ...prev,
          loadingProviders: false,
          providersError: error instanceof Error ? error.message : 'Failed to load providers',
        }));
      } finally {
        loadingRefs.current.providersLoading = false;
      }
    }, 100); // 100ms debounce
  }, []); // Empty dependency array to prevent infinite loops

  // Load available models - Fixed to eliminate infinite loops
  const loadModels = useCallback(async () => {
    // Prevent concurrent calls using refs instead of state
    if (loadingRefs.current.modelsLoading || loadingRefs.current.modelsLoaded) {
      return;
    }

    // Clear unknown existing debounce timer
    if (debounceRefs.current.modelsTimer) {
      clearTimeout(debounceRefs.current.modelsTimer);
    }

    // Debounce the actual loading
    debounceRefs.current.modelsTimer = setTimeout(async () => {
      loadingRefs.current.modelsLoading = true;
      setModelState((prev) => ({ ...prev, loadingModels: true, modelsError: null }));

      try {
        const models = await uaipAPI.llm.getModels();

        setModelState((prev) => ({
          ...prev,
          models,
          loadingModels: false,
        }));
        loadingRefs.current.modelsLoaded = true;
      } catch (error) {
        logger.error('[AgentContext] Failed to load models:', error);
        setModelState((prev) => ({
          ...prev,
          loadingModels: false,
          modelsError: error instanceof Error ? error.message : 'Failed to load models',
        }));
      } finally {
        loadingRefs.current.modelsLoading = false;
      }
    }, 100); // 100ms debounce
  }, []); // Empty dependency array to prevent infinite loops

  // Create a new provider
  const createProvider = useCallback(
    async (providerData: ModelProvider) => {
      try {
        await uaipAPI.llm.createProvider(providerData);
        // Reset loading state to allow fresh reload
        loadingRefs.current.providersLoaded = false;
        await loadProviders();
        return true;
      } catch (error) {
        logger.error('Failed to create provider:', error);
        throw error;
      }
    },
    [loadProviders]
  );

  // Update provider configuration
  const updateProvider = useCallback(
    async (providerId: string, config: ModelProvider) => {
      try {
        await uaipAPI.llm.updateProviderConfig(providerId, config);
        // Reset loading state to allow fresh reload
        loadingRefs.current.providersLoaded = false;
        await loadProviders();
        return true;
      } catch (error) {
        logger.error('Failed to update provider:', error);
        throw error;
      }
    },
    [loadProviders]
  );

  // Test provider connectivity
  const testProvider = useCallback(async (providerId: string) => {
    try {
      const result = await uaipAPI.llm.testProvider(providerId);
      return result;
    } catch (error) {
      logger.error('Failed to test provider:', error);
      throw error;
    }
  }, []);

  // Delete provider
  const deleteProvider = useCallback(
    async (providerId: string) => {
      try {
        await uaipAPI.llm.deleteProvider(providerId);
        // Reset loading state to allow fresh reload
        loadingRefs.current.providersLoaded = false;
        await loadProviders();
        return true;
      } catch (error) {
        logger.error('Failed to delete provider:', error);
        throw error;
      }
    },
    [loadProviders]
  );

  // Get models for a specific provider
  const getModelsForProvider = useCallback(
    (providerId: string): LLMModel[] => {
      const provider = modelState.providers.find((p) => p.id === providerId);
      if (!provider) return [];

      return modelState.models.filter(
        (model) => model.provider === provider.name || model.apiType === provider.type
      );
    },
    [modelState.providers, modelState.models]
  );

  // Get recommended models for agent role
  const getRecommendedModels = useCallback(
    (agentRole?: string): LLMModel[] => {
      return modelState.models.filter((model) => {
        if (!model.isAvailable) return false;

        if (agentRole) {
          switch (agentRole) {
            case 'assistant':
              return (
                model.name.toLowerCase().includes('gpt') ||
                model.name.toLowerCase().includes('claude') ||
                model.name.toLowerCase().includes('llama')
              );
            case 'analyzer':
              return (
                model.name.toLowerCase().includes('claude') ||
                model.name.toLowerCase().includes('gpt-4')
              );
            case 'orchestrator':
              return (
                model.name.toLowerCase().includes('gpt-4') ||
                model.name.toLowerCase().includes('claude')
              );
            default:
              return true;
          }
        }

        return true;
      });
    },
    [modelState.models]
  );

  // Refresh method to reset loading states and reload data
  const refreshModelData = useCallback(async () => {
    // Clear all debounce timers
    if (debounceRefs.current.providersTimer) {
      clearTimeout(debounceRefs.current.providersTimer);
      debounceRefs.current.providersTimer = null;
    }
    if (debounceRefs.current.modelsTimer) {
      clearTimeout(debounceRefs.current.modelsTimer);
      debounceRefs.current.modelsTimer = null;
    }

    // Invalidate Redis cache for LLM providers and models
    try {
      await llmAPI.invalidateCache('all');
    } catch (error) {
      logger.warn('Failed to invalidate LLM cache:', error);
      // Continue with refresh even if cache invalidation fails
    }

    // Reset loading states to allow fresh loading
    loadingRefs.current = {
      providersLoading: false,
      modelsLoading: false,
      providersLoaded: false,
      modelsLoaded: false,
    };

    // Clear existing data
    setModelState((prev) => ({
      ...prev,
      providers: [],
      models: [],
      providersError: null,
      modelsError: null,
    }));

    // Load fresh data
    await Promise.allSettled([loadProviders(), loadModels()]);
  }, [loadProviders, loadModels]);

  // Generic flow execution handler
  const executeFlow = useCallback(async (service: string, flow: string, params?: unknown) => {
    const flowId = `${service}.${flow}`;

    try {
      setActiveFlows((prev) => [...prev.filter((f) => f !== flowId), flowId]);
      setFlowErrors((prev) => {
        const newMap = new Map(prev);
        newMap.delete(flowId);
        return newMap;
      });

      let result: unknown;

      // Route to actual UAIP API calls based on service
      if (service === 'agentIntelligence') {
        result = await executeAgentIntelligenceFlow(flow, params);
      } else if (service === 'capabilityRegistry') {
        result = await executeCapabilityRegistryFlow(flow, params);
      } else if (service === 'orchestrationPipeline') {
        result = await executeOrchestrationPipelineFlow(flow, params);
      } else if (service === 'artifactManagement') {
        result = await executeArtifactManagementFlow(flow, params);
      } else {
        // For other services, throw an error indicating they're not implemented
        throw new Error(
          `Service '${service}' is not yet implemented. Available services: agentIntelligence, capabilityRegistry, orchestrationPipeline, artifactManagement`
        );
      }

      setFlowResults((prev) => {
        const newMap = new Map(prev);
        newMap.set(flowId, result);
        return newMap;
      });

      setActiveFlows((prev) => prev.filter((f) => f !== flowId));
      return result;
    } catch (error) {
      setFlowErrors((prev) => {
        const newMap = new Map(prev);
        newMap.set(flowId, error instanceof Error ? error.message : 'Unknown error');
        return newMap;
      });
      setActiveFlows((prev) => prev.filter((f) => f !== flowId));
      throw error;
    }
  }, []);

  // Execute Agent Intelligence flows using UAIP API
  const executeAgentIntelligenceFlow = async (flow: string, params: unknown) => {
    switch (flow) {
      case 'registerAgent':
        return await uaipAPI.agents.create(params);
      case 'analyzeContext':
        // This would be a specialized endpoint - not yet implemented
        throw new Error(`Agent intelligence flow '${flow}' is not yet implemented`);
      case 'searchPersonas':
        // Use the new simplified search endpoint
        return await uaipAPI.personas.search(params.query, params.expertise);
      case 'managePersona':
        // Create persona using simplified data
        return await uaipAPI.personas.create({
          name: params.name,
          role: params.role,
          description: params.description,
          expertise: params.expertise || [],
          tags: params.tags || [],
          background: params.background,
          systemPrompt: params.systemPrompt,
          conversationalStyle: params.conversationalStyle,
        });
      case 'analyzePersona':
        // Get persona details for analysis
        return await uaipAPI.personas.get(params.personaId);
      case 'getPersonaCategories':
        return PERSONA_CATEGORIES;
      default:
        throw new Error(`Agent intelligence flow '${flow}' is not yet implemented`);
    }
  };

  // Execute Capability Registry flows using UAIP API
  const executeCapabilityRegistryFlow = async (flow: string, params: unknown) => {
    switch (flow) {
      case 'discoverTools':
        return await uaipAPI.tools.list(params.criteria);
      case 'executeTool':
        return await uaipAPI.tools.execute(params.toolId, params.params);
      case 'registerTool':
        return await uaipAPI.tools.create(params);
      case 'getToolCategories':
        return await uaipAPI.tools.getCategories();
      default:
        throw new Error(`Capability registry flow '${flow}' is not yet implemented`);
    }
  };

  // Execute Orchestration Pipeline flows
  const executeOrchestrationPipelineFlow = async (flow: string, _params: unknown) => {
    // These would be actual orchestration API calls - not yet implemented
    throw new Error(`Orchestration pipeline flow '${flow}' is not yet implemented`);
  };

  // Execute Artifact Management flows
  const executeArtifactManagementFlow = async (flow: string, _params: unknown) => {
    // These would be actual artifact service API calls - not yet implemented
    throw new Error(`Artifact management flow '${flow}' is not yet implemented`);
  };

  const getFlowStatus = useCallback(
    (flowId: string): 'idle' | 'running' | 'completed' | 'error' => {
      if (activeFlows.includes(flowId)) return 'running';
      if (flowErrors.has(flowId)) return 'error';
      if (flowResults.has(flowId)) return 'completed';
      return 'idle';
    },
    [activeFlows, flowErrors, flowResults]
  );

  const clearFlowResult = useCallback((flowId: string) => {
    setFlowResults((prev) => {
      const newMap = new Map(prev);
      newMap.delete(flowId);
      return newMap;
    });
    setFlowErrors((prev) => {
      const newMap = new Map(prev);
      newMap.delete(flowId);
      return newMap;
    });
  }, []);

  // Agent Intelligence Flows
  const agentIntelligence: AgentIntelligenceFlow = useMemo(
    () => ({
      registerAgent: (config) => executeFlow('agentIntelligence', 'registerAgent', config),
      analyzeContext: (context) => executeFlow('agentIntelligence', 'analyzeContext', context),
      makeDecision: (options) => executeFlow('agentIntelligence', 'makeDecision', options),
      generatePlan: (request) => executeFlow('agentIntelligence', 'generatePlan', request),
      discoverCapabilities: () => executeFlow('agentIntelligence', 'discoverCapabilities'),
      recognizeIntent: (input) => executeFlow('agentIntelligence', 'recognizeIntent', { input }),
      generateResponse: (context) => executeFlow('agentIntelligence', 'generateResponse', context),
      retrieveKnowledge: (query) =>
        executeFlow('agentIntelligence', 'retrieveKnowledge', { query }),
      adaptBehavior: (metrics) => executeFlow('agentIntelligence', 'adaptBehavior', metrics),
      manageMemory: (context) => executeFlow('agentIntelligence', 'manageMemory', context),
      assessSkills: (agentId) => executeFlow('agentIntelligence', 'assessSkills', { agentId }),
      optimizePerformance: (agentId) =>
        executeFlow('agentIntelligence', 'optimizePerformance', { agentId }),
      collaborate: (requirements) => executeFlow('agentIntelligence', 'collaborate', requirements),
      reasonChain: (problem) => executeFlow('agentIntelligence', 'reasonChain', problem),
      recognizeEmotion: (text) => executeFlow('agentIntelligence', 'recognizeEmotion', { text }),
      manageGoals: (objectives) => executeFlow('agentIntelligence', 'manageGoals', objectives),
      resolveConflict: (conflict) => executeFlow('agentIntelligence', 'resolveConflict', conflict),
      assessQuality: (response) => executeFlow('agentIntelligence', 'assessQuality', response),
      managePersona: (persona) => executeFlow('agentIntelligence', 'managePersona', persona),
      searchPersonas: (criteria) => executeFlow('agentIntelligence', 'searchPersonas', criteria),
      analyzePersona: (personaId) =>
        executeFlow('agentIntelligence', 'analyzePersona', { personaId }),
      getPersonaCategories: () => executeFlow('agentIntelligence', 'getPersonaCategories'),
      coordinateAgents: (tasks) => executeFlow('agentIntelligence', 'coordinateAgents', tasks),
      switchContext: (newContext) => executeFlow('agentIntelligence', 'switchContext', newContext),
    }),
    [executeFlow]
  );

  // Capability Registry Flows
  const capabilityRegistry: CapabilityRegistryFlow = useMemo(
    () => ({
      registerTool: (toolDef) => executeFlow('capabilityRegistry', 'registerTool', toolDef),
      discoverTools: (criteria) => executeFlow('capabilityRegistry', 'discoverTools', criteria),
      executeTool: (toolId, params) =>
        executeFlow('capabilityRegistry', 'executeTool', { toolId, params }),
      validateCapability: (toolId) =>
        executeFlow('capabilityRegistry', 'validateCapability', { toolId }),
      recommendTools: (context) => executeFlow('capabilityRegistry', 'recommendTools', context),
      getToolDependencies: (toolId) =>
        executeFlow('capabilityRegistry', 'getToolDependencies', { toolId }),
      getToolPerformance: (toolId) =>
        executeFlow('capabilityRegistry', 'getToolPerformance', { toolId }),
      getToolCategories: () => executeFlow('capabilityRegistry', 'getToolCategories'),
      versionTool: (toolId, version) =>
        executeFlow('capabilityRegistry', 'versionTool', { toolId, version }),
      getUsageAnalytics: () => executeFlow('capabilityRegistry', 'getUsageAnalytics'),
      getToolDocumentation: (toolId) =>
        executeFlow('capabilityRegistry', 'getToolDocumentation', { toolId }),
      assessToolSecurity: (toolId) =>
        executeFlow('capabilityRegistry', 'assessToolSecurity', { toolId }),
      integrateTool: (integration) =>
        executeFlow('capabilityRegistry', 'integrateTool', integration),
      mapCapabilities: () => executeFlow('capabilityRegistry', 'mapCapabilities'),
      monitorTool: (toolId) => executeFlow('capabilityRegistry', 'monitorTool', { toolId }),
      getToolMarketplace: () => executeFlow('capabilityRegistry', 'getToolMarketplace'),
      createCustomTool: (spec) => executeFlow('capabilityRegistry', 'createCustomTool', spec),
      backupTool: (toolId) => executeFlow('capabilityRegistry', 'backupTool', { toolId }),
      migrateTool: (toolId, target) =>
        executeFlow('capabilityRegistry', 'migrateTool', { toolId, target }),
      auditCapabilities: () => executeFlow('capabilityRegistry', 'auditCapabilities'),
    }),
    [executeFlow]
  );

  // Orchestration Pipeline Flows
  const orchestrationPipeline: OrchestrationPipelineFlow = useMemo(
    () => ({
      createOperation: (operationDef) =>
        executeFlow('orchestrationPipeline', 'createOperation', operationDef),
      executeOperation: (operationId) =>
        executeFlow('orchestrationPipeline', 'executeOperation', { operationId }),
      getOperationStatus: (operationId) =>
        executeFlow('orchestrationPipeline', 'getOperationStatus', { operationId }),
      cancelOperation: (operationId) =>
        executeFlow('orchestrationPipeline', 'cancelOperation', { operationId }),
      defineWorkflow: (workflowSpec) =>
        executeFlow('orchestrationPipeline', 'defineWorkflow', workflowSpec),
      executeStep: (operationId, stepId) =>
        executeFlow('orchestrationPipeline', 'executeStep', { operationId, stepId }),
      manageResources: () => executeFlow('orchestrationPipeline', 'manageResources'),
      getOperationLogs: (operationId) =>
        executeFlow('orchestrationPipeline', 'getOperationLogs', { operationId }),
      executeBatch: (operations) =>
        executeFlow('orchestrationPipeline', 'executeBatch', { operations }),
      getOperationTemplates: () => executeFlow('orchestrationPipeline', 'getOperationTemplates'),
      monitorPipeline: () => executeFlow('orchestrationPipeline', 'monitorPipeline'),
      recoverOperation: (operationId) =>
        executeFlow('orchestrationPipeline', 'recoverOperation', { operationId }),
      resolveDependencies: (operationId) =>
        executeFlow('orchestrationPipeline', 'resolveDependencies', { operationId }),
      scheduleOperation: (schedule) =>
        executeFlow('orchestrationPipeline', 'scheduleOperation', schedule),
      optimizePerformance: () => executeFlow('orchestrationPipeline', 'optimizePerformance'),
    }),
    [executeFlow]
  );

  // Artifact Management Flows
  const artifactManagement: ArtifactManagementFlow = useMemo(
    () => ({
      generateArtifact: (request) => executeFlow('artifactManagement', 'generateArtifact', request),
      generateCode: (requirements) =>
        executeFlow('artifactManagement', 'generateCode', requirements),
      generateDocumentation: (codebase) =>
        executeFlow('artifactManagement', 'generateDocumentation', codebase),
      generateTests: (code) => executeFlow('artifactManagement', 'generateTests', code),
      generatePRD: (requirements) => executeFlow('artifactManagement', 'generatePRD', requirements),
      getArtifactTemplates: () => executeFlow('artifactManagement', 'getArtifactTemplates'),
      validateArtifact: (artifactId) =>
        executeFlow('artifactManagement', 'validateArtifact', { artifactId }),
      versionArtifact: (artifactId) =>
        executeFlow('artifactManagement', 'versionArtifact', { artifactId }),
      exportArtifact: (artifactId, format) =>
        executeFlow('artifactManagement', 'exportArtifact', { artifactId, format }),
      assessArtifactQuality: (artifactId) =>
        executeFlow('artifactManagement', 'assessArtifactQuality', { artifactId }),
      searchArtifacts: (query) => executeFlow('artifactManagement', 'searchArtifacts', { query }),
      analyzeArtifactDependencies: (artifactId) =>
        executeFlow('artifactManagement', 'analyzeArtifactDependencies', { artifactId }),
      collaborateOnArtifact: (artifactId) =>
        executeFlow('artifactManagement', 'collaborateOnArtifact', { artifactId }),
      testArtifactIntegration: (artifactId) =>
        executeFlow('artifactManagement', 'testArtifactIntegration', { artifactId }),
      getArtifactAnalytics: () => executeFlow('artifactManagement', 'getArtifactAnalytics'),
    }),
    [executeFlow]
  );

  const addAgent = useCallback((agent: AgentState) => {
    if (!agent) {
      logger.error('❌ addAgent: Cannot add undefined agent');
      return;
    }

    if (!agent.id) {
      logger.error('❌ addAgent: Agent missing required id property', agent);
      return;
    }

    dispatch({ type: 'ADD_AGENT', payload: agent });
  }, []);

  const addAgents = useCallback((agentList: AgentState[]) => {
    if (!agentList || !Array.isArray(agentList)) {
      logger.error('❌ addAgents: Invalid agent list', agentList);
      return;
    }

    const validAgents = agentList.filter((agent) => {
      if (!agent) {
        logger.error('❌ addAgents: Skipping undefined agent');
        return false;
      }
      if (!agent.id) {
        logger.error('❌ addAgents: Skipping agent missing id', agent);
        return false;
      }
      return true;
    });

    if (validAgents.length === 0) {
      return;
    }

    dispatch({ type: 'ADD_AGENTS', payload: validAgents });
  }, []);

  const removeAgent = useCallback((id: string) => {
    dispatch({ type: 'REMOVE_AGENT', payload: id });
  }, []);

  const updateAgentState = useCallback((id: string, updates: Partial<AgentState>) => {
    dispatch({ type: 'UPDATE_AGENT', payload: { id, updates } });
  }, []);

  const addMessage = useCallback((agentId: string, message: Message) => {
    dispatch({ type: 'ADD_MESSAGE', payload: { agentId, message } });
  }, []);

  const removeMessage = useCallback((agentId: string, messageId: string) => {
    dispatch({ type: 'REMOVE_MESSAGE', payload: { agentId, messageId } });
  }, []);

  const getAllMessages = useCallback((): Message[] => {
    const allMessages: Message[] = [];
    Object.values(agents).forEach((agent) => {
      allMessages.push(...agent.conversationHistory);
    });
    // Sort by timestamp to get chronological order
    return allMessages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }, [agents]);

  // Tool-related methods using UAIP API
  const executeToolCall = useCallback(
    async (agentId: string, toolCall: ToolCall): Promise<ToolResult> => {
      const agent = agents[agentId];
      if (!agent) {
        throw new Error(`Agent ${agentId} not found`);
      }

      // Check if agent can use this tool
      if (!agent.toolPermissions.allowedTools.includes(toolCall.toolId)) {
        throw new Error(`Agent ${agentId} is not authorized to use tool ${toolCall.toolId}`);
      }

      // Check if tool is denied
      if (agent.toolPermissions.deniedTools.includes(toolCall.toolId)) {
        throw new Error(`Tool ${toolCall.toolId} is explicitly denied for agent ${agentId}`);
      }

      try {
        // Update agent state to show tool usage
        updateAgentState(agentId, {
          isUsingTool: true,
          currentToolExecution: undefined, // Will be set by execution engine
        });

        // Execute the tool call using UAIP API
        const result = await uaipAPI.tools.execute(toolCall.toolId, {
          ...toolCall.parameters,
          agentId,
        });

        // Record usage
        const usage: ToolUsageRecord = {
          toolId: toolCall.toolId,
          agentId,
          startTime: new Date(),
          success: result.success,
          endTime: new Date(),
          cost: result.cost || 0,
          errorCode: result.error?.type,
          status: ToolExecutionStatus.COMPLETED,
          id: result.executionId || toolCall.id,
          executionId: result.executionId || toolCall.id,
        };

        dispatch({ type: 'ADD_TOOL_USAGE', payload: { agentId, usage } });

        // Update agent state
        updateAgentState(agentId, {
          isUsingTool: false,
          currentToolExecution: undefined,
        });

        return {
          callId: toolCall.id,
          executionId: result.executionId || toolCall.id,
          success: result.success,
          result: result.data,
          executionTime: result.executionTime || 0,
          cost: result.cost || 0,
          error: result.error,
          metadata: result.metadata,
        };
      } catch (error) {
        // Update agent state on error
        updateAgentState(agentId, {
          isUsingTool: false,
          currentToolExecution: undefined,
        });
        throw error;
      }
    },
    [agents, updateAgentState]
  );

  const approveToolExecution = useCallback(
    async (executionId: string, approverId: string): Promise<boolean> => {
      // This would use UAIP approval workflow API
      try {
        await uaipAPI.approvals.approve(executionId, { approverId });
        return true;
      } catch (error) {
        logger.error('Failed to approve tool execution:', error);
        return false;
      }
    },
    []
  );

  const getToolUsageHistory = useCallback(
    (agentId: string): ToolUsageRecord[] => {
      const agent = agents[agentId];
      return agent?.toolUsageHistory || [];
    },
    [agents]
  );

  const updateToolPermissions = useCallback(
    (agentId: string, permissions: Partial<ToolPermissionSet>) => {
      dispatch({ type: 'UPDATE_TOOL_PERMISSIONS', payload: { agentId, permissions } });
    },
    []
  );

  const setAgentModel = useCallback((agentId: string, modelId: string, providerId: string) => {
    dispatch({ type: 'SET_AGENT_MODEL', payload: { agentId, modelId, providerId } });
  }, []);

  // Manual refresh function to reload agents
  const refreshAgents = useCallback(async () => {
    // Clear current agents
    dispatch({ type: 'CLEAR_AGENTS' });

    // Reset the loaded flag
    agentsLoadedRef.current = false;

    // Reload agents
    try {
      const token =
        typeof window !== 'undefined'
          ? localStorage.getItem('accessToken') || sessionStorage.getItem('accessToken')
          : null;

      if (!token) {
        return;
      }

      const response = await uaipAPI.agents.list();

      // Handle response format: {agents: Array(7), total: 7, filters: {...}}
      let agentList = [];
      if (Array.isArray(response.agents)) {
        agentList = response.agents;
      } else if (response.success && response.data && Array.isArray(response.data.agents)) {
        agentList = response.data.agents;
      } else if (Array.isArray(response)) {
        // Fallback for direct array response
        agentList = response;
      } else {
      }

      if (agentList.length > 0) {
        agentList.forEach((backendAgent, _index) => {
          try {
            const agentState = createAgentStateFromBackend(backendAgent);

            addAgent(agentState);
          } catch (error) {
            logger.error('❌ Failed to create/add agent state:', {
              backendAgent: backendAgent,
              error: error.message,
              stack: error.stack,
            });
          }
        });

        // Mark as loaded after successful processing
        agentsLoadedRef.current = true;
      }
    } catch (error) {
      logger.error('Failed to refresh agents from backend:', error);
    }
  }, [addAgent]);

  // Load agents from backend when authenticated - use ref to prevent infinite loops
  const agentsLoadedRef = useRef(false);

  useEffect(() => {
    const loadAgents = async () => {
      try {
        // Check if we have authentication
        const token =
          typeof window !== 'undefined'
            ? localStorage.getItem('accessToken') || sessionStorage.getItem('accessToken')
            : null;

        if (!token) {
          return;
        }

        // Check if we already loaded agents using ref to prevent infinite loops
        if (agentsLoadedRef.current) {
          return;
        }

        const response = await uaipAPI.agents.list();

        // Handle response format: {agents: Array(7), total: 7, filters: {...}}
        let agentList = [];
        if (Array.isArray(response.agents)) {
          agentList = response.agents;
        } else if (response.success && response.data && Array.isArray(response.data.agents)) {
          agentList = response.data.agents;
        } else if (Array.isArray(response)) {
          // Fallback for direct array response
          agentList = response;
        } else {
        }

        if (agentList.length > 0) {
          try {
            const agentStates = agentList
              .map((backendAgent, _index) => {
                return createAgentStateFromBackend(backendAgent);
              })
              .filter(Boolean); // Remove unknown null/undefined results

            addAgents(agentStates);
          } catch (error) {
            logger.error('❌ Failed to process agents in bulk:', error.message);
            // Fallback to individual processing if bulk fails

            agentList.forEach((backendAgent, _index) => {
              try {
                const agentState = createAgentStateFromBackend(backendAgent);
                addAgent(agentState);
              } catch (err) {
                logger.error('❌ Failed to create/add agent state:', {
                  backendAgent: backendAgent,
                  error: err.message,
                  stack: err.stack,
                });
              }
            });
          }

          // Mark as loaded after successful processing
          agentsLoadedRef.current = true;
        }
      } catch (error) {
        logger.error('Failed to load agents from backend:', error);
      }
    };

    // Small delay to ensure auth is set up, then load agents
    const timeoutId = setTimeout(loadAgents, 100);
    return () => clearTimeout(timeoutId);
  }, [addAgent, addAgents]);

  const value: AgentContextValue = useMemo(
    () => ({
      agents,
      addAgent,
      addAgents,
      removeAgent,
      updateAgentState,
      addMessage,
      removeMessage,
      getAllMessages,
      executeToolCall,
      approveToolExecution,
      getToolUsageHistory,
      updateToolPermissions,
      setAgentModel,
      refreshAgents,

      // Model Provider Management
      modelState,
      loadProviders,
      loadModels,
      refreshModelData,
      createProvider,
      updateProvider,
      testProvider,
      deleteProvider,
      getModelsForProvider,
      getRecommendedModels,

      // UAIP Backend Flow Integration
      agentIntelligence,
      capabilityRegistry,
      orchestrationPipeline,
      artifactManagement,

      // UI State Management
      activeFlows,
      flowResults,
      flowErrors,
      executeFlow,
      getFlowStatus,
      clearFlowResult,
    }),
    // oxlint-disable-next-line exhaustive-deps -- context interface intentionally exposes stable API surface
    [
      agents,
      addAgent,
      addAgents,
      removeAgent,
      updateAgentState,
      addMessage,
      removeMessage,
      getAllMessages,
      executeToolCall,
      approveToolExecution,
      getToolUsageHistory,
      updateToolPermissions,
      setAgentModel,
      refreshAgents,
      modelState,
      loadProviders,
      loadModels,
      refreshModelData,
      createProvider,
      updateProvider,
      testProvider,
      deleteProvider,
      getModelsForProvider,
      getRecommendedModels,
      agentIntelligence,
      capabilityRegistry,
      orchestrationPipeline,
      artifactManagement,
      activeFlows,
      flowResults,
      flowErrors,
      executeFlow,
      getFlowStatus,
      clearFlowResult,
    ]
  );

  return <AgentContext.Provider value={value}>{children}</AgentContext.Provider>;
}

export function useAgents() {
  const context = useContext(AgentContext);
  if (context === undefined) {
    throw new Error('useAgents must be used within an AgentProvider');
  }
  return context;
}
