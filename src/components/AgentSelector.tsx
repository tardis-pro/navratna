import React, { useState, useEffect } from 'react';
import { useAgents } from '../contexts/AgentContext';
import { PersonaSelector } from './PersonaSelector';
import { AgentState, Persona } from '../types/agent';
import { getModels } from './ModelSelector';
import { Users, Plus, Trash2, Bot, Cpu, AlertCircle, CheckCircle2, User, Server, Zap, Globe } from 'lucide-react';

interface ModelOption {
  id: string;
  name: string;
  description: string;
  apiEndpoint: string;
  apiType: 'ollama' | 'llmstudio';
  source?: string;
}

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

export const AgentSelector: React.FC = () => {
  const { agents, addAgent, removeAgent } = useAgents();
  const [showPersonaSelector, setShowPersonaSelector] = useState(false);
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

  const handleAddAgent = (persona: Persona) => {
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

    // Create a new agent with the selected persona and model
    const newAgent: AgentState = {
      id: crypto.randomUUID(),
      name: agentName,
      role: persona.role,
      persona: persona.description,
      systemPrompt: persona.systemPrompt,
      modelId: selectedModel.id,
      apiType: selectedModel.apiType,
      isThinking: false,
      currentResponse: null,
      conversationHistory: [],
      error: null,
      temperature: 0.7,
      maxTokens: 2000
    };

    addAgent(newAgent);
    setAgentName('');
    setShowPersonaSelector(false);
  };

  const handleRemoveAgent = (id: string) => {
    removeAgent(id);
  };

  const agentCount = Object.values(agents).length;
  const maxAgents = 4;
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
                        <span className="inline-flex items-center px-3 py-1 bg-gradient-to-r from-blue-100 to-indigo-100 dark:from-blue-900/30 dark:to-indigo-900/30 text-blue-700 dark:text-blue-300 text-sm rounded-full font-semibold border border-blue-200 dark:border-blue-800 w-fit">
                          {agent.role}
                        </span>
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
      
      {/* Enhanced add new agent form */}
      {agentCount < maxAgents && (
        <div className="border-t border-slate-200 dark:border-slate-700 pt-8">
          {!showPersonaSelector ? (
            <div className="space-y-6">
              <h3 className="font-bold text-xl text-slate-900 dark:text-white flex items-center space-x-3">
                <div className="w-8 h-8 bg-gradient-to-br from-green-500 to-emerald-600 rounded-lg flex items-center justify-center">
                  <Plus className="w-4 h-4 text-white" />
                </div>
                <span>Add New Agent</span>
              </h3>
              
              <div className="space-y-5">
                <div>
                  <label htmlFor="agentName" className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
                    Agent Name
                  </label>
                  <input
                    id="agentName"
                    type="text"
                    value={agentName}
                    onChange={(e) => setAgentName(e.target.value)}
                    className="w-full px-4 py-4 bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 text-lg"
                    placeholder="Enter a unique agent name"
                  />
                </div>
                
                <div>
                  <label htmlFor="modelSelect" className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
                    Language Model
                  </label>
                  {isLoadingModels ? (
                    <div className="flex items-center space-x-3 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-xl border border-blue-200 dark:border-blue-800">
                      <div className="w-5 h-5 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin"></div>
                      <span className="text-sm font-medium text-blue-700 dark:text-blue-300">Discovering available models...</span>
                    </div>
                  ) : modelError ? (
                    <div className="flex items-center space-x-3 p-4 bg-gradient-to-r from-red-50 to-pink-50 dark:from-red-900/20 dark:to-pink-900/20 border border-red-200 dark:border-red-800 rounded-xl">
                      <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                      <span className="text-sm font-medium text-red-700 dark:text-red-300">{modelError}</span>
                    </div>
                  ) : (
                    <select
                      id="modelSelect"
                      value={selectedModelId}
                      onChange={(e) => setSelectedModelId(e.target.value)}
                      className="w-full px-4 py-4 bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 text-lg"
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
                              const ServiceIcon = getServerIcon(apiType);
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
                
                <button
                  onClick={() => setShowPersonaSelector(true)}
                  disabled={!agentName.trim() || !selectedModelId || availableModels.length === 0}
                  className={`w-full py-4 rounded-xl font-semibold text-lg transition-all duration-300 flex items-center justify-center space-x-3 ${
                    agentName.trim() && selectedModelId && availableModels.length > 0
                      ? 'bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 hover:from-blue-700 hover:via-purple-700 hover:to-indigo-700 text-white shadow-xl shadow-blue-500/30 hover:shadow-blue-500/50 hover:scale-[1.02] active:scale-[0.98]' 
                      : 'bg-gradient-to-r from-slate-200 to-slate-300 dark:from-slate-700 dark:to-slate-600 text-slate-500 dark:text-slate-400 cursor-not-allowed'
                  }`}
                >
                  <Zap className="w-5 h-5" />
                  <span>Select Persona & Create Agent</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-xl text-slate-900 dark:text-white">Choose Agent Persona</h3>
                <button
                  onClick={() => setShowPersonaSelector(false)}
                  className="px-4 py-2 text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-all duration-200"
                >
                  Cancel
                </button>
              </div>
              
              <PersonaSelector onSelectPersona={handleAddAgent} />
            </div>
          )}
        </div>
      )}
      
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