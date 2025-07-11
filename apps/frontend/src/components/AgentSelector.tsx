import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAgents } from '../contexts/AgentContext';
import { PersonaSelector } from './PersonaSelector';
import { AgentState, createAgentStateFromBackend } from '../types/agent';
import { Persona, PersonaDisplay } from '../types/persona';
import { ModelOption } from './ModelSelector';
import { useDiscussion } from '../contexts/DiscussionContext';
import { uaipAPI } from '../utils/uaip-api';
import { Users, Plus, Trash2, Bot, Cpu, AlertCircle, CheckCircle2, User, Server, Zap, Globe, X } from 'lucide-react';
// import { getModels } from '@/services/llm';

const getModels = async () => {
  try {
    console.log('[AgentSelector] Loading models...');
    console.log('[AgentSelector] API client info:', uaipAPI.getEnvironmentInfo());
    
    const response = await uaipAPI.llm.getModels();
    console.log('[AgentSelector] Models response:', response);
    
    // The response is already the models array from the backend
    const models = Array.isArray(response) ? response : (response.data || []);
    console.log('[AgentSelector] Models loaded:', models);
    
    return models.map(model => ({
      id: model.id,
      name: model.name,
      description: model.description,
      source: model.source,
      apiEndpoint: model.apiEndpoint,
      apiType: model.apiType,
      provider: model.provider
    }));
  } catch (error) {
    console.error('Failed to fetch models:', error);
    return [];
  }
};

// Helper function to create a short server identifier
const getServerIdentifier = (baseUrl: string): string => {
  try {
    const url = new URL(baseUrl);
    const hostname = url.hostname;
    const port = url.port;
    
    // If it's localhost, use port to differentiate
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return port ? `localhost:${port}` : 'localhost';
    }
    
    // For IP addresses, use last octet + port
    if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
      const lastOctet = hostname.split('.').pop();
      return port ? `${lastOctet}:${port}` : `.${lastOctet}`;
    }
    
    // For hostnames, use first part + port
    const hostPart = hostname.split('.')[0];
    return port ? `${hostPart}:${port}` : hostPart;
  } catch {
    // Fallback: use last part of URL
    return baseUrl.split('/').pop() || baseUrl.substring(0, 10);
  }
};

// Helper function to group models by server
const groupModelsByServer = (models: ModelOption[]) => {
  const grouped: Record<string, ModelOption[]> = {};
  
  // Add comprehensive null/undefined checks
  if (!models || !Array.isArray(models) || models.length === 0) {
    return grouped;
  }
  
  models.forEach(model => {
    // Ensure model has required properties
    if (!model || !model.id) {
      console.warn('Invalid model object:', model);
      return;
    }
    
    // Create a more robust server key
    const apiType = model.apiType || 'unknown';
    const source = model.source || 'local';
    const serverKey = `${apiType}:${source}`;
    
    if (!grouped[serverKey]) {
      grouped[serverKey] = [];
    }
    grouped[serverKey].push(model);
  });
  
  return grouped;
};

// Helper function to get server display name
const getServerDisplayName = (serverKey: string, source?: string): string => {
  const [apiType, baseUrl] = serverKey.split(':');
  if (!apiType) return 'Unknown Service';
  
  const serviceName = apiType === 'ollama' ? 'Ollama' : 'LLM Studio';
  
  if (!baseUrl || baseUrl === 'local' || baseUrl === 'unknown') {
    return serviceName;
  }
  
  const serverInfo = getServerIdentifier(baseUrl);
  return `${serviceName} (${serverInfo})`;
};

// Helper function to get server icon
const getServerIcon = (apiType: string) => {
  if (!apiType) return Server;
  return apiType === 'ollama' ? Globe : Server;
};

// Modal component for Add Agent flow
interface AddAgentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddAgent: (persona: PersonaDisplay) => Promise<void>;
  availableModels: ModelOption[];
  isLoadingModels: boolean;
  modelError: string | null;
  agentName: string;
  setAgentName: (name: string) => void;
  selectedModelId: string;
  setSelectedModelId: (id: string) => void;
  onRetryLoadModels: () => void;
}

const AddAgentModal: React.FC<AddAgentModalProps> = ({
  isOpen,
  onClose,
  onAddAgent,
  availableModels,
  isLoadingModels,
  modelError,
  agentName,
  setAgentName,
  selectedModelId,
  setSelectedModelId,
  onRetryLoadModels
}) => {
  const [showPersonaSelector, setShowPersonaSelector] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const groupedModels = groupModelsByServer(availableModels);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setShowPersonaSelector(false);
      setIsCreating(false);
    }
  }, [isOpen]);

  const handleAddAgent = async (persona: PersonaDisplay) => {
    if (!agentName.trim()) {
      alert('Please enter an agent name');
      return;
    }

    if (!selectedModelId) {
      alert('Please select a model');
      return;
    }

    setIsCreating(true);
    try {
      await onAddAgent(persona);
      setShowPersonaSelector(false);
      onClose();
    } catch (error) {
      console.error('Failed to create agent:', error);
      alert('Failed to create agent. Please try again.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleClose = () => {
    if (!isCreating) {
      setShowPersonaSelector(false);
      onClose();
    }
  };

  const canProceed = agentName.trim() && selectedModelId && availableModels.length > 0 && !isCreating;

  if (!isOpen) return null;

  // Validate that selected model exists in available models
  const selectedModelExists = selectedModelId && availableModels?.some(model => model && model.id === selectedModelId);
  const isFormValid = agentName.trim() && selectedModelExists && !isCreating;

  return createPortal(
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-6xl h-[90vh] overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-8 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/25">
              <Plus className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
                {showPersonaSelector ? 'Choose Agent Persona' : 'Create New Agent'}
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                {showPersonaSelector ? 'Select a persona to define your agent\'s behavior and expertise' : 'Configure your AI agent\'s name and language model'}
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            disabled={isCreating}
            className="p-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="flex-1 p-8 overflow-y-auto">
          {!showPersonaSelector ? (
            <div className="max-w-2xl mx-auto space-y-8">
              <div>
                <label htmlFor="modalAgentName" className="block text-base font-semibold text-slate-700 dark:text-slate-300 mb-4">
                  Agent Name
                </label>
                <input
                  id="modalAgentName"
                  type="text"
                  value={agentName}
                  onChange={(e) => setAgentName(e.target.value)}
                  disabled={isCreating}
                  className="w-full px-6 py-4 bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 text-xl disabled:opacity-50 disabled:cursor-not-allowed"
                  placeholder="Enter a unique agent name"
                  autoFocus
                />
              </div>
              
              <div>
                <label htmlFor="modalModelSelect" className="block text-base font-semibold text-slate-700 dark:text-slate-300 mb-4">
                  Language Model
                </label>
                {isLoadingModels ? (
                  <div className="flex items-center space-x-4 p-6 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-xl border border-blue-200 dark:border-blue-800">
                    <div className="w-6 h-6 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin"></div>
                    <span className="text-base font-medium text-blue-700 dark:text-blue-300">Discovering available models...</span>
                  </div>
                ) : modelError ? (
                  <div className="flex items-center space-x-4 p-6 bg-gradient-to-r from-red-50 to-pink-50 dark:from-red-900/20 dark:to-pink-900/20 border border-red-200 dark:border-red-800 rounded-xl">
                    <AlertCircle className="w-6 h-6 text-red-500 flex-shrink-0" />
                    <div className="flex-1">
                      <span className="text-base font-medium text-red-700 dark:text-red-300 block">{modelError}</span>
                      <button
                        onClick={onRetryLoadModels}
                        disabled={isLoadingModels}
                        className="mt-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isLoadingModels ? 'Retrying...' : 'Retry'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <select
                    id="modalModelSelect"
                    value={selectedModelId}
                    onChange={(e) => setSelectedModelId(e.target.value)}
                    disabled={availableModels.length === 0 || isCreating}
                    className="w-full px-6 py-4 bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 text-xl disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <option value="">Select a model...</option>
                    {Object.entries(groupedModels).map(([serverKey, models]) => {
                      // Skip empty groups
                      if (!models || models.length === 0) {
                        return null;
                      }
                      
                      const [apiType] = serverKey.split(':');
                      const serverDisplayName = getServerDisplayName(serverKey, models[0]?.source);
                      
                      return (
                        <optgroup 
                          key={serverKey} 
                          label={`🖥️ ${serverDisplayName}`}
                        >
                          {models.map(model => {
                            // Ensure model is valid
                            if (!model || !model.id) {
                              return null;
                            }
                            
                            // Extract model name more safely
                            let modelName = model.name || model.id;
                            if (model.id.includes(':')) {
                              const parts = model.id.split(':');
                              modelName = parts[parts.length - 1] || model.id;
                            }
                            
                            const serverIdentifier = model.source ? getServerIdentifier(model.source) : 'local';
                            const serviceIcon = apiType === 'ollama' ? '🌐' : '🖥️';
                            
                            return (
                              <option key={model.id} value={model.id}>
                                {modelName} • {serviceIcon} {serverIdentifier}
                              </option>
                            );
                          })}
                        </optgroup>
                      );
                    })}
                  </select>
                )}
              </div>
            </div>
          ) : (
            <div className="h-full">
              <PersonaSelector 
                onSelectPersona={handleAddAgent} 
                disabled={isCreating}
              />
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex justify-end space-x-4 p-8 border-t border-slate-200 dark:border-slate-700 flex-shrink-0">
          {!showPersonaSelector ? (
            <>
              <button
                onClick={handleClose}
                disabled={isCreating}
                className="px-8 py-3 text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all duration-200 font-medium text-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={() => setShowPersonaSelector(true)}
                disabled={!isFormValid}
                className={`px-8 py-3 rounded-xl font-semibold text-lg transition-all duration-300 flex items-center space-x-3 ${
                  isFormValid
                    ? 'bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 hover:from-blue-700 hover:via-purple-700 hover:to-indigo-700 text-white shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50 hover:scale-[1.02]' 
                    : 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400 cursor-not-allowed'
                }`}
                title={!isFormValid ? 'Please enter a name and select a valid model' : 'Choose a persona for your agent'}
              >
                {isCreating ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Creating...</span>
                  </>
                ) : (
                  <>
                    <Zap className="w-5 h-5" />
                    <span>Choose Persona</span>
                  </>
                )}
              </button>
            </>
          ) : (
            <button
              onClick={() => setShowPersonaSelector(false)}
              disabled={isCreating}
              className="px-8 py-3 text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all duration-200 font-medium text-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              ← Back to Configuration
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export const AgentSelector: React.FC = () => {
  const { agents, addAgent, removeAgent } = useAgents();
  const discussion = useDiscussion();

  const [showAddModal, setShowAddModal] = useState(false);
  const [agentName, setAgentName] = useState('');
  const [selectedModelId, setSelectedModelId] = useState<string>('');
  
  // Local model management state
  const [availableModels, setAvailableModels] = useState<ModelOption[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);

  // Load models when component mounts
  useEffect(() => {
    loadModels();
    loadExistingAgents();
  }, []);

  const loadModels = async () => {
    setModelsLoading(true);
    setModelsError(null);
    
    try {
      const models = await getModels();
      setAvailableModels(models);
      
      // Set default model if none selected and models are available
      if (models.length > 0 && !selectedModelId) {
        const firstValidModel = models.find(model => model && model.id);
        if (firstValidModel) {
          setSelectedModelId(firstValidModel.id);
        }
      }
    } catch (error) {
      console.error('Failed to load models:', error);
      setModelsError(error instanceof Error ? error.message : 'Failed to load models');
      setAvailableModels([]);
    } finally {
      setModelsLoading(false);
    }
  };

  const loadExistingAgents = async () => {
    try {
      console.log('Loading existing agents from API...');
      const apiResponse = await uaipAPI.client.agents.list();
      
      if (apiResponse.success && apiResponse.data) {
        console.log('Loaded agents from API:', apiResponse.data);
        
        // Convert backend agents to frontend AgentState objects
        const frontendAgents = apiResponse.data.map(backendAgent => {
          return createAgentStateFromBackend(backendAgent);
        });

        // Add all loaded agents to the context
        frontendAgents.forEach(agent => {
          addAgent(agent);
        });

        console.log(`Loaded ${frontendAgents.length} agents from API`);
      } else {
        console.warn('Failed to load agents from API:', apiResponse.error?.message);
      }
    } catch (error) {
      console.warn('Error loading existing agents:', error);
      // Don't throw error here, just log it - the component should still work without existing agents
    }
  };

  // Set default model when models are loaded
  useEffect(() => {
    if (availableModels && availableModels.length > 0 && !selectedModelId) {
      // Find the first valid model
      const firstValidModel = availableModels.find(model => model && model.id);
      if (firstValidModel) {
        setSelectedModelId(firstValidModel.id);
      }
    }
  }, [availableModels, selectedModelId]);

  const handleCreateAgent = async (persona: PersonaDisplay) => {
    if (!agentName.trim()) {
      throw new Error('Please enter an agent name');
    }

    if (!selectedModelId) {
      throw new Error('Please select a model');
    }

    // Validate that the selected model still exists in available models
    const selectedModel = availableModels?.find(m => m.id === selectedModelId);
    if (!selectedModel) {
      throw new Error('Selected model is no longer available');
    }

    console.log('Creating agent with persona:', persona);

    try {
      // Map persona role to valid backend role enum
      const mapPersonaRoleToBackendRole = (personaRole: string): 'assistant' | 'analyzer' | 'orchestrator' | 'specialist' => {
        const roleMapping: Record<string, 'assistant' | 'analyzer' | 'orchestrator' | 'specialist'> = {
          'assistant': 'assistant',
          'analyzer': 'analyzer',
          'orchestrator': 'orchestrator',
          'specialist': 'specialist',
          // Map common persona roles to backend roles
          'software engineer': 'specialist',
          'business analyst': 'analyzer',
          'project manager': 'orchestrator',
          'data scientist': 'analyzer',
          'product manager': 'orchestrator',
          'technical lead': 'specialist',
          'consultant': 'specialist',
          'researcher': 'analyzer',
          'facilitator': 'orchestrator',
          'expert': 'specialist'
        };
        
        const normalizedRole = (personaRole || 'assistant').toLowerCase();
        return roleMapping[normalizedRole] || 'assistant';
      };

      // Get selected model info for API type detection
      const selectedModel = availableModels?.find(m => m.id === selectedModelId);
      
      // Try the simplest approach: just provide personaId and modelId
      const apiAgentData = {
        name: agentName.trim(),
        role: mapPersonaRoleToBackendRole(persona.role || 'assistant'),
        personaId: persona.id, // Use persona ID if available, fallback to default
        description: persona.description || persona.background || `AI agent with ${persona.name} persona`,
        capabilities: persona.expertise && persona.expertise.length > 0 ? persona.expertise : ['general_assistance'],
        
        // Model configuration
        modelId: selectedModelId,
        apiType: selectedModel?.apiType || 'ollama',
        
        configuration: {
          model: selectedModelId,
          temperature: 0.7,
          analysisDepth: 'intermediate' as const,
          contextWindowSize: 4096,
          decisionThreshold: 0.7,
          learningEnabled: true,
          collaborationMode: 'collaborative' as const
        },
        
        intelligenceConfig: {
          analysisDepth: 'intermediate' as const,
          contextWindowSize: 4096,
          decisionThreshold: 0.7,
          learningEnabled: true,
          collaborationMode: 'collaborative' as const
        },
        securityContext: {
          securityLevel: 'medium' as const,
          allowedCapabilities: persona.expertise && persona.expertise.length > 0 ? persona.expertise : ['general_assistance'],
          approvalRequired: false,
          auditLevel: 'standard' as const
        },
        isActive: true,
        createdBy: 'frontend-user' // TODO: Get actual user ID from auth context
      };

      console.log('Creating agent via API:', apiAgentData);
      const apiResponse = await uaipAPI.client.agents.create(apiAgentData);

      if (!apiResponse.success || !apiResponse.data) {
        throw new Error(apiResponse.error?.message || 'Failed to create agent via API');
      }

      const backendAgent = apiResponse.data;
      console.log('Agent created via API:', backendAgent);

      // Convert the backend response to a complete AgentState
      const finalAgentState = createAgentStateFromBackend(backendAgent);

      console.log('Created frontend agent state:', finalAgentState);

      // Add to local context
      addAgent(finalAgentState);
      
      // Reset form
      setAgentName('');
      
      // Sync with backend (discussion context)
      try {
        await discussion.syncWithBackend();
      } catch (error) {
        console.warn('Failed to sync with backend:', error);
      }

      console.log('Agent creation completed successfully');
    } catch (error) {
      console.error('Failed to create agent:', error);
      throw error;
    }
  };

  const handleRemoveAgent = async (id: string) => {
    try {
      // First, try to delete from backend API
      console.log('Deleting agent from API:', id);
      const apiResponse = await uaipAPI.client.agents.delete(id);
      
      if (!apiResponse.success) {
        console.warn('Failed to delete agent from API:', apiResponse.error?.message);
        // Continue with local removal even if API fails
      } else {
        console.log('Agent deleted from API successfully');
      }
    } catch (error) {
      console.warn('Error deleting agent from API:', error);
      // Continue with local removal even if API fails
    }

    // Remove from local context
    removeAgent(id);
    
    // Try to sync removal with backend (discussion context)
    try {
      await discussion.syncWithBackend();
    } catch (error) {
      console.warn('Failed to sync agent removal with backend:', error);
    }
  };

  const handleOpenModal = () => {
    setAgentName('');
    
    // Set default model more robustly
    if (availableModels && availableModels.length > 0) {
      const firstValidModel = availableModels.find(model => model && model.id);
      if (firstValidModel) {
        setSelectedModelId(firstValidModel.id);
      } else {
        setSelectedModelId('');
      }
    } else {
      setSelectedModelId('');
    }
    
    setShowAddModal(true);
  };

  const agentCount = Object.values(agents).length;
  const maxAgents = 10;
  const groupedModels = groupModelsByServer(availableModels);

  return (
    <div className="p-3 space-y-6">
      {/* Enhanced Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-gradient-to-br from-purple-500 via-purple-600 to-pink-600 rounded-xl flex items-center justify-center shadow-lg shadow-purple-500/25">
            <Users className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-sm text-slate-600 dark:text-slate-400">Manage discussion participants</p>
          </div>
        </div>
        
        <div className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-700 rounded-full shadow-inner">
          <div className="w-2 h-2 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full"></div>
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">{agentCount}/{maxAgents}</span>
        </div>
      </div>
      
      {/* Enhanced agents list */}
      <div className="space-y-4">
        {agentCount > 0 ? (
          Object.values(agents).map((agent) => {

            const modelInfo = availableModels?.find(m => m && m.id === agent.modelId);
            console.log(JSON.stringify(modelInfo));
            const serverName = modelInfo?.source ? getServerIdentifier(modelInfo.source) : 'Unknown';
            const ServiceIcon = modelInfo ? getServerIcon(modelInfo.apiType) : Cpu;
            
            // Extract model name more safely
            let modelName = 'Unknown Model';
            if (modelInfo) {
              modelName = modelInfo.name || agent.modelId;
              if (agent.modelId.includes(':')) {
                const parts = agent.modelId.split(':');
                modelName = parts[parts.length - 1] || agent.modelId;
              }
            } else if (agent.modelId) {
              // Fallback: use the model ID if model info is not available
              if (agent.modelId.includes(':')) {
                const parts = agent.modelId.split(':');
                modelName = parts[parts.length - 1] || agent.modelId;
              } else {
                modelName = agent.modelId;
              }
            }
            
            return (
              <div 
                key={agent.id} 
                className="group relative p-5 bg-gradient-to-r from-white via-white to-slate-50 dark:from-slate-800 dark:via-slate-800 dark:to-slate-700 border border-slate-200 dark:border-slate-600 rounded-2xl hover:shadow-xl hover:shadow-slate-200/40 dark:hover:shadow-slate-900/40 transition-all duration-300 hover:-translate-y-1"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4 flex-1 min-w-0">
                    <div className="relative flex-shrink-0">
                      <div className="w-12 h-12 bg-gradient-to-br from-blue-500 via-purple-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/25">
                        <Bot className="w-6 h-6 text-white" />
                      </div>
                      <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 border-2 border-white dark:border-slate-800 rounded-full"></div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-lg text-slate-900 dark:text-white truncate mb-1">{agent.name}</div>
                      <div className="flex flex-col space-y-2">
                        <div className="flex items-center space-x-2">
                          <span className="inline-flex items-center px-3 py-1 bg-gradient-to-r from-blue-100 to-indigo-100 dark:from-blue-900/30 dark:to-indigo-900/30 text-blue-700 dark:text-blue-300 text-sm rounded-full font-semibold border border-blue-200 dark:border-blue-800">
                            {agent.role}
                          </span>
                          {agent.personaId && (
                            <span className="inline-flex items-center px-2 py-1 bg-gradient-to-r from-purple-100 to-pink-100 dark:from-purple-900/30 dark:to-pink-900/30 text-purple-700 dark:text-purple-300 text-xs rounded-full font-medium border border-purple-200 dark:border-purple-800">
                              {agent.persona?.name}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center space-x-2 px-3 py-2 bg-slate-100 dark:bg-slate-700 rounded-lg w-fit">
                          <ServiceIcon className="w-4 h-4 text-slate-600 dark:text-slate-400 flex-shrink-0" />
                          <div className="flex flex-col min-w-0">
                            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 truncate" title={modelName}>
                              {modelName && modelName.length > 20 ? `${modelName.substring(0, 20)}...` : modelName}
                            </span>
                            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                              {modelInfo?.apiType === 'ollama' ? '🌐' : '🖥️'} {serverName}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <button
                    onClick={() => handleRemoveAgent(agent.id)}
                    className="opacity-0 group-hover:opacity-100 p-2 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-all duration-200 hover:scale-110 flex-shrink-0"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            );
          })
        ) : (
          <div className="text-center py-16">
            <div className="relative w-24 h-24 bg-gradient-to-br from-blue-100 via-purple-50 to-indigo-100 dark:from-blue-900/20 dark:via-purple-900/10 dark:to-indigo-900/20 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-lg border-2 border-dashed border-blue-200 dark:border-blue-700/50 animate-pulse">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-purple-500/10 rounded-3xl animate-pulse"></div>
              <div className="relative flex items-center justify-center">
                <Bot className="w-8 h-8 text-blue-500 dark:text-blue-400 animate-bounce" style={{ animationDelay: '0s' }} />
                <User className="w-6 h-6 text-purple-500 dark:text-purple-400 ml-1 animate-bounce" style={{ animationDelay: '0.2s' }} />
                <div className="absolute -top-1 -right-1 w-3 h-3 bg-gradient-to-r from-emerald-400 to-green-500 rounded-full animate-ping"></div>
              </div>
            </div>
            <div className="space-y-3">
              <h3 className="text-slate-700 dark:text-slate-200 font-bold text-xl">No agents added yet</h3>
              <p className="text-slate-500 dark:text-slate-400 leading-relaxed max-w-sm mx-auto">
                Create your first AI agent to begin collaborative discussions and unlock the power of multi-agent conversations
              </p>
              <div className="flex items-center justify-center gap-2 mt-4">
                <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
                <div className="w-2 h-2 bg-purple-400 rounded-full animate-pulse" style={{ animationDelay: '0.5s' }}></div>
                <div className="w-2 h-2 bg-indigo-400 rounded-full animate-pulse" style={{ animationDelay: '1s' }}></div>
              </div>
            </div>
          </div>
        )}
      </div>
      
      {/* Enhanced add new agent button */}
      {agentCount < maxAgents && (
        <div className="border-t border-slate-200/60 dark:border-slate-700/60 pt-8">
          <div className="text-center space-y-6">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-600/20 via-purple-600/20 to-indigo-600/20 rounded-2xl blur-xl"></div>
              <div className="relative bg-gradient-to-br from-white via-blue-50/30 to-purple-50/30 dark:from-slate-800 dark:via-blue-900/10 dark:to-purple-900/10 rounded-2xl p-6 border border-blue-200/50 dark:border-blue-700/30">
                <div className="flex items-center justify-center mb-4">
                  <div className="relative">
                    <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg animate-pulse">
                      <Plus className="w-8 h-8 text-white" />
                    </div>
                    <div className="absolute -top-1 -right-1 w-6 h-6 bg-gradient-to-r from-emerald-400 to-green-500 rounded-full flex items-center justify-center animate-bounce">
                      <Plus className="w-3 h-3 text-white" />
                    </div>
                  </div>
                </div>
                <h3 className="font-bold text-xl text-slate-900 dark:text-white mb-2">Add New Agent</h3>
                <p className="text-slate-600 dark:text-slate-400 mb-6">Create an AI agent to join the discussion</p>
                
                <button
                  onClick={handleOpenModal}
                  disabled={modelsLoading}
                  className="group relative px-8 py-4 bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 hover:from-blue-700 hover:via-purple-700 hover:to-indigo-700 text-white rounded-xl font-semibold text-lg transition-all duration-300 flex items-center space-x-3 mx-auto shadow-xl shadow-blue-500/30 hover:shadow-blue-500/50 hover:scale-[1.05] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
                  {modelsLoading ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>Loading Models...</span>
                    </>
                  ) : (
                    <>
                      <div className="relative">
                        <Plus className="w-5 h-5 group-hover:rotate-90 transition-transform duration-300" />
                      </div>
                      <span>Create Agent</span>
                      <div className="w-2 h-2 bg-white/60 rounded-full animate-pulse"></div>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Agent Modal */}
      <AddAgentModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onAddAgent={handleCreateAgent}
        availableModels={availableModels}
        isLoadingModels={modelsLoading}
        modelError={modelsError}
        agentName={agentName}
        setAgentName={setAgentName}
        selectedModelId={selectedModelId}
        setSelectedModelId={setSelectedModelId}
        onRetryLoadModels={loadModels}
      />
      
      {/* Enhanced status indicators */}
      {agentCount >= maxAgents && (
        <div className="flex items-center space-x-3 p-4 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border border-amber-200 dark:border-amber-800 rounded-xl">
          <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
          <div>
            <span className="text-sm font-semibold text-amber-700 dark:text-amber-300 block">
              Maximum agents reached
            </span>
            <span className="text-xs text-amber-600 dark:text-amber-400">
              Remove an agent to add a new one (limit: {maxAgents})
            </span>
          </div>
        </div>
      )}
      
      {agentCount >= 2 && (
        <div className="flex items-center space-x-3 p-4 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border border-green-200 dark:border-green-800 rounded-xl">
          <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0" />
          <div>
            <span className="text-sm font-semibold text-green-700 dark:text-green-300 block">
              Ready for collaboration!
            </span>
            <span className="text-xs text-green-600 dark:text-green-400">
              You can now start multi-agent discussions
            </span>
          </div>
        </div>
      )}

      {/* Model loading error */}
      {modelsError && (
        <div className="flex items-center space-x-3 p-4 bg-gradient-to-r from-red-50 to-pink-50 dark:from-red-900/20 dark:to-pink-900/20 border border-red-200 dark:border-red-800 rounded-xl">
          <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0" />
          <div className="flex-1">
            <span className="text-sm font-semibold text-red-700 dark:text-red-300 block">
              Model Loading Error
            </span>
            <span className="text-xs text-red-600 dark:text-red-400 block">
              {modelsError}
            </span>
            <button
              onClick={loadModels}
              disabled={modelsLoading}
              className="mt-2 px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {modelsLoading ? 'Retrying...' : 'Retry'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}; 