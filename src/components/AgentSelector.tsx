import React, { useState, useEffect } from 'react';
import { useAgents } from '../contexts/AgentContext';
import { PersonaSelector } from './PersonaSelector';
import { AgentState, Persona } from '../types/agent';
import { getModels } from './ModelSelector';
import { Users, Plus, Trash2, Bot, Cpu, AlertCircle, CheckCircle2, User } from 'lucide-react';

interface ModelOption {
  id: string;
  name: string;
  description: string;
  apiEndpoint: string;
  apiType: 'ollama' | 'llmstudio';
}

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

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-pink-600 rounded-lg flex items-center justify-center">
            <Users className="w-4 h-4 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Agents</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">Manage AI discussion participants</p>
          </div>
        </div>
        
        <div className="flex items-center space-x-2 px-3 py-1 bg-slate-100 dark:bg-slate-800 rounded-full">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{agentCount}/{maxAgents}</span>
        </div>
      </div>
      
      {/* Current agents list */}
      <div className="space-y-3">
        {agentCount > 0 ? (
          Object.values(agents).map((agent) => (
            <div 
              key={agent.id} 
              className="group p-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-all duration-200"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                    <Bot className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-slate-900 dark:text-white truncate">{agent.name}</div>
                    <div className="flex items-center space-x-2 mt-1">
                      <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-xs rounded-full font-medium">
                        {agent.role}
                      </span>
                      <div className="flex items-center space-x-1 text-xs text-slate-500 dark:text-slate-400">
                        <Cpu className="w-3 h-3" />
                        <span>{agent.modelId}</span>
                      </div>
                    </div>
                  </div>
                </div>
                
                <button
                  onClick={() => handleRemoveAgent(agent.id)}
                  className="opacity-0 group-hover:opacity-100 p-2 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all duration-200"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <User className="w-8 h-8 text-slate-400" />
            </div>
            <p className="text-slate-500 dark:text-slate-400 font-medium">No agents added yet</p>
            <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">Add agents to begin discussions</p>
          </div>
        )}
      </div>
      
      {/* Add new agent form */}
      {agentCount < maxAgents && (
        <div className="border-t border-slate-200 dark:border-slate-700 pt-6">
          {!showPersonaSelector ? (
            <div className="space-y-4">
              <h3 className="font-medium text-slate-900 dark:text-white flex items-center space-x-2">
                <Plus className="w-4 h-4" />
                <span>Add New Agent</span>
              </h3>
              
              <div className="space-y-4">
                <div>
                  <label htmlFor="agentName" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Agent Name
                  </label>
                  <input
                    id="agentName"
                    type="text"
                    value={agentName}
                    onChange={(e) => setAgentName(e.target.value)}
                    className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                    placeholder="Enter agent name"
                  />
                </div>
                
                <div>
                  <label htmlFor="modelSelect" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Language Model
                  </label>
                  {isLoadingModels ? (
                    <div className="flex items-center space-x-2 p-3 bg-slate-50 dark:bg-slate-800 rounded-xl">
                      <div className="w-4 h-4 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
                      <span className="text-sm text-slate-600 dark:text-slate-400">Loading models...</span>
                    </div>
                  ) : modelError ? (
                    <div className="flex items-center space-x-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
                      <AlertCircle className="w-4 h-4 text-red-500" />
                      <span className="text-sm text-red-700 dark:text-red-300">{modelError}</span>
                    </div>
                  ) : (
                    <select
                      id="modelSelect"
                      value={selectedModelId}
                      onChange={(e) => setSelectedModelId(e.target.value)}
                      className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                      disabled={availableModels.length === 0}
                    >
                      {availableModels.length === 0 ? (
                        <option value="">No models available</option>
                      ) : (
                        availableModels.map(model => (
                          <option key={model.id} value={model.id}>
                            {model.name} ({model.apiType})
                          </option>
                        ))
                      )}
                    </select>
                  )}
                </div>
                
                <button
                  onClick={() => setShowPersonaSelector(true)}
                  disabled={!agentName.trim() || !selectedModelId || availableModels.length === 0}
                  className={`w-full py-3 rounded-xl font-medium transition-all duration-200 flex items-center justify-center space-x-2 ${
                    agentName.trim() && selectedModelId && availableModels.length > 0
                      ? 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 hover:scale-[1.02]' 
                      : 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400 cursor-not-allowed'
                  }`}
                >
                  <Plus className="w-4 h-4" />
                  <span>Select Persona</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-slate-900 dark:text-white">Choose Agent Persona</h3>
                <button
                  onClick={() => setShowPersonaSelector(false)}
                  className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                >
                  Cancel
                </button>
              </div>
              
              <PersonaSelector onSelectPersona={handleAddAgent} />
            </div>
          )}
        </div>
      )}
      
      {/* Information about maximum agents */}
      {agentCount >= maxAgents && (
        <div className="flex items-center space-x-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl">
          <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          <span className="text-sm text-amber-700 dark:text-amber-300 font-medium">
            Maximum of {maxAgents} agents reached
          </span>
        </div>
      )}
      
      {/* Discussion readiness indicator */}
      {agentCount >= 2 && (
        <div className="flex items-center space-x-2 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl">
          <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />
          <span className="text-sm text-green-700 dark:text-green-300 font-medium">
            Ready to start discussion
          </span>
        </div>
      )}
    </div>
  );
}; 