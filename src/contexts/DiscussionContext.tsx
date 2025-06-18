import React, { createContext, useContext, useEffect, useState } from 'react';
import { useDiscussionManager, DiscussionManagerConfig } from '../hooks/useDiscussionManager';
import { AgentState, Message } from '../types/agent';
import { ModelOption } from '../components/ModelSelector';
import { discussionOrchestrationService } from '../services/DiscussionOrchestrationService';
import { ArtifactType } from '../types/artifact';

// UAIP Backend Integration Types
interface SecurityFlow {
  login: (credentials: any) => Promise<any>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<string>;
  validatePermissions: (resource: string) => Promise<any>;
  assessRisk: (operation: any) => Promise<any>;
  auditLog: (filters?: any) => Promise<any>;
}

interface AgentIntelligenceFlow {
  registerAgent: (config: any) => Promise<string>;
  analyzeContext: (context: any) => Promise<any>;
  makeDecision: (options: any) => Promise<any>;
  generatePlan: (request: any) => Promise<any>;
  discoverCapabilities: () => Promise<any>;
  recognizeIntent: (input: string) => Promise<any>;
  generateResponse: (context: any) => Promise<string>;
  retrieveKnowledge: (query: string) => Promise<any>;
  adaptBehavior: (metrics: any) => Promise<void>;
  manageMemory: (context: any) => Promise<void>;
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
}

interface DiscussionOrchestrationFlow {
  createDiscussion: (params: any) => Promise<string>;
  manageParticipants: (discussionId: string, participants: any) => Promise<void>;
  routeMessage: (discussionId: string, message: any) => Promise<void>;
  manageTurn: (discussionId: string) => Promise<string>;
  getDiscussionState: (discussionId: string) => Promise<any>;
  getMessageHistory: (discussionId: string, pagination?: any) => Promise<any>;
  searchDiscussions: (query: string) => Promise<any>;
  analyzeDiscussion: (discussionId: string) => Promise<any>;
  moderateDiscussion: (discussionId: string, action: any) => Promise<void>;
  exportDiscussion: (discussionId: string, format: string) => Promise<string>;
  analyzeSentiment: (discussionId: string) => Promise<any>;
  extractTopics: (discussionId: string) => Promise<any>;
  summarizeDiscussion: (discussionId: string) => Promise<any>;
  getParticipantInsights: (discussionId: string) => Promise<any>;
  getDiscussionTemplates: () => Promise<any>;
  detectConflicts: (discussionId: string) => Promise<any>;
  scheduleDiscussion: (schedule: any) => Promise<any>;
  measureQuality: (discussionId: string) => Promise<any>;
  archiveDiscussion: (discussionId: string) => Promise<void>;
  transcribeDiscussion: (discussionId: string) => Promise<any>;
  branchDiscussion: (discussionId: string, branchPoint: any) => Promise<string>;
  trackEngagement: (discussionId: string) => Promise<any>;
  getRecommendations: (userId: string) => Promise<any>;
  optimizeTurnStrategy: (discussionId: string) => Promise<any>;
}

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

interface SystemOperationsFlow {
  healthCheck: () => Promise<any>;
  getSystemMetrics: () => Promise<any>;
  getSystemConfig: () => Promise<any>;
  migrateDatabase: () => Promise<any>;
  clearCache: (layer?: string) => Promise<void>;
  getSystemLogs: (filters?: any) => Promise<any>;
  backupSystem: () => Promise<any>;
  monitorSystem: () => Promise<any>;
  discoverServices: () => Promise<any>;
}

interface DiscussionContextValue {
  currentTurn: string | null;
  isActive: boolean;
  history: Message[];
  currentRound: number;
  discussionId: string | null;
  addAgent: (agentId: string, state: AgentState) => Promise<void>;
  removeAgent: (agentId: string) => Promise<void>;
  setModerator: (agentId: string) => void;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  addMessage: (agentId: string, content: string) => Promise<void>;
  setInitialDocument: (document: string) => void;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  reset: () => Promise<void>;
  syncWithBackend: () => Promise<void>;
  lastError: string | null;
  // Model-related properties
  availableModels: ModelOption[];
  modelsLoading: boolean;
  modelsError: string | null;
  createAgentFromPersona?: (persona: any, name: string, modelId: string) => Promise<any>;
  // Orchestration and Artifact capabilities
  operationId: string | null;
  analyzeConversation: () => Promise<{
    triggers: any[];
    phase: any;
    summary: any;
    suggestions: string[];
  }>;
  generateArtifact: (type: ArtifactType, parameters?: Record<string, any>) => Promise<any>;
  getAvailableArtifactTypes: () => string[];
  cancelOperation: (operationId: string) => Promise<void>;
  
  // UAIP Backend Flow Integration
  security: SecurityFlow;
  agentIntelligence: AgentIntelligenceFlow;
  discussionOrchestration: DiscussionOrchestrationFlow;
  capabilityRegistry: CapabilityRegistryFlow;
  orchestrationPipeline: OrchestrationPipelineFlow;
  artifactManagement: ArtifactManagementFlow;
  systemOperations: SystemOperationsFlow;
  
  // UI State Management
  activeFlows: string[];
  flowResults: Map<string, any>;
  flowErrors: Map<string, string>;
  executeFlow: (service: string, flow: string, params?: any) => Promise<any>;
  getFlowStatus: (flowId: string) => 'idle' | 'running' | 'completed' | 'error';
  clearFlowResult: (flowId: string) => void;
}

interface DiscussionProviderProps {
  topic: string;
  maxRounds?: number;
  turnStrategy?: 'round_robin' | 'moderated' | 'context_aware';
  children: React.ReactNode;
}

const DiscussionContext = createContext<DiscussionContextValue | null>(null);

export const useDiscussion = (): DiscussionContextValue => {
  const context = useContext(DiscussionContext);
  if (!context) {
    throw new Error('useDiscussion must be used within a DiscussionProvider');
  }
  return context;
};

export const DiscussionProvider: React.FC<DiscussionProviderProps> = ({
  topic,
  maxRounds,
  turnStrategy = 'round_robin',
  children
}) => {
  const [operationId, setOperationId] = useState<string | null>(null);
  const [activeFlows, setActiveFlows] = useState<string[]>([]);
  const [flowResults, setFlowResults] = useState<Map<string, any>>(new Map());
  const [flowErrors, setFlowErrors] = useState<Map<string, string>>(new Map());
  
  const config: DiscussionManagerConfig = {
    topic,
    maxRounds,
    turnStrategy
  };

  const discussionManager = useDiscussionManager(config);

  // Initialize operation when discussion starts
  useEffect(() => {
    if (discussionManager.isActive && discussionManager.discussionId && !operationId) {
      discussionOrchestrationService
        .createDiscussionOperation(discussionManager.discussionId, 'discussion_management')
        .then(setOperationId)
        .catch(error => console.error('Failed to create discussion operation:', error));
    }
  }, [discussionManager.isActive, discussionManager.discussionId, operationId]);

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

      // Mock API call - in real implementation, this would call the actual backend API
      const result = await mockApiCall(service, flow, params);
      
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

  // Mock API call function - replace with actual API calls
  const mockApiCall = async (service: string, flow: string, params: any) => {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, Math.random() * 2000 + 500));
    
    // Mock different responses based on service and flow
    if (service === 'security' && flow === 'login') {
      return { token: 'mock-jwt-token', user: { id: '1', name: 'User' } };
    }
    
    if (service === 'agentIntelligence' && flow === 'analyzeContext') {
      return { 
        intent: 'information_seeking',
        sentiment: 'neutral',
        entities: ['discussion', 'context'],
        confidence: 0.85
      };
    }
    
    if (service === 'discussionOrchestration' && flow === 'analyzeSentiment') {
      return {
        overall: 'positive',
        timeline: [
          { timestamp: Date.now() - 60000, sentiment: 'neutral' },
          { timestamp: Date.now() - 30000, sentiment: 'positive' },
          { timestamp: Date.now(), sentiment: 'positive' }
        ]
      };
    }
    
    // Default mock response
    return { 
      success: true, 
      service, 
      flow, 
      params, 
      timestamp: new Date().toISOString(),
      data: `Mock result for ${service}.${flow}`
    };
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

  // Security Gateway Flows (20 flows)
  const security: SecurityFlow = {
    login: (credentials) => executeFlow('security', 'login', credentials),
    logout: () => executeFlow('security', 'logout'),
    refreshToken: () => executeFlow('security', 'refreshToken'),
    validatePermissions: (resource) => executeFlow('security', 'validatePermissions', { resource }),
    assessRisk: (operation) => executeFlow('security', 'assessRisk', operation),
    auditLog: (filters) => executeFlow('security', 'auditLog', filters),
  };

  // Agent Intelligence Flows (25 flows)
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
    coordinateAgents: (tasks) => executeFlow('agentIntelligence', 'coordinateAgents', tasks),
    switchContext: (newContext) => executeFlow('agentIntelligence', 'switchContext', newContext),
  };

  // Discussion Orchestration Flows (25 flows)
  const discussionOrchestration: DiscussionOrchestrationFlow = {
    createDiscussion: (params) => executeFlow('discussionOrchestration', 'createDiscussion', params),
    manageParticipants: (discussionId, participants) => executeFlow('discussionOrchestration', 'manageParticipants', { discussionId, participants }),
    routeMessage: (discussionId, message) => executeFlow('discussionOrchestration', 'routeMessage', { discussionId, message }),
    manageTurn: (discussionId) => executeFlow('discussionOrchestration', 'manageTurn', { discussionId }),
    getDiscussionState: (discussionId) => executeFlow('discussionOrchestration', 'getDiscussionState', { discussionId }),
    getMessageHistory: (discussionId, pagination) => executeFlow('discussionOrchestration', 'getMessageHistory', { discussionId, pagination }),
    searchDiscussions: (query) => executeFlow('discussionOrchestration', 'searchDiscussions', { query }),
    analyzeDiscussion: (discussionId) => executeFlow('discussionOrchestration', 'analyzeDiscussion', { discussionId }),
    moderateDiscussion: (discussionId, action) => executeFlow('discussionOrchestration', 'moderateDiscussion', { discussionId, action }),
    exportDiscussion: (discussionId, format) => executeFlow('discussionOrchestration', 'exportDiscussion', { discussionId, format }),
    analyzeSentiment: (discussionId) => executeFlow('discussionOrchestration', 'analyzeSentiment', { discussionId }),
    extractTopics: (discussionId) => executeFlow('discussionOrchestration', 'extractTopics', { discussionId }),
    summarizeDiscussion: (discussionId) => executeFlow('discussionOrchestration', 'summarizeDiscussion', { discussionId }),
    getParticipantInsights: (discussionId) => executeFlow('discussionOrchestration', 'getParticipantInsights', { discussionId }),
    getDiscussionTemplates: () => executeFlow('discussionOrchestration', 'getDiscussionTemplates'),
    detectConflicts: (discussionId) => executeFlow('discussionOrchestration', 'detectConflicts', { discussionId }),
    scheduleDiscussion: (schedule) => executeFlow('discussionOrchestration', 'scheduleDiscussion', schedule),
    measureQuality: (discussionId) => executeFlow('discussionOrchestration', 'measureQuality', { discussionId }),
    archiveDiscussion: (discussionId) => executeFlow('discussionOrchestration', 'archiveDiscussion', { discussionId }),
    transcribeDiscussion: (discussionId) => executeFlow('discussionOrchestration', 'transcribeDiscussion', { discussionId }),
    branchDiscussion: (discussionId, branchPoint) => executeFlow('discussionOrchestration', 'branchDiscussion', { discussionId, branchPoint }),
    trackEngagement: (discussionId) => executeFlow('discussionOrchestration', 'trackEngagement', { discussionId }),
    getRecommendations: (userId) => executeFlow('discussionOrchestration', 'getRecommendations', { userId }),
    optimizeTurnStrategy: (discussionId) => executeFlow('discussionOrchestration', 'optimizeTurnStrategy', { discussionId }),
  };

  // Capability Registry Flows (20 flows)
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

  // Orchestration Pipeline Flows (15 flows)
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

  // Artifact Management Flows (20 flows)
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

  // System Operations Flows (10 flows)
  const systemOperations: SystemOperationsFlow = {
    healthCheck: () => executeFlow('systemOperations', 'healthCheck'),
    getSystemMetrics: () => executeFlow('systemOperations', 'getSystemMetrics'),
    getSystemConfig: () => executeFlow('systemOperations', 'getSystemConfig'),
    migrateDatabase: () => executeFlow('systemOperations', 'migrateDatabase'),
    clearCache: (layer) => executeFlow('systemOperations', 'clearCache', { layer }),
    getSystemLogs: (filters) => executeFlow('systemOperations', 'getSystemLogs', filters),
    backupSystem: () => executeFlow('systemOperations', 'backupSystem'),
    monitorSystem: () => executeFlow('systemOperations', 'monitorSystem'),
    discoverServices: () => executeFlow('systemOperations', 'discoverServices'),
  };

  // Legacy functions
  const analyzeConversation = async () => {
    if (!discussionManager.discussionId) {
      throw new Error('No active discussion to analyze');
    }

    return await discussionOrchestrationService.analyzeConversation(
      discussionManager.discussionId,
      discussionManager.history
    );
  };

  const generateArtifact = async (type: ArtifactType, parameters: Record<string, any> = {}) => {
    if (!discussionManager.discussionId) {
      throw new Error('No active discussion for artifact generation');
    }

    return await discussionOrchestrationService.generateArtifactFromConversation(
      discussionManager.discussionId,
      discussionManager.history,
      type,
      parameters
    );
  };

  const getAvailableArtifactTypes = () => {
    return ['code', 'test', 'documentation', 'prd'];
  };

  const cancelOperation = async (operationId: string) => {
    await discussionOrchestrationService.cancelOperation(operationId);
  };

  const contextValue: DiscussionContextValue = {
    currentTurn: discussionManager.currentTurn,
    isActive: discussionManager.isActive,
    history: discussionManager.history,
    currentRound: discussionManager.currentRound,
    discussionId: discussionManager.discussionId,
    addAgent: discussionManager.addAgent,
    removeAgent: discussionManager.removeAgent,
    setModerator: discussionManager.setModerator,
    start: discussionManager.start,
    stop: discussionManager.stop,
    addMessage: discussionManager.addMessage,
    setInitialDocument: discussionManager.setInitialDocument,
    pause: discussionManager.pause,
    resume: discussionManager.resume,
    reset: discussionManager.reset,
    syncWithBackend: discussionManager.syncWithBackend,
    lastError: discussionManager.state.lastError,
    availableModels: [],
    modelsLoading: false,
    modelsError: null,
    operationId,
    analyzeConversation,
    generateArtifact,
    getAvailableArtifactTypes,
    cancelOperation,
    createAgentFromPersona: async (persona: any, name: string, modelId: string) => {
      if (!discussionManager.discussionId) {
        throw new Error('No active discussion for agent creation');
      }

      const agentOperationId = await discussionOrchestrationService.createDiscussionOperation(
        discussionManager.discussionId,
        'discussion_management',
        { action: 'create_agent', persona, name, modelId }
      );

      return { operationId: agentOperationId, agentId: `agent-${Date.now()}` };
    },
    
    // UAIP Backend Flow Integration
    security,
    agentIntelligence,
    discussionOrchestration,
    capabilityRegistry,
    orchestrationPipeline,
    artifactManagement,
    systemOperations,
    
    // UI State Management
    activeFlows,
    flowResults,
    flowErrors,
    executeFlow,
    getFlowStatus,
    clearFlowResult,
  };

  return (
    <DiscussionContext.Provider value={contextValue}>
      {children}
    </DiscussionContext.Provider>
  );
}; 