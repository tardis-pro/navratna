import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAgents } from '../contexts/AgentContext';
import { PersonaSelector } from './PersonaSelector';
import { AgentState } from '../types/agent';
import { Persona } from '../types/persona';
import { getModels, ModelOption } from './ModelSelector';
import { Users, Plus, Trash2, Bot, Cpu, AlertCircle, CheckCircle2, User, Server, Zap, Globe, X } from 'lucide-react';

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
  
  models.forEach(model => {
    const serverKey = model.source ? `${model.apiType}:${model.source}` : 'unknown';
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
  const serviceName = apiType === 'ollama' ? 'Ollama' : 'LLM Studio';
  const serverInfo = baseUrl ? getServerIdentifier(baseUrl) : 'Unknown';
  return `${serviceName} (${serverInfo})`;
};

// Helper function to get server icon
const getServerIcon = (apiType: string) => {
  return apiType === 'ollama' ? Globe : Server;
};

// Modal component for Add Agent flow
interface AddAgentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddAgent: (persona: Persona) => void;
  availableModels: ModelOption[];
  isLoadingModels: boolean;
  modelError: string | null;
  agentName: string;
  setAgentName: (name: string) => void;
  selectedModelId: string;
  setSelectedModelId: (id: string) => void;
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
  setSelectedModelId
}) => {
  const [showPersonaSelector, setShowPersonaSelector] = useState(false);
  const groupedModels = groupModelsByServer(availableModels);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setShowPersonaSelector(false);
    }
  }, [isOpen]);

  const handleAddAgent = (persona: Persona) => {
    if (!agentName.trim()) {
      alert('Please enter an agent name');
      return;
    }

    if (!selectedModelId) {
      alert('Please select a model');
      return;
    }

    onAddAgent(persona);
    setShowPersonaSelector(false);
  };

  const handleClose = () => {
    setShowPersonaSelector(false);
    onClose();
  };

  const canProceed = agentName.trim() && selectedModelId && availableModels.length > 0;

  if (!isOpen) return null;

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
            className="p-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all duration-200"
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
                  className="w-full px-6 py-4 bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 text-xl"
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
                    <span className="text-base font-medium text-red-700 dark:text-red-300">{modelError}</span>
                  </div>
                ) : (
                  <select
                    id="modalModelSelect"
                    value={selectedModelId}
                    onChange={(e) => setSelectedModelId(e.target.value)}
                    className="w-full px-6 py-4 bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 text-xl"
                    disabled={availableModels.length === 0}
                  >
                    <option value="">Select a model...</option>
                    {Object.entries(groupedModels).map(([serverKey, models]) => {
                      const [apiType] = serverKey.split(':');
                      const serverDisplayName = getServerDisplayName(serverKey, models[0]?.source);
                      
                      return (
                        <optgroup 
                          key={serverKey} 
                          label={`🖥️ ${serverDisplayName}`}
                        >
                          {models.map(model => {
                            const modelName = model.id.split(':').pop() || model.name;
                            return (
                              <option key={model.id} value={model.id}>
                                {modelName} • {apiType === 'ollama' ? '🌐' : '🖥️'} {getServerIdentifier(model.source || '')}
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
              <PersonaSelector onSelectPersona={handleAddAgent} />
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex justify-end space-x-4 p-8 border-t border-slate-200 dark:border-slate-700 flex-shrink-0">
          {!showPersonaSelector ? (
            <>
              <button
                onClick={handleClose}
                className="px-8 py-3 text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all duration-200 font-medium text-lg"
              >
                Cancel
              </button>
              <button
                onClick={() => setShowPersonaSelector(true)}
                disabled={!canProceed}
                className={`px-8 py-3 rounded-xl font-semibold text-lg transition-all duration-300 flex items-center space-x-3 ${
                  canProceed
                    ? 'bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 hover:from-blue-700 hover:via-purple-700 hover:to-indigo-700 text-white shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50 hover:scale-[1.02]' 
                    : 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400 cursor-not-allowed'
                }`}
              >
                <Zap className="w-5 h-5" />
                <span>Choose Persona</span>
              </button>
            </>
          ) : (
            <button
              onClick={() => setShowPersonaSelector(false)}
              className="px-8 py-3 text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all duration-200 font-medium text-lg"
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
  const [showAddModal, setShowAddModal] = useState(false);
  const [agentName, setAgentName] = useState('');
  const [availableModels, setAvailableModels] = useState<ModelOption[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string>('');
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);

  // Fetch available models on component mount
  useEffect(() => {
    const fetchModels = async () => {
      setIsLoadingModels(true);
      setModelError(null);
      
      try {
        const models = await getModels();
        setAvailableModels(models);
        
        // Set default model if available
        if (models.length > 0) {
          setSelectedModelId(models[0].id);
        }
      } catch (error) {
        setModelError('Failed to load models. Please ensure your LLM servers are running.');
        console.error('Error fetching models:', error);
      } finally {
        setIsLoadingModels(false);
      }
    };
    
    fetchModels();
  }, []);

  const handleCreateAgent = (persona: Persona) => {
    if (!agentName.trim()) {
      alert('Please enter an agent name');
      return;
    }

    if (!selectedModelId) {
      alert('Please select a model');
      return;
    }

    const selectedModel = availableModels.find(model => model.id === selectedModelId);
    
    if (!selectedModel) {
      alert('Invalid model selection');
      return;
    }

    console.log('Creating agent with persona:', persona);

    // Create a new agent with the selected persona and model
    const newAgent: AgentState = {
      id: crypto.randomUUID(),
      name: agentName,
      role: persona.role,
      persona: persona,
      systemPrompt: persona.systemPrompt,
      modelId: selectedModel.id,
      apiType: selectedModel.apiType || 'ollama',
      isThinking: false,
      currentResponse: null,
      conversationHistory: [],
      error: null,
      temperature: 0.7,
      maxTokens: 200
    };

    console.log('Created agent:', newAgent);

    addAgent(newAgent);
    setAgentName('');
    setShowAddModal(false);
  };

  const handleRemoveAgent = (id: string) => {
    removeAgent(id);
  };

  const handleOpenModal = () => {
    setAgentName('');
    if (availableModels.length > 0) {
      setSelectedModelId(availableModels[0].id);
    }
    setShowAddModal(true);
  };

  const agentCount = Object.values(agents).length;
  const maxAgents = 10;
  const groupedModels = groupModelsByServer(availableModels);

  return (
    <div className="p-6 space-y-6">
      {/* Enhanced Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-gradient-to-br from-purple-500 via-purple-600 to-pink-600 rounded-xl flex items-center justify-center shadow-lg shadow-purple-500/25">
            <Users className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">AI Agents</h2>
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
            const modelInfo = availableModels.find(m => m.id === agent.modelId);
            const serverName = modelInfo?.source ? getServerIdentifier(modelInfo.source) : 'Unknown';
            const ServiceIcon = modelInfo ? getServerIcon(modelInfo.apiType) : Cpu;
            const modelName = modelInfo ? agent.modelId.split(':').pop() : agent.modelId;
            
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
                          {agent.persona && (
                            <span className="inline-flex items-center px-2 py-1 bg-gradient-to-r from-purple-100 to-pink-100 dark:from-purple-900/30 dark:to-pink-900/30 text-purple-700 dark:text-purple-300 text-xs rounded-full font-medium border border-purple-200 dark:border-purple-800">
                              {agent.persona.name}
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
            <div className="w-20 h-20 bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-700 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-inner">
              <User className="w-10 h-10 text-slate-400" />
            </div>
            <p className="text-slate-600 dark:text-slate-300 font-semibold text-lg">No agents added yet</p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">Create your first AI agent to begin collaborative discussions</p>
          </div>
        )}
      </div>
      
      {/* Enhanced add new agent button */}
      {agentCount < maxAgents && (
        <div className="border-t border-slate-200 dark:border-slate-700 pt-8">
          <div className="text-center space-y-4">
            <h3 className="font-bold text-xl text-slate-900 dark:text-white">Add New Agent</h3>
            <p className="text-slate-600 dark:text-slate-400 mb-6">Create an AI agent to join the discussion</p>
            <button
              onClick={handleOpenModal}
              className="px-8 py-4 bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 hover:from-blue-700 hover:via-purple-700 hover:to-indigo-700 text-white rounded-xl font-semibold text-lg transition-all duration-300 flex items-center space-x-3 mx-auto shadow-xl shadow-blue-500/30 hover:shadow-blue-500/50 hover:scale-[1.02]"
            >
              <Plus className="w-5 h-5" />
              <span>Create Agent</span>
            </button>
          </div>
        </div>
      )}

      {/* Add Agent Modal */}
      <AddAgentModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onAddAgent={handleCreateAgent}
        availableModels={availableModels}
        isLoadingModels={isLoadingModels}
        modelError={modelError}
        agentName={agentName}
        setAgentName={setAgentName}
        selectedModelId={selectedModelId}
        setSelectedModelId={setSelectedModelId}
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
    </div>
  );
}; 