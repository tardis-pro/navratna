import React, { useState, useEffect } from 'react';
import { useAgents } from '../contexts/AgentContext';
import { PersonaSelector } from './PersonaSelector';
import { AgentState, Persona } from '../types/agent';
import { getModels } from './ModelSelector';

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

  return (
    <div className="space-y-6 bg-white p-6 rounded-lg shadow">
      <h2 className="text-xl font-bold">Agents</h2>
      
      {/* Current agents list */}
      <div className="space-y-4">
        {Object.values(agents).length > 0 ? (
          Object.values(agents).map((agent) => (
            <div 
              key={agent.id} 
              className="flex justify-between items-center p-3 border rounded-lg"
            >
              <div>
                <div className="font-medium">{agent.name}</div>
                <div className="text-sm text-gray-500">
                  {agent.role} • {agent.modelId}
                </div>
              </div>
              <button
                onClick={() => handleRemoveAgent(agent.id)}
                className="text-red-500 hover:text-red-700"
              >
                Remove
              </button>
            </div>
          ))
        ) : (
          <div className="text-gray-500 text-center py-4">
            No agents added yet. Add an agent to begin.
          </div>
        )}
      </div>
      
      {/* Add new agent form */}
      {!showPersonaSelector ? (
        <div className="space-y-4">
          <div>
            <label htmlFor="agentName" className="block text-sm font-medium mb-1">
              Agent Name
            </label>
            <input
              id="agentName"
              type="text"
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
              className="w-full px-3 py-2 border rounded-md"
              placeholder="Enter agent name"
            />
          </div>
          
          <div>
            <label htmlFor="modelSelect" className="block text-sm font-medium mb-1">
              Language Model
            </label>
            {isLoadingModels ? (
              <div className="text-sm text-gray-500">Loading models...</div>
            ) : modelError ? (
              <div className="text-sm text-red-500">{modelError}</div>
            ) : (
              <select
                id="modelSelect"
                value={selectedModelId}
                onChange={(e) => setSelectedModelId(e.target.value)}
                className="w-full px-3 py-2 border rounded-md"
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
            className={`w-full py-2 rounded-md ${
              agentName.trim() && selectedModelId && availableModels.length > 0
                ? 'bg-blue-500 text-white hover:bg-blue-600' 
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            Select Persona
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <PersonaSelector onSelectPersona={handleAddAgent} />
          
          <button
            onClick={() => setShowPersonaSelector(false)}
            className="w-full py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
          >
            Cancel
          </button>
        </div>
      )}
      
      {/* Information about maximum agents */}
      {Object.keys(agents).length >= 4 && (
        <div className="text-sm text-yellow-600">
          Maximum of 4 agents reached.
        </div>
      )}
    </div>
  );
}; 