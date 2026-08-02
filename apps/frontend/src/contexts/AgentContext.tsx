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
  FrontendMessage as Message,
  FrontendModelProvider as ModelProvider,
  Agent,
  UserLLMProviderType,
  CreateUserLLMProviderRequest,
  UpdateUserLLMProviderRequest,
} from '@uaip/types';
import { createAgentStateFromShared as createAgentStateFromBackend } from '../types/frontend_extensions';
import {
  ToolCall,
  ToolResult,
  ToolUsageRecord,
  ToolPermissionSet,
  LLMModel,
  AgentRole,
  ProviderConfig as _ProviderConfig,
  ProviderTestResult as _ProviderTestResult,
  HealthStatus as _HealthStatus,
  SystemMetrics as _SystemMetrics,
  SecurityLevel,
  ToolCategory,
  ToolExecutionStatus,
} from '@uaip/types';
import type { ToolExecutionRequest } from '@uaip/contracts/api';
import uaipAPI from '@/utils/uaip_api';
import { llmAPI } from '@/api/llm_api';
import { PERSONA_CATEGORIES } from '@uaip/types';
import { logger } from '@/utils/browser_logger';
import type {
  AgentContextValue,
  AgentAction,
  AgentIntelligenceFlow,
  ArtifactManagementFlow,
  CapabilityRegistryFlow,
  DebounceRefs,
  DefaultToolProperties,
  FlowParams,
  FlowResult,
  FlowStatus,
  ModelSelectionState,
  OrchestrationPipelineFlow,
} from './AgentContext.types';

const AgentContext = createContext<AgentContextValue | undefined>(undefined);

function toFlowResult(value: unknown): FlowResult {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return Object.fromEntries(Object.entries(value));
  }
  return { value };
}

function readString(params: FlowParams | undefined, key: string): string {
  const value = params?.[key];
  return typeof value === 'string' ? value : '';
}

function readFlowParams(params: FlowParams | undefined, key: string): FlowParams {
  const value = params?.[key];
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return Object.fromEntries(Object.entries(value));
  }
  return {};
}

function toUserProviderType(type: string): UserLLMProviderType {
  switch (type) {
    case 'ollama':
      return 'ollama';
    case 'llmstudio':
      return 'llmstudio';
    case 'openai':
      return 'openai';
    case 'anthropic':
      return 'anthropic';
    case 'google':
      return 'google';
    default:
      return 'custom';
  }
}

function toCreateProviderRequest(provider: ModelProvider): CreateUserLLMProviderRequest {
  return {
    name: provider.name,
    description: provider.description,
    type: toUserProviderType(provider.type),
    baseUrl: provider.baseUrl,
    defaultModel: provider.defaultModel,
    priority: provider.priority,
  };
}

function toUpdateProviderRequest(provider: ModelProvider): UpdateUserLLMProviderRequest {
  return {
    name: provider.name,
    description: provider.description,
    baseUrl: provider.baseUrl,
    defaultModel: provider.defaultModel,
    priority: provider.priority,
  };
}

function createToolExecutionRequest(
  agentId: string,
  toolCall: ToolCall
): ToolExecutionRequest {
  return {
    input: toolCall.parameters,
    context: {
      operationId: `agent-${agentId}`,
      stepId: `tool-${toolCall.id}`,
      actor: {
        userId: agentId,
        orgId: 'default-org',
        roles: [AgentRole.ASSISTANT],
      },
      tenant: {
        orgId: 'default-org',
      },
      correlationId: toolCall.id,
    },
  };
}

// Helper function to create default tool properties for new agents
function createDefaultToolProperties(): DefaultToolProperties {
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
        [ToolCategory.COMPUTATION]: ['math-calculator', 'time-utility'],
        [ToolCategory.ANALYSIS]: ['text-analysis'],
        [ToolCategory.API]: [],
        [ToolCategory.FILE_SYSTEM]: [],
        [ToolCategory.DATABASE]: [],
        [ToolCategory.WEB_SEARCH]: [],
        [ToolCategory.CODE_EXECUTION]: [],
        [ToolCategory.COMMUNICATION]: [],
        [ToolCategory.KNOWLEDGE_GRAPH]: [],
        [ToolCategory.DEPLOYMENT]: [],
        [ToolCategory.MONITORING]: [],
        [ToolCategory.GENERATION]: ['uuid-generator'],
        [ToolCategory.SYSTEM]: [],
        [ToolCategory.NETWORK]: [],
        [ToolCategory.DEVELOPMENT]: [],
        [ToolCategory.MCP]: [],
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
      const newState: Record<string, AgentState> = {
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
  const [flowResults, setFlowResults] = useState<Map<string, FlowResult>>(new Map());
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

  // Reload providers AND models after a provider mutation so the UI never shows
  // a stale (previous-provider) model list. Invalidates the backend Redis model
  // cache first so a newly added/updated/removed provider's models are re-fetched.
  const reloadAfterProviderMutation = useCallback(async () => {
    loadingRefs.current.providersLoaded = false;
    loadingRefs.current.modelsLoaded = false;
    try {
      await llmAPI.invalidateCache('all');
    } catch (error) {
      logger.warn('Failed to invalidate LLM cache after provider mutation:', error);
    }
    await Promise.allSettled([loadProviders(), loadModels()]);
  }, [loadProviders, loadModels]);

  // Create a new provider
  const createProvider = useCallback(
    async (providerData: ModelProvider) => {
      try {
        await uaipAPI.llm.createProvider(toCreateProviderRequest(providerData));
        // Refresh both providers and models so the model list follows the change
        await reloadAfterProviderMutation();
        return true;
      } catch (error) {
        logger.error('Failed to create provider:', error);
        throw error;
      }
    },
    [reloadAfterProviderMutation]
  );

  // Update provider configuration
  const updateProvider = useCallback(
    async (providerId: string, config: ModelProvider) => {
      try {
        await uaipAPI.llm.updateProviderConfig(providerId, toUpdateProviderRequest(config));
        // Refresh both providers and models so the model list follows the change
        await reloadAfterProviderMutation();
        return true;
      } catch (error) {
        logger.error('Failed to update provider:', error);
        throw error;
      }
    },
    [reloadAfterProviderMutation]
  );

  // Test provider connectivity
  const testProvider = useCallback(async (providerId: string) => {
    try {
      const result = await uaipAPI.llm.testProvider(providerId);
      return toFlowResult(result);
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
        // Refresh both providers and models so the model list follows the change
        await reloadAfterProviderMutation();
        return true;
      } catch (error) {
        logger.error('Failed to delete provider:', error);
        throw error;
      }
    },
    [reloadAfterProviderMutation]
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
  const executeFlow = useCallback(async (service: string, flow: string, params?: FlowParams) => {
    const flowId = `${service}.${flow}`;

    try {
      setActiveFlows((prev) => [...prev.filter((f) => f !== flowId), flowId]);
      setFlowErrors((prev) => {
        const newMap = new Map(prev);
        newMap.delete(flowId);
        return newMap;
      });

      let result: FlowResult;

      // Route to actual UAIP API calls based on service
      if (service === 'agentIntelligence') {
        result = toFlowResult(await executeAgentIntelligenceFlow(flow, params));
      } else if (service === 'capabilityRegistry') {
        result = toFlowResult(await executeCapabilityRegistryFlow(flow, params));
      } else if (service === 'orchestrationPipeline') {
        result = toFlowResult(await executeOrchestrationPipelineFlow(flow, params));
      } else if (service === 'artifactManagement') {
        result = toFlowResult(await executeArtifactManagementFlow(flow, params));
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
  const executeAgentIntelligenceFlow = async (flow: string, params?: FlowParams) => {
    switch (flow) {
      case 'registerAgent': {
        const agent = await uaipAPI.agents.create({
          name: readString(params, 'name'),
          role: AgentRole.ASSISTANT,
          personaId: readString(params, 'personaId'),
          createdBy: readString(params, 'createdBy') || 'frontend',
        });
        return agent;
      }
      case 'analyzeContext':
        // This would be a specialized endpoint - not yet implemented
        throw new Error(`Agent intelligence flow '${flow}' is not yet implemented`);
      case 'searchPersonas':
        // Use the new simplified search endpoint
        return await uaipAPI.personas.search(readString(params, 'query'), readString(params, 'expertise'));
      case 'managePersona':
        // Create persona using simplified data
        return await uaipAPI.personas.create({
          name: readString(params, 'name'),
          description: readString(params, 'description'),
          traits: {
            role: params?.role,
            expertise: params?.expertise,
            tags: params?.tags,
          },
          preferences: {
            background: params?.background,
            systemPrompt: params?.systemPrompt,
            conversationalStyle: params?.conversationalStyle,
          },
        });
      case 'analyzePersona':
        // Get persona details for analysis
        return await uaipAPI.personas.get(readString(params, 'personaId'));
      case 'getPersonaCategories':
        return PERSONA_CATEGORIES;
      default:
        throw new Error(`Agent intelligence flow '${flow}' is not yet implemented`);
    }
  };

  // Execute Capability Registry flows using UAIP API
  const executeCapabilityRegistryFlow = async (flow: string, params?: FlowParams) => {
    switch (flow) {
      case 'discoverTools':
        return await uaipAPI.tools.list(readFlowParams(params, 'criteria'));
      case 'executeTool':
        return await uaipAPI.tools.execute(readString(params, 'toolId'), {
          input: readFlowParams(params, 'params'),
          context: {
            operationId: 'capability-registry-flow',
            stepId: flow,
            actor: {
              userId: 'frontend',
              orgId: 'default-org',
              roles: [AgentRole.ASSISTANT],
            },
            tenant: {
              orgId: 'default-org',
            },
          },
        });
      case 'registerTool':
        return await uaipAPI.tools.create({
          name: readString(params, 'name'),
          description: readString(params, 'description'),
          version: readString(params, 'version') || '1.0.0',
          category: readString(params, 'category') || 'system',
          parameters: readFlowParams(params, 'parameters'),
          returnType: readFlowParams(params, 'returnType'),
          securityLevel: 'safe',
          requiresApproval: Boolean(params?.requiresApproval),
          author: readString(params, 'author') || 'frontend',
          tags: [],
          dependencies: [],
        });
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
      registerAgent: async (config) => {
        const result = await executeFlow(
          'agentIntelligence',
          'registerAgent',
          Object.fromEntries(Object.entries(config))
        );
        return readString(result, 'id');
      },
      analyzeContext: (context) => executeFlow('agentIntelligence', 'analyzeContext', context),
      makeDecision: (options) => executeFlow('agentIntelligence', 'makeDecision', options),
      generatePlan: (request) => executeFlow('agentIntelligence', 'generatePlan', request),
      discoverCapabilities: () => executeFlow('agentIntelligence', 'discoverCapabilities'),
      recognizeIntent: (input) => executeFlow('agentIntelligence', 'recognizeIntent', { input }),
      generateResponse: async (context) => {
        const result = await executeFlow('agentIntelligence', 'generateResponse', {
          context,
        });
        return readString(result, 'response');
      },
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
      managePersona: async (persona) => {
        const result = await executeFlow(
          'agentIntelligence',
          'managePersona',
          Object.fromEntries(Object.entries(persona))
        );
        return readString(result, 'id');
      },
      searchPersonas: (criteria) => executeFlow('agentIntelligence', 'searchPersonas', criteria),
      analyzePersona: (personaId) =>
        executeFlow('agentIntelligence', 'analyzePersona', { personaId }),
      getPersonaCategories: async () => {
        await executeFlow('agentIntelligence', 'getPersonaCategories');
        return [...PERSONA_CATEGORIES];
      },
      coordinateAgents: (tasks) => executeFlow('agentIntelligence', 'coordinateAgents', tasks),
      switchContext: (newContext) => executeFlow('agentIntelligence', 'switchContext', newContext),
    }),
    [executeFlow]
  );

  // Capability Registry Flows
  const capabilityRegistry: CapabilityRegistryFlow = useMemo(
    () => ({
      registerTool: async (toolDef) => {
        const result = await executeFlow(
          'capabilityRegistry',
          'registerTool',
          Object.fromEntries(Object.entries(toolDef))
        );
        return readString(result, 'id');
      },
      discoverTools: (criteria) =>
        executeFlow('capabilityRegistry', 'discoverTools', { criteria }),
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
      createCustomTool: async (spec) => {
        const result = await executeFlow(
          'capabilityRegistry',
          'createCustomTool',
          Object.fromEntries(Object.entries(spec))
        );
        return readString(result, 'id');
      },
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
      createOperation: async (operationDef) => {
        const result = await executeFlow('orchestrationPipeline', 'createOperation', operationDef);
        return readString(result, 'id');
      },
      executeOperation: (operationId) =>
        executeFlow('orchestrationPipeline', 'executeOperation', { operationId }),
      getOperationStatus: (operationId) =>
        executeFlow('orchestrationPipeline', 'getOperationStatus', { operationId }),
      cancelOperation: async (operationId) => {
        await executeFlow('orchestrationPipeline', 'cancelOperation', { operationId });
      },
      defineWorkflow: async (workflowSpec) => {
        const result = await executeFlow('orchestrationPipeline', 'defineWorkflow', workflowSpec);
        return readString(result, 'id');
      },
      executeStep: (operationId, stepId) =>
        executeFlow('orchestrationPipeline', 'executeStep', { operationId, stepId }),
      manageResources: () => executeFlow('orchestrationPipeline', 'manageResources'),
      getOperationLogs: (operationId) =>
        executeFlow('orchestrationPipeline', 'getOperationLogs', { operationId }),
      executeBatch: async (operations) => {
        const result = await executeFlow('orchestrationPipeline', 'executeBatch', {
          operations,
        });
        return readString(result, 'id');
      },
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
      exportArtifact: async (artifactId, format) => {
        const result = await executeFlow('artifactManagement', 'exportArtifact', {
          artifactId,
          format,
        });
        return readString(result, 'url');
      },
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

        // Execute the tool call using the backend tool execution contract.
        const result = await uaipAPI.tools.execute(
          toolCall.toolId,
          createToolExecutionRequest(agentId, toolCall)
        );

        // Record usage
        const usage: ToolUsageRecord = {
          toolId: toolCall.toolId,
          agentId,
          startTime: new Date(),
          success: result.success,
          endTime: new Date(),
          cost: result.cost,
          errorCode: result.error?.type,
          status: ToolExecutionStatus.COMPLETED,
          id: result.executionId,
          executionId: result.executionId,
        };

        dispatch({ type: 'ADD_TOOL_USAGE', payload: { agentId, usage } });

        // Update agent state
        updateAgentState(agentId, {
          isUsingTool: false,
          currentToolExecution: undefined,
        });

        return {
          callId: toolCall.id,
          executionId: result.executionId,
          success: result.success,
          result: result.data,
          executionTime: result.executionTime,
          cost: result.cost,
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
      const agentList = await uaipAPI.agents.list();

      agentList.forEach((backendAgent) => {
        try {
          const agentState = createAgentStateFromBackend(backendAgent);

          addAgent(agentState);
        } catch (error) {
          logger.error('❌ Failed to create/add agent state:', {
            backendAgent: backendAgent,
            error: error instanceof Error ? error.message : 'Agent conversion failed',
            stack: error instanceof Error ? error.stack : undefined,
          });
        }
      });

      // A successful fetch is terminal even when it returns zero agents: a user
      // whose agents have not been provisioned yet legitimately has none.
      agentsLoadedRef.current = true;
    } catch (error) {
      logger.error('Failed to refresh agents from backend:', error);
    }
  }, [addAgent]);

  // Load agents from backend when authenticated - use ref to prevent infinite loops
  const agentsLoadedRef = useRef(false);

  useEffect(() => {
    const loadAgents = async (isRetry = false) => {
      try {
        // Check if we already loaded agents using ref to prevent infinite loops
        if (agentsLoadedRef.current) {
          return;
        }

        const agentList = await uaipAPI.agents.list();

        if (agentList.length > 0) {
          try {
            const agentStates = agentList
              .map((backendAgent, _index) => {
                return createAgentStateFromBackend(backendAgent);
              })
              .filter(Boolean);

            addAgents(agentStates);
          } catch (error) {
            logger.error(
              '❌ Failed to process agents in bulk:',
              error instanceof Error ? error.message : error
            );
            // Fallback to individual processing if bulk fails

            agentList.forEach((backendAgent) => {
              try {
                const agentState = createAgentStateFromBackend(backendAgent);
                addAgent(agentState);
              } catch (err) {
                logger.error('❌ Failed to create/add agent state:', {
                  backendAgent: backendAgent,
                  error: err instanceof Error ? err.message : 'Agent conversion failed',
                  stack: err instanceof Error ? err.stack : undefined,
                });
              }
            });
          }
        }

        agentsLoadedRef.current = true;
      } catch (error) {
        // The mount effect fires behind setTimeout(100ms), which can still race
        // token hydration. A THROWN request is the real signal of that race —
        // an empty-but-successful response is not — so retry only here.
        if (!isRetry) {
          logger.warn('[AgentContext] Agent load failed; retrying once after 500ms', {
            error: error instanceof Error ? error.message : error,
          });
          await new Promise((resolve) => setTimeout(resolve, 500));
          await loadAgents(true);
          return;
        }
        logger.error('Failed to load agents from backend:', error);
      }
    };

    // Small delay to ensure auth is set up, then load agents
    const timeoutId = setTimeout(() => {
      void loadAgents();
    }, 100);
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
