import React, { createContext, useContext, useReducer, useState, useCallback, useRef } from 'react';
import { AgentState, AgentContextValue, Message, ModelProvider } from '../types/agent';
import { 
  ToolCall, 
  ToolResult, 
  ToolUsageRecord, 
  ToolPermissionSet,
  ToolPreferences,
  ToolBudget,
  LLMModel,
  ProviderConfig,
  ProviderTestResult,
  HealthStatus,
  SystemMetrics,
  SecurityLevel,
  ToolExecutionStatus
} from '@uaip/types';
import uaipAPI from '@/utils/uaip-api';

// Agent Intelligence Flow - using backend API
interface AgentIntelligenceFlow {
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
  getPersonaCategories: () => Promise<string[]>;
  coordinateAgents: (tasks: any) => Promise<any>;
  switchContext: (newContext: any) => Promise<any>;
}

// Capability Registry Flow
interface CapabilityRegistryFlow {
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
}

// Orchestration Pipeline Flow
interface OrchestrationPipelineFlow {
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
}

// Artifact Management Flow
interface ArtifactManagementFlow {
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
    availableTools: [
      'math-calculator',
      'text-analysis',
      'time-utility',
      'uuid-generator'
    ], // Default safe tools
    toolPermissions: {
      allowedTools: [
        'math-calculator',
        'text-analysis',
        'time-utility',
        'uuid-generator'
      ],
      deniedTools: [],
      maxCostPerHour: 100,
      maxExecutionsPerHour: 50,
      requireApprovalFor: [SecurityLevel.MEDIUM, SecurityLevel.HIGH],
      canApproveTools: false
    },
    toolUsageHistory: [],
    toolPreferences: {
      preferredTools: {
        'computation': ['math-calculator', 'time-utility'],
        'analysis': ['text-analysis'],
        'api': [],
        'file-system': [],
        'database': [],
        'web-search': [],
        'code-execution': [],
        'communication': [],
        'knowledge-graph': [],
        'deployment': [],
        'monitoring': [],
        'generation': ['uuid-generator']
      },
      fallbackTools: {},
      timeoutPreference: 30000, // 30 seconds
      costLimit: 10 // Max cost per operation
    },
    maxConcurrentTools: 3,
    toolBudget: {
      dailyLimit: 200,
      hourlyLimit: 50,
      currentDailySpent: 0,
      currentHourlySpent: 0,
      resetTime: new Date()
    }
  };
}

type AgentAction = 
  | { type: 'ADD_AGENT'; payload: AgentState }
  | { type: 'REMOVE_AGENT'; payload: string }
  | { type: 'UPDATE_AGENT'; payload: { id: string; updates: Partial<AgentState> } }
  | { type: 'ADD_MESSAGE'; payload: { agentId: string; message: Message } }
  | { type: 'REMOVE_MESSAGE'; payload: { agentId: string; messageId: string } }
  | { type: 'UPDATE_TOOL_PERMISSIONS'; payload: { agentId: string; permissions: Partial<ToolPermissionSet> } }
  | { type: 'ADD_TOOL_USAGE'; payload: { agentId: string; usage: ToolUsageRecord } }
  | { type: 'SET_AGENT_MODEL'; payload: { agentId: string; modelId: string; providerId: string } };

function agentReducer(state: Record<string, AgentState>, action: AgentAction): Record<string, AgentState> {
  switch (action.type) {
    case 'ADD_AGENT': {
      // Validate payload
      if (!action.payload || !action.payload.id) {
        console.error('ADD_AGENT: Invalid payload - missing agent or id', action.payload);
        return state;
      }
      
      // Ensure new agents have tool properties
      const toolProperties = createDefaultToolProperties();
      return {
        ...state,
        [action.payload.id]: {
          ...action.payload,
          ...toolProperties,
          conversationHistory: []
        }
      };
    }
    case 'REMOVE_AGENT': {
      if (!action.payload) {
        console.error('REMOVE_AGENT: Invalid payload - missing agent id', action.payload);
        return state;
      }
      const { [action.payload]: removed, ...rest } = state;
      return rest;
    }
    case 'UPDATE_AGENT': {
      if (!action.payload || !action.payload.id) {
        console.error('UPDATE_AGENT: Invalid payload - missing id', action.payload);
        return state;
      }
      const existingAgent = state[action.payload.id];
      if (!existingAgent) return state;
      return {
        ...state,
        [action.payload.id]: {
          ...existingAgent,
          ...action.payload.updates,
          conversationHistory: action.payload.updates.conversationHistory || existingAgent.conversationHistory
        }
      };
    }
    case 'ADD_MESSAGE': {
      const agent = state[action.payload.agentId];
      if (!agent) return state;
      return {
        ...state,
        [action.payload.agentId]: {
          ...agent,
          conversationHistory: [...agent.conversationHistory, action.payload.message]
        }
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
            msg => msg.id !== action.payload.messageId
          )
        }
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
            ...action.payload.permissions
          }
        }
      };
    }
    case 'ADD_TOOL_USAGE': {
      const agent = state[action.payload.agentId];
      if (!agent) return state;
      return {
        ...state,
        [action.payload.agentId]: {
          ...agent,
          toolUsageHistory: [...agent.toolUsageHistory, action.payload.usage]
        }
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
          providerId: action.payload.providerId
        }
      };
    }
    default:
      return state;
  }
}

export function AgentProvider({ children }: { children: React.ReactNode }) {
  const [agents, dispatch] = useReducer(agentReducer, {});
  const [activeFlows, setActiveFlows] = useState<string[]>([]);
  const [flowResults, setFlowResults] = useState<Map<string, any>>(new Map());
  const [flowErrors, setFlowErrors] = useState<Map<string, string>>(new Map());

  // Model Provider Management State
  const [modelState, setModelState] = useState<ModelSelectionState>({
    providers: [],
    models: [],
    loadingProviders: false,
    loadingModels: false,
    providersError: null,
    modelsError: null
  });

  // Use refs to track loading operations and prevent concurrent calls
  const loadingRefs = useRef({
    providersLoading: false,
    modelsLoading: false,
    providersLoaded: false,
    modelsLoaded: false
  });

  // Debounce timer refs
  const debounceRefs = useRef({
    providersTimer: null as NodeJS.Timeout | null,
    modelsTimer: null as NodeJS.Timeout | null
  });

  // Cleanup function for timers
  React.useEffect(() => {
    return () => {
      // Clear all timers on unmount
      if (debounceRefs.current.providersTimer) {
        clearTimeout(debounceRefs.current.providersTimer);
      }
      if (debounceRefs.current.modelsTimer) {
        clearTimeout(debounceRefs.current.modelsTimer);
      }
    };
  }, []);

  // Load available providers - Fixed to eliminate infinite loops
  const loadProviders = useCallback(async () => {
    // Prevent concurrent calls using refs instead of state
    if (loadingRefs.current.providersLoading || loadingRefs.current.providersLoaded) {
      console.log('[AgentContext] Skipping loadProviders - already loading or loaded');
      return;
    }

    // Clear any existing debounce timer
    if (debounceRefs.current.providersTimer) {
      clearTimeout(debounceRefs.current.providersTimer);
    }

    // Debounce the actual loading
    debounceRefs.current.providersTimer = setTimeout(async () => {
      console.log('[AgentContext] Starting loadProviders...');
      loadingRefs.current.providersLoading = true;
      setModelState(prev => ({ ...prev, loadingProviders: true, providersError: null }));
      
      try {
        const providers = await uaipAPI.llm.getProviders();
        console.log('[AgentContext] Providers loaded successfully:', providers.length);
        setModelState(prev => ({ 
          ...prev, 
          providers: providers as ModelProvider[], 
          loadingProviders: false 
        }));
        loadingRefs.current.providersLoaded = true;
      } catch (error) {
        console.error('[AgentContext] Failed to load providers:', error);
        setModelState(prev => ({ 
          ...prev, 
          loadingProviders: false, 
          providersError: error instanceof Error ? error.message : 'Failed to load providers'
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
      console.log('[AgentContext] Skipping loadModels - already loading or loaded');
      return;
    }

    // Clear any existing debounce timer
    if (debounceRefs.current.modelsTimer) {
      clearTimeout(debounceRefs.current.modelsTimer);
    }

    // Debounce the actual loading
    debounceRefs.current.modelsTimer = setTimeout(async () => {
      console.log('[AgentContext] Starting loadModels...');
      loadingRefs.current.modelsLoading = true;
      setModelState(prev => ({ ...prev, loadingModels: true, modelsError: null }));
      
      try {
        const models = await uaipAPI.llm.getModels();
        console.log('[AgentContext] Models loaded successfully:', models.length);
        setModelState(prev => ({ 
          ...prev, 
          models, 
          loadingModels: false 
        }));
        loadingRefs.current.modelsLoaded = true;
      } catch (error) {
        console.error('[AgentContext] Failed to load models:', error);
        setModelState(prev => ({ 
          ...prev, 
          loadingModels: false, 
          modelsError: error instanceof Error ? error.message : 'Failed to load models'
        }));
      } finally {
        loadingRefs.current.modelsLoading = false;
      }
    }, 100); // 100ms debounce
  }, []); // Empty dependency array to prevent infinite loops

  // Create a new provider
  const createProvider = useCallback(async (providerData: ModelProvider) => {
    try {
      await uaipAPI.llm.createProvider(providerData);
      // Reset loading state to allow fresh reload
      loadingRefs.current.providersLoaded = false;
      await loadProviders();
      return true;
    } catch (error) {
      console.error('Failed to create provider:', error);
      throw error;
    }
  }, [loadProviders]);

  // Update provider configuration
  const updateProvider = useCallback(async (providerId: string, config: ModelProvider) => {
    try {
      await uaipAPI.llm.updateProviderConfig(providerId, config);
      // Reset loading state to allow fresh reload
      loadingRefs.current.providersLoaded = false;
      await loadProviders();
      return true;
    } catch (error) {
      console.error('Failed to update provider:', error);
      throw error;
    }
  }, [loadProviders]);

  // Test provider connectivity
  const testProvider = useCallback(async (providerId: string) => {
    try {
      const result = await uaipAPI.llm.testProvider(providerId);
      return result;
    } catch (error) {
      console.error('Failed to test provider:', error);
      throw error;
    }
  }, []);

  // Delete provider
  const deleteProvider = useCallback(async (providerId: string) => {
    try {
      await uaipAPI.llm.deleteProvider(providerId);
      // Reset loading state to allow fresh reload
      loadingRefs.current.providersLoaded = false;
      await loadProviders();
      return true;
    } catch (error) {
      console.error('Failed to delete provider:', error);
      throw error;
    }
  }, [loadProviders]);

  // Get models for a specific provider
  const getModelsForProvider = useCallback((providerId: string): LLMModel[] => {
    const provider = modelState.providers.find(p => p.id === providerId);
    if (!provider) return [];
    
    return modelState.models.filter(model => 
      model.provider === provider.name || 
      model.apiType === provider.type
    );
  }, [modelState.providers, modelState.models]);

  // Get recommended models for agent role
  const getRecommendedModels = useCallback((agentRole?: string): LLMModel[] => {
    return modelState.models.filter(model => {
      if (!model.isAvailable) return false;
      
      if (agentRole) {
        switch (agentRole) {
          case 'assistant':
            return model.name.toLowerCase().includes('gpt') || 
                   model.name.toLowerCase().includes('claude') ||
                   model.name.toLowerCase().includes('llama');
          case 'analyzer':
            return model.name.toLowerCase().includes('claude') || 
                   model.name.toLowerCase().includes('gpt-4');
          case 'orchestrator':
            return model.name.toLowerCase().includes('gpt-4') ||
                   model.name.toLowerCase().includes('claude');
          default:
            return true;
        }
      }
      
      return true;
    });
  }, [modelState.models]);

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

    // Reset loading states to allow fresh loading
    loadingRefs.current = {
      providersLoading: false,
      modelsLoading: false,
      providersLoaded: false,
      modelsLoaded: false
    };
    
    // Clear existing data
    setModelState(prev => ({
      ...prev,
      providers: [],
      models: [],
      providersError: null,
      modelsError: null
    }));
    
    // Load fresh data
    await Promise.allSettled([loadProviders(), loadModels()]);
  }, [loadProviders, loadModels]);

  // Generic flow execution handler
  const executeFlow = async (service: string, flow: string, params?: any) => {
    const flowId = `${service}.${flow}`;
    
    try {
      setActiveFlows(prev => [...prev.filter(f => f !== flowId), flowId]);
      setFlowErrors(prev => { 
        const newMap = new Map(prev);
        newMap.delete(flowId);
        return newMap;
      });

      let result: any;

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
        throw new Error(`Service '${service}' is not yet implemented. Available services: agentIntelligence, capabilityRegistry, orchestrationPipeline, artifactManagement`);
      }
      
      setFlowResults(prev => {
        const newMap = new Map(prev);
        newMap.set(flowId, result);
        return newMap;
      });
      
      setActiveFlows(prev => prev.filter(f => f !== flowId));
      return result;
    } catch (error) {
      setFlowErrors(prev => {
        const newMap = new Map(prev);
        newMap.set(flowId, error instanceof Error ? error.message : 'Unknown error');
        return newMap;
      });
      setActiveFlows(prev => prev.filter(f => f !== flowId));
      throw error;
    }
  };

  // Execute Agent Intelligence flows using UAIP API
  const executeAgentIntelligenceFlow = async (flow: string, params: any) => {
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
          conversationalStyle: params.conversationalStyle
        });
      case 'analyzePersona':
        // Get persona details for analysis
        return await uaipAPI.personas.get(params.personaId);
      case 'getPersonaCategories':
        return await uaipAPI.personas.getCategories();
      default:
        throw new Error(`Agent intelligence flow '${flow}' is not yet implemented`);
    }
  };

  // Execute Capability Registry flows using UAIP API
  const executeCapabilityRegistryFlow = async (flow: string, params: any) => {
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
  const executeOrchestrationPipelineFlow = async (flow: string, params: any) => {
    // These would be actual orchestration API calls - not yet implemented
    throw new Error(`Orchestration pipeline flow '${flow}' is not yet implemented`);
  };

  // Execute Artifact Management flows
  const executeArtifactManagementFlow = async (flow: string, params: any) => {
    // These would be actual artifact service API calls - not yet implemented
    throw new Error(`Artifact management flow '${flow}' is not yet implemented`);
  };



  const getFlowStatus = (flowId: string): 'idle' | 'running' | 'completed' | 'error' => {
    if (activeFlows.includes(flowId)) return 'running';
    if (flowErrors.has(flowId)) return 'error';
    if (flowResults.has(flowId)) return 'completed';
    return 'idle';
  };

  const clearFlowResult = (flowId: string) => {
    setFlowResults(prev => {
      const newMap = new Map(prev);
      newMap.delete(flowId);
      return newMap;
    });
    setFlowErrors(prev => {
      const newMap = new Map(prev);
      newMap.delete(flowId);
      return newMap;
    });
  };

  // Agent Intelligence Flows
  const agentIntelligence: AgentIntelligenceFlow = {
    registerAgent: (config) => executeFlow('agentIntelligence', 'registerAgent', config),
    analyzeContext: (context) => executeFlow('agentIntelligence', 'analyzeContext', context),
    makeDecision: (options) => executeFlow('agentIntelligence', 'makeDecision', options),
    generatePlan: (request) => executeFlow('agentIntelligence', 'generatePlan', request),
    discoverCapabilities: () => executeFlow('agentIntelligence', 'discoverCapabilities'),
    recognizeIntent: (input) => executeFlow('agentIntelligence', 'recognizeIntent', { input }),
    generateResponse: (context) => executeFlow('agentIntelligence', 'generateResponse', context),
    retrieveKnowledge: (query) => executeFlow('agentIntelligence', 'retrieveKnowledge', { query }),
    adaptBehavior: (metrics) => executeFlow('agentIntelligence', 'adaptBehavior', metrics),
    manageMemory: (context) => executeFlow('agentIntelligence', 'manageMemory', context),
    assessSkills: (agentId) => executeFlow('agentIntelligence', 'assessSkills', { agentId }),
    optimizePerformance: (agentId) => executeFlow('agentIntelligence', 'optimizePerformance', { agentId }),
    collaborate: (requirements) => executeFlow('agentIntelligence', 'collaborate', requirements),
    reasonChain: (problem) => executeFlow('agentIntelligence', 'reasonChain', problem),
    recognizeEmotion: (text) => executeFlow('agentIntelligence', 'recognizeEmotion', { text }),
    manageGoals: (objectives) => executeFlow('agentIntelligence', 'manageGoals', objectives),
    resolveConflict: (conflict) => executeFlow('agentIntelligence', 'resolveConflict', conflict),
    assessQuality: (response) => executeFlow('agentIntelligence', 'assessQuality', response),
    managePersona: (persona) => executeFlow('agentIntelligence', 'managePersona', persona),
    searchPersonas: (criteria) => executeFlow('agentIntelligence', 'searchPersonas', criteria),
    analyzePersona: (personaId) => executeFlow('agentIntelligence', 'analyzePersona', { personaId }),
    getPersonaCategories: () => executeFlow('agentIntelligence', 'getPersonaCategories'),
    coordinateAgents: (tasks) => executeFlow('agentIntelligence', 'coordinateAgents', tasks),
    switchContext: (newContext) => executeFlow('agentIntelligence', 'switchContext', newContext),
  };

  // Capability Registry Flows
  const capabilityRegistry: CapabilityRegistryFlow = {
    registerTool: (toolDef) => executeFlow('capabilityRegistry', 'registerTool', toolDef),
    discoverTools: (criteria) => executeFlow('capabilityRegistry', 'discoverTools', criteria),
    executeTool: (toolId, params) => executeFlow('capabilityRegistry', 'executeTool', { toolId, params }),
    validateCapability: (toolId) => executeFlow('capabilityRegistry', 'validateCapability', { toolId }),
    recommendTools: (context) => executeFlow('capabilityRegistry', 'recommendTools', context),
    getToolDependencies: (toolId) => executeFlow('capabilityRegistry', 'getToolDependencies', { toolId }),
    getToolPerformance: (toolId) => executeFlow('capabilityRegistry', 'getToolPerformance', { toolId }),
    getToolCategories: () => executeFlow('capabilityRegistry', 'getToolCategories'),
    versionTool: (toolId, version) => executeFlow('capabilityRegistry', 'versionTool', { toolId, version }),
    getUsageAnalytics: () => executeFlow('capabilityRegistry', 'getUsageAnalytics'),
    getToolDocumentation: (toolId) => executeFlow('capabilityRegistry', 'getToolDocumentation', { toolId }),
    assessToolSecurity: (toolId) => executeFlow('capabilityRegistry', 'assessToolSecurity', { toolId }),
    integrateTool: (integration) => executeFlow('capabilityRegistry', 'integrateTool', integration),
    mapCapabilities: () => executeFlow('capabilityRegistry', 'mapCapabilities'),
    monitorTool: (toolId) => executeFlow('capabilityRegistry', 'monitorTool', { toolId }),
    getToolMarketplace: () => executeFlow('capabilityRegistry', 'getToolMarketplace'),
    createCustomTool: (spec) => executeFlow('capabilityRegistry', 'createCustomTool', spec),
    backupTool: (toolId) => executeFlow('capabilityRegistry', 'backupTool', { toolId }),
    migrateTool: (toolId, target) => executeFlow('capabilityRegistry', 'migrateTool', { toolId, target }),
    auditCapabilities: () => executeFlow('capabilityRegistry', 'auditCapabilities'),
  };

  // Orchestration Pipeline Flows
  const orchestrationPipeline: OrchestrationPipelineFlow = {
    createOperation: (operationDef) => executeFlow('orchestrationPipeline', 'createOperation', operationDef),
    executeOperation: (operationId) => executeFlow('orchestrationPipeline', 'executeOperation', { operationId }),
    getOperationStatus: (operationId) => executeFlow('orchestrationPipeline', 'getOperationStatus', { operationId }),
    cancelOperation: (operationId) => executeFlow('orchestrationPipeline', 'cancelOperation', { operationId }),
    defineWorkflow: (workflowSpec) => executeFlow('orchestrationPipeline', 'defineWorkflow', workflowSpec),
    executeStep: (operationId, stepId) => executeFlow('orchestrationPipeline', 'executeStep', { operationId, stepId }),
    manageResources: () => executeFlow('orchestrationPipeline', 'manageResources'),
    getOperationLogs: (operationId) => executeFlow('orchestrationPipeline', 'getOperationLogs', { operationId }),
    executeBatch: (operations) => executeFlow('orchestrationPipeline', 'executeBatch', { operations }),
    getOperationTemplates: () => executeFlow('orchestrationPipeline', 'getOperationTemplates'),
    monitorPipeline: () => executeFlow('orchestrationPipeline', 'monitorPipeline'),
    recoverOperation: (operationId) => executeFlow('orchestrationPipeline', 'recoverOperation', { operationId }),
    resolveDependencies: (operationId) => executeFlow('orchestrationPipeline', 'resolveDependencies', { operationId }),
    scheduleOperation: (schedule) => executeFlow('orchestrationPipeline', 'scheduleOperation', schedule),
    optimizePerformance: () => executeFlow('orchestrationPipeline', 'optimizePerformance'),
  };

  // Artifact Management Flows
  const artifactManagement: ArtifactManagementFlow = {
    generateArtifact: (request) => executeFlow('artifactManagement', 'generateArtifact', request),
    generateCode: (requirements) => executeFlow('artifactManagement', 'generateCode', requirements),
    generateDocumentation: (codebase) => executeFlow('artifactManagement', 'generateDocumentation', codebase),
    generateTests: (code) => executeFlow('artifactManagement', 'generateTests', code),
    generatePRD: (requirements) => executeFlow('artifactManagement', 'generatePRD', requirements),
    getArtifactTemplates: () => executeFlow('artifactManagement', 'getArtifactTemplates'),
    validateArtifact: (artifactId) => executeFlow('artifactManagement', 'validateArtifact', { artifactId }),
    versionArtifact: (artifactId) => executeFlow('artifactManagement', 'versionArtifact', { artifactId }),
    exportArtifact: (artifactId, format) => executeFlow('artifactManagement', 'exportArtifact', { artifactId, format }),
    assessArtifactQuality: (artifactId) => executeFlow('artifactManagement', 'assessArtifactQuality', { artifactId }),
    searchArtifacts: (query) => executeFlow('artifactManagement', 'searchArtifacts', { query }),
    analyzeArtifactDependencies: (artifactId) => executeFlow('artifactManagement', 'analyzeArtifactDependencies', { artifactId }),
    collaborateOnArtifact: (artifactId) => executeFlow('artifactManagement', 'collaborateOnArtifact', { artifactId }),
    testArtifactIntegration: (artifactId) => executeFlow('artifactManagement', 'testArtifactIntegration', { artifactId }),
    getArtifactAnalytics: () => executeFlow('artifactManagement', 'getArtifactAnalytics'),
  };

  const addAgent = (agent: AgentState) => {
    if (!agent) {
      console.error('addAgent: Cannot add undefined agent');
      return;
    }
    
    if (!agent.id) {
      console.error('addAgent: Agent missing required id property', agent);
      return;
    }
    
    console.log('Adding agent:', agent);
    dispatch({ type: 'ADD_AGENT', payload: agent });
  };

  const removeAgent = (id: string) => {
    dispatch({ type: 'REMOVE_AGENT', payload: id });
  };

  const updateAgentState = (id: string, updates: Partial<AgentState>) => {
    dispatch({ type: 'UPDATE_AGENT', payload: { id, updates } });
  };

  const addMessage = (agentId: string, message: Message) => {
    dispatch({ type: 'ADD_MESSAGE', payload: { agentId, message } });
  };

  const removeMessage = (agentId: string, messageId: string) => {
    dispatch({ type: 'REMOVE_MESSAGE', payload: { agentId, messageId } });
  };

  const getAllMessages = (): Message[] => {
    const allMessages: Message[] = [];
    Object.values(agents).forEach(agent => {
      allMessages.push(...agent.conversationHistory);
    });
    // Sort by timestamp to get chronological order
    return allMessages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  };

  // Tool-related methods using UAIP API
  const executeToolCall = async (agentId: string, toolCall: ToolCall): Promise<ToolResult> => {
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
        currentToolExecution: undefined // Will be set by execution engine
      });

      // Execute the tool call using UAIP API
      const result = await uaipAPI.tools.execute(toolCall.toolId, {
        ...toolCall.parameters,
        agentId
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
        currentToolExecution: undefined 
      });

      return {
        callId: toolCall.id,
        executionId: result.executionId || toolCall.id,
        success: result.success,
        result: result.data,
        executionTime: result.executionTime || 0,
        cost: result.cost || 0,
        error: result.error,
        metadata: result.metadata
      };
    } catch (error) {
      // Update agent state on error
      updateAgentState(agentId, { 
        isUsingTool: false,
        currentToolExecution: undefined 
      });
      throw error;
    }
  };

  const approveToolExecution = async (executionId: string, approverId: string): Promise<boolean> => {
    // This would use UAIP approval workflow API
    try {
      await uaipAPI.approvals.approve(executionId, { approverId });
      return true;
    } catch (error) {
      console.error('Failed to approve tool execution:', error);
      return false;
    }
  };

  const getToolUsageHistory = (agentId: string): ToolUsageRecord[] => {
    const agent = agents[agentId];
    return agent?.toolUsageHistory || [];
  };

  const updateToolPermissions = (agentId: string, permissions: Partial<ToolPermissionSet>) => {
    dispatch({ type: 'UPDATE_TOOL_PERMISSIONS', payload: { agentId, permissions } });
  };

  const setAgentModel = (agentId: string, modelId: string, providerId: string) => {
    dispatch({ type: 'SET_AGENT_MODEL', payload: { agentId, modelId, providerId } });
  };

  const value: AgentContextValue = {
    agents,
    addAgent,
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
  };

  return (
    <AgentContext.Provider value={value}>
      {children}
    </AgentContext.Provider>
  );
}

export function useAgents() {
  const context = useContext(AgentContext);
  if (context === undefined) {
    throw new Error('useAgents must be used within an AgentProvider');
  }
  return context;
} 