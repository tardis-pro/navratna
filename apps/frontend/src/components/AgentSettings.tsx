import React, { useState, useEffect, useCallback } from 'react';
import { 
  Settings, 
  Bot, 
  Server, 
  Globe, 
  Cpu, 
  Save, 
  RefreshCw, 
  AlertCircle, 
  CheckCircle2,
  Trash2,
  Plus,
  Edit3,
  X,
  Users
} from 'lucide-react';
import { AgentState } from '../types/agent';
import { ModelOption } from '../types/models';
import { Persona } from '../types/persona';
// import { getModels } from '../services/llm';
import { uaipAPI } from '../utils/uaip-api';
import { PersonaSelector } from './PersonaSelector';

const getModels = async () => {
  try {
    const response = await uaipAPI.llm.getModels();
    
    if (!response.success) {
      console.error('Failed to fetch models:', response.error?.message);
      return [];
    }
    
    const models = response.data || [];
    return models.map(model => ({
      id: model.id,
      name: model.name,
      description: model.description,
      source: model.source,
      apiEndpoint: model.apiEndpoint,
      apiType: model.apiType
    }));
  } catch (error) {
    console.error('Failed to fetch models:', error);
    return [];
  }
};

interface AgentModelConfig {
  agentId: string;
  modelId: string;
  apiType: 'ollama' | 'llmstudio';
  isActive: boolean;
  personaId?: string;
  lastUpdated: Date;
}

interface AgentSettingsProps {
  agents: Record<string, AgentState>;
  onUpdateAgent: (agentId: string, updates: Partial<AgentState>) => void;
  onRefreshAgents: () => void;
  // New props for model provider integration
  modelState?: {
    providers: Array<{
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
      healthCheckResult?: any;
      hasApiKey: boolean;
      createdAt: string;
      updatedAt: string;
    }>;
    models: Array<{
      id: string;
      name: string;
      description?: string;
      source: string;
      apiEndpoint: string;
      apiType: 'ollama' | 'llmstudio' | 'openai' | 'anthropic' | 'custom';
      provider: string;
      isAvailable: boolean;
    }>;
    loadingProviders: boolean;
    loadingModels: boolean;
    providersError: string | null;
    modelsError: string | null;
  };
  getRecommendedModels?: (agentRole?: string) => Array<{
    id: string;
    name: string;
    description?: string;
    source: string;
    apiEndpoint: string;
    apiType: 'ollama' | 'llmstudio' | 'openai' | 'anthropic' | 'custom';
    provider: string;
    isAvailable: boolean;
  }>;
  getModelsForProvider?: (providerId: string) => Array<{
    id: string;
    name: string;
    description?: string;
    source: string;
    apiEndpoint: string;
    apiType: 'ollama' | 'llmstudio' | 'openai' | 'anthropic' | 'custom';
    provider: string;
    isAvailable: boolean;
  }>;
}

export const AgentSettings: React.FC<AgentSettingsProps> = ({ 
  agents, 
  onUpdateAgent, 
  onRefreshAgents,
  modelState,
  getRecommendedModels,
  getModelsForProvider
}) => {
  const [availableModels, setAvailableModels] = useState<ModelOption[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [savingConfigs, setSavingConfigs] = useState<Set<string>>(new Set());
  const [editingAgent, setEditingAgent] = useState<string | null>(null);
  const [tempConfigs, setTempConfigs] = useState<Record<string, AgentModelConfig>>({});
  const [showPersonaSelector, setShowPersonaSelector] = useState<string | null>(null);

  // Use model provider data from context if available, otherwise load from API
  const effectiveModels = modelState?.models || availableModels;
  const effectiveLoading = modelState?.loadingModels || modelsLoading;
  const effectiveError = modelState?.modelsError || modelsError;

  // Load available models (fallback for when modelState is not provided)
  const loadModels = useCallback(async () => {
    if (modelState?.models && modelState.models.length > 0) return; // Use context data if available
    if (modelsLoading) return; // Prevent multiple concurrent calls
    
    setModelsLoading(true);
    setModelsError(null);
    
    try {
      const models = await getModels();
      setAvailableModels(models);
    } catch (error) {
      console.error('Failed to load models:', error);
      setModelsError(error instanceof Error ? error.message : 'Failed to load models');
      setAvailableModels([]);
    } finally {
      setModelsLoading(false);
    }
  }, [modelState?.models, modelsLoading]);

  // Only load models once if not provided via modelState
  useEffect(() => {
    if (!modelState?.models || modelState.models.length === 0) {
      if (!modelsLoading && availableModels.length === 0) {
        loadModels();
      }
    }
  }, []); // Empty dependency array to run only once

  // Helper functions
  const getServerIcon = (apiType: string) => {
    return apiType === 'ollama' ? Globe : Server;
  };

  const getModelInfo = (modelId: string) => {
    return effectiveModels.find(m => m.id === modelId);
  };

  const getProviderInfo = (providerId: string) => {
    return modelState?.providers.find(p => p.id === providerId);
  };

  const getServerName = (modelInfo: any) => {
    if (!modelInfo?.source) return 'Unknown';
    
    try {
      const url = new URL(modelInfo.source);
      const hostname = url.hostname;
      const port = url.port;
      
      if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return port ? `localhost:${port}` : 'localhost';
      }
      
      return hostname;
    } catch {
      return modelInfo.source.split('/').pop() || 'Unknown';
    }
  };

  // Get models organized by provider
  const getModelsByProvider = () => {
    const modelsByProvider: Record<string, any[]> = {};
    
    effectiveModels.forEach(model => {
      const providerKey = model.provider || model.apiType || 'unknown';
      if (!modelsByProvider[providerKey]) {
        modelsByProvider[providerKey] = [];
      }
      modelsByProvider[providerKey].push(model);
    });
    
    return modelsByProvider;
  };

  // Get recommended models for an agent
  const getAgentRecommendedModels = (agentRole?: string) => {
    if (getRecommendedModels) {
      return getRecommendedModels(agentRole);
    }
    
    // Fallback logic
    return effectiveModels.filter(model => {
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
  };

  // Configuration management
  const startEditing = (agentId: string) => {
    const agent = agents[agentId];
    if (!agent) return;

    setEditingAgent(agentId);
    setTempConfigs(prev => ({
      ...prev,
      [agentId]: {
        agentId,
        modelId: agent.modelId || '',
        apiType: agent.apiType || 'ollama',
        isActive: agent.isActive ?? true,
        personaId: agent.personaId || '',
        lastUpdated: new Date()
      }
    }));
  };

  const handlePersonaSelect = async (agentId: string, persona: Persona) => {
    setShowPersonaSelector(null);
    updateTempConfig(agentId, { personaId: persona.id });
  };

  const cancelEditing = (agentId: string) => {
    setEditingAgent(null);
    setTempConfigs(prev => {
      const newConfigs = { ...prev };
      delete newConfigs[agentId];
      return newConfigs;
    });
  };

  const updateTempConfig = (agentId: string, updates: Partial<AgentModelConfig>) => {
    setTempConfigs(prev => ({
      ...prev,
      [agentId]: {
        ...prev[agentId],
        ...updates,
        lastUpdated: new Date()
      }
    }));
  };

  const saveAgentConfig = async (agentId: string) => {
    const config = tempConfigs[agentId];
    if (!config) return;

    setSavingConfigs(prev => new Set(prev).add(agentId));

    try {
      // Update local agent state
      const modelInfo = getModelInfo(config.modelId);
      const updates: Partial<AgentState> = {
        modelId: config.modelId,
        apiType: config.apiType,
        isActive: config.isActive,
        personaId: config.personaId,
        // Clear error state if model is now valid
        error: modelInfo ? null : 'Model not available'
      };

      onUpdateAgent(agentId, updates);

      // Update backend via API
      const backendUpdates = {
        isActive: config.isActive,
        personaId: config.personaId,
        configuration: {
          modelId: config.modelId,
          apiType: config.apiType
        }
        
      };

      const response = await uaipAPI.client.agents.update(agentId, backendUpdates);
      
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to save agent configuration');
      }

      // Clear temp config and editing state
      setEditingAgent(null);
      setTempConfigs(prev => {
        const newConfigs = { ...prev };
        delete newConfigs[agentId];
        return newConfigs;
      });

    } catch (error) {
      console.error('Failed to save agent config:', error);
      // Revert local changes
      onUpdateAgent(agentId, { error: error instanceof Error ? error.message : 'Failed to save configuration' });
    } finally {
      setSavingConfigs(prev => {
        const newSet = new Set(prev);
        newSet.delete(agentId);
        return newSet;
      });
    }
  };

  const agentList = Object.values(agents);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 via-indigo-600 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/25">
            <Settings className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">Agent Settings</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">Configure model associations and agent parameters</p>
          </div>
        </div>
        
        <div className="flex items-center space-x-3">
          <button
            onClick={loadModels}
            disabled={effectiveLoading}
            className="flex items-center space-x-2 px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${effectiveLoading ? 'animate-spin' : ''}`} />
            <span>Refresh Models</span>
          </button>
          
          <div className="flex items-center space-x-2 px-3 py-2 bg-gradient-to-r from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-700 rounded-full shadow-inner">
            <div className="w-2 h-2 bg-gradient-to-r from-green-500 to-blue-500 rounded-full"></div>
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              {effectiveModels.length} Models
            </span>
          </div>
          
          {modelState?.providers && (
            <div className="flex items-center space-x-2 px-3 py-2 bg-gradient-to-r from-purple-100 to-indigo-200 dark:from-purple-800 dark:to-indigo-700 rounded-full shadow-inner">
              <div className="w-2 h-2 bg-gradient-to-r from-purple-500 to-indigo-500 rounded-full"></div>
              <span className="text-sm font-semibold text-purple-700 dark:text-purple-300">
                {modelState.providers.filter(p => p.isActive).length}/{modelState.providers.length} Providers
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Models Error */}
      {effectiveError && (
        <div className="flex items-center space-x-3 p-4 bg-gradient-to-r from-red-50 to-pink-50 dark:from-red-900/20 dark:to-pink-900/20 border border-red-200 dark:border-red-800 rounded-xl">
          <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0" />
          <div className="flex-1">
            <span className="text-sm font-semibold text-red-700 dark:text-red-300 block">
              Model Loading Error
            </span>
            <span className="text-xs text-red-600 dark:text-red-400 block">
              {effectiveError}
            </span>
          </div>
        </div>
      )}

      {/* Agents Configuration */}
      <div className="space-y-4">
        {agentList.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-20 h-20 bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-700 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-inner">
              <Bot className="w-10 h-10 text-slate-400" />
            </div>
            <p className="text-slate-600 dark:text-slate-300 font-semibold text-lg">No agents configured</p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">Create agents first to configure their model associations</p>
          </div>
        ) : (
          agentList.map((agent) => {
            const isEditing = editingAgent === agent.id;
            const config = tempConfigs[agent.id];
            const isSaving = savingConfigs.has(agent.id);
            
            const currentModelId = isEditing ? config?.modelId : agent.modelId;
            const currentApiType = isEditing ? config?.apiType : agent.apiType;
            const currentIsActive = isEditing ? config?.isActive : agent.isActive;
            
            const modelInfo = getModelInfo(currentModelId || '');
            const serverName = getServerName(modelInfo);
            const ServiceIcon = getServerIcon(currentApiType || 'ollama');
            
            const hasValidModel = !!modelInfo;
            const hasPersona = !!(isEditing ? config?.personaId : agent.personaId);
            const isFullyConfigured = hasValidModel && hasPersona;
            const modelName = modelInfo?.name || currentModelId || 'No model selected';

            return (
              <div 
                key={agent.id}
                className={`group relative p-6 bg-gradient-to-r from-white via-white to-slate-50 dark:from-slate-800 dark:via-slate-800 dark:to-slate-700 border-2 rounded-2xl transition-all duration-300 ${
                  isEditing 
                    ? 'border-blue-500 shadow-xl shadow-blue-500/20' 
                    : isFullyConfigured
                      ? 'border-green-200 dark:border-green-800 hover:border-green-300 dark:hover:border-green-700'
                      : hasValidModel || hasPersona
                        ? 'border-orange-200 dark:border-orange-800 hover:border-orange-300 dark:hover:border-orange-700'
                        : 'border-red-200 dark:border-red-800 hover:border-red-300 dark:hover:border-red-700'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-4 flex-1">
                    {/* Agent Avatar */}
                    <div className="relative flex-shrink-0">
                      <div className="w-14 h-14 bg-gradient-to-br from-blue-500 via-purple-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/25">
                        <Bot className="w-7 h-7 text-white" />
                      </div>
                      <div className={`absolute -bottom-1 -right-1 w-5 h-5 border-2 border-white dark:border-slate-800 rounded-full ${
                        currentIsActive ? 'bg-green-500' : 'bg-gray-400'
                      }`}></div>
                    </div>

                    {/* Agent Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-3 mb-2">
                        <h3 className="font-bold text-lg text-slate-900 dark:text-white">{agent.name}</h3>
                        <span className="inline-flex items-center px-2 py-1 bg-gradient-to-r from-blue-100 to-indigo-100 dark:from-blue-900/30 dark:to-indigo-900/30 text-blue-700 dark:text-blue-300 text-xs rounded-full font-medium border border-blue-200 dark:border-blue-800">
                          {agent.role}
                        </span>
                                                 {!hasValidModel && (
                           <span className="inline-flex items-center px-2 py-1 bg-gradient-to-r from-red-100 to-pink-100 dark:from-red-900/30 dark:to-pink-900/30 text-red-700 dark:text-red-300 text-xs rounded-full font-medium border border-red-200 dark:border-red-800">
                             No Model
                           </span>
                         )}
                         {!agent.personaId && (
                           <span className="inline-flex items-center px-2 py-1 bg-gradient-to-r from-orange-100 to-yellow-100 dark:from-orange-900/30 dark:to-yellow-900/30 text-orange-700 dark:text-orange-300 text-xs rounded-full font-medium border border-orange-200 dark:border-orange-800">
                             No Persona
                           </span>
                         )}
                         {agent.personaId && (
                           <span className="inline-flex items-center px-2 py-1 bg-gradient-to-r from-purple-100 to-pink-100 dark:from-purple-900/30 dark:to-pink-900/30 text-purple-700 dark:text-purple-300 text-xs rounded-full font-medium border border-purple-200 dark:border-purple-800">
                             Has Persona
                           </span>
                         )}
                      </div>

                      {/* Model Configuration */}
                      {isEditing ? (
                        <div className="space-y-4">
                          {/* Model Selection */}
                          <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                              Language Model
                            </label>
                            
                            {/* Show recommended models for this agent role */}
                            {agent.role && (
                              <div className="mb-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                                <div className="flex items-center space-x-2 mb-2">
                                  <Cpu className="w-4 h-4 text-blue-600" />
                                  <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                                    Recommended for {agent.role}
                                  </span>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  {getAgentRecommendedModels(agent.role).slice(0, 3).map((model) => (
                                    <button
                                      key={model.id}
                                      type="button"
                                      onClick={() => updateTempConfig(agent.id, { 
                                        modelId: model.id,
                                        apiType: model.apiType as 'ollama' | 'llmstudio' || 'ollama'
                                      })}
                                      className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                                        config?.modelId === model.id
                                          ? 'bg-blue-600 text-white border-blue-600'
                                          : 'bg-white dark:bg-slate-800 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700 hover:bg-blue-100 dark:hover:bg-blue-900/30'
                                      }`}
                                    >
                                      {model.name}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                            
                            <select
                              value={config?.modelId || ''}
                              onChange={(e) => updateTempConfig(agent.id, { 
                                modelId: e.target.value,
                                apiType: effectiveModels.find(m => m.id === e.target.value)?.apiType as 'ollama' | 'llmstudio' || 'ollama'
                              })}
                              className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            >
                              <option value="">Select a model...</option>
                              
                              {/* Group models by provider */}
                              {Object.entries(getModelsByProvider()).map(([providerKey, models]) => (
                                <optgroup key={providerKey} label={`${providerKey.toUpperCase()} Models`}>
                                  {models.map((model) => (
                                    <option key={model.id} value={model.id}>
                                      {model.name || model.id} {!model.isAvailable && '(Unavailable)'}
                                    </option>
                                  ))}
                                </optgroup>
                              ))}
                            </select>
                            
                            {/* Show provider info for selected model */}
                            {config?.modelId && (
                              <div className="mt-2 p-2 bg-slate-50 dark:bg-slate-800 rounded-lg">
                                <div className="text-xs text-slate-600 dark:text-slate-400">
                                  {(() => {
                                    const modelInfo = getModelInfo(config.modelId);
                                    const provider = modelState?.providers.find(p => 
                                      p.type === modelInfo?.apiType || p.name === modelInfo?.provider
                                    );
                                    
                                    if (provider) {
                                      return (
                                        <div className="flex items-center justify-between">
                                          <span>Provider: {provider.name}</span>
                                          <span className={`px-2 py-1 rounded-full text-xs ${
                                            provider.isActive && provider.status === 'active'
                                              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                                              : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                                          }`}>
                                            {provider.isActive ? 'Active' : 'Inactive'}
                                          </span>
                                        </div>
                                      );
                                    }
                                    
                                    return modelInfo ? `Source: ${getServerName(modelInfo)}` : 'Model information not available';
                                  })()}
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Persona Selection */}
                          <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                              Agent Persona
                            </label>
                            <div className="flex space-x-2">
                              <input
                                type="text"
                                value={config?.personaId || 'No persona selected'}
                                readOnly
                                className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-600 dark:text-slate-400"
                                placeholder="No persona selected"
                              />
                              <button
                                type="button"
                                onClick={() => setShowPersonaSelector(agent.id)}
                                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors flex items-center space-x-2"
                              >
                                <Users className="w-4 h-4" />
                                <span>Select</span>
                              </button>
                            </div>
                          </div>

                          {/* Active Status */}
                          <div className="flex items-center space-x-3">
                            <input
                              type="checkbox"
                              id={`active-${agent.id}`}
                              checked={config?.isActive ?? true}
                              onChange={(e) => updateTempConfig(agent.id, { isActive: e.target.checked })}
                              className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                            />
                            <label htmlFor={`active-${agent.id}`} className="text-sm font-medium text-slate-700 dark:text-slate-300">
                              Agent is active
                            </label>
                          </div>

                          {/* Action Buttons */}
                          <div className="flex items-center space-x-2 pt-2">
                            <button
                              onClick={() => saveAgentConfig(agent.id)}
                              disabled={isSaving || !config?.modelId}
                              className="flex items-center space-x-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {isSaving ? (
                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                              ) : (
                                <Save className="w-4 h-4" />
                              )}
                              <span>{isSaving ? 'Saving...' : 'Save'}</span>
                            </button>
                            <button
                              onClick={() => cancelEditing(agent.id)}
                              disabled={isSaving}
                              className="flex items-center space-x-2 px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white rounded-lg transition-colors disabled:opacity-50"
                            >
                              <X className="w-4 h-4" />
                              <span>Cancel</span>
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {/* Current Model Display */}
                          <div className="flex items-center space-x-3 p-3 bg-slate-100 dark:bg-slate-700 rounded-lg">
                            <ServiceIcon className="w-5 h-5 text-slate-600 dark:text-slate-400 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-slate-900 dark:text-white truncate">
                                {modelName}
                              </div>
                              <div className="text-sm text-slate-500 dark:text-slate-400">
                                {currentApiType === 'ollama' ? '🌐' : '🖥️'} {serverName}
                              </div>
                            </div>
                            {hasValidModel ? (
                              <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
                            ) : (
                              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                            )}
                          </div>

                          {/* Persona Info */}
                          {agent.personaId && (
                            <div className="flex items-center space-x-3 p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                              <Users className="w-5 h-5 text-purple-600 dark:text-purple-400 flex-shrink-0" />
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-purple-900 dark:text-purple-100 truncate">
                                  Persona: {agent.personaId}
                                </div>
                                <div className="text-sm text-purple-600 dark:text-purple-400">
                                  Configured persona for behavior and expertise
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Agent Status */}
                          <div className="flex items-center space-x-2">
                            <span className="text-sm text-slate-600 dark:text-slate-400">Status:</span>
                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                              currentIsActive 
                                ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' 
                                : 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300'
                            }`}>
                              {currentIsActive ? 'Active' : 'Inactive'}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Action Button */}
                  {!isEditing && (
                    <button
                      onClick={() => startEditing(agent.id)}
                      className="opacity-0 group-hover:opacity-100 p-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-xl transition-all duration-200 hover:scale-110 flex-shrink-0"
                    >
                      <Edit3 className="w-5 h-5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Persona Selector Modal */}
      {showPersonaSelector && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-6xl h-[90vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl flex items-center justify-center shadow-lg shadow-purple-500/25">
                  <Users className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-900 dark:text-white">Select Agent Persona</h2>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    Choose a persona for {agents[showPersonaSelector]?.name}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowPersonaSelector(null)}
                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-hidden p-6">
              <PersonaSelector
                onSelectPersona={(persona) => handlePersonaSelect(showPersonaSelector, persona)}
                disabled={false}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}; 