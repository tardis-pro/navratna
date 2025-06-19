import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAgents } from '../../../contexts/AgentContext';
import { PersonaSelector } from '../../PersonaSelector';
import { AgentState, createAgentStateFromBackend } from '../../../types/agent';
import { Persona } from '../../../types/persona';
import { ModelOption } from '../../ModelSelector';
import { useDiscussion } from '../../../contexts/DiscussionContext';
import { uaipAPI } from '../../../utils/uaip-api';
import { AgentRole } from '@uaip/types';
import { 
  Users, 
  Plus, 
  Trash2, 
  Bot, 
  Cpu, 
  AlertCircle, 
  CheckCircle2, 
  User, 
  Server, 
  Zap, 
  Globe, 
  X,
  Sparkles,
  Brain,
  Network
} from 'lucide-react';

const getModels = async () => {
  try {
    const response = await uaipAPI.llm.getModels();
    const models = Array.isArray(response) ? response : [];
    
    return models.map(model => ({
      id: model.id,
      name: model.name,
      description: model.description,
      source: model.source,
      apiEndpoint: model.apiEndpoint,
      apiType: (model.apiType === 'ollama' || model.apiType === 'llmstudio') 
        ? model.apiType 
        : 'ollama' as const,
      provider: model.provider
    }));
  } catch (error) {
    console.error('Failed to fetch models:', error);
    return [];
  }
};

interface AgentSelectorPortalProps {
  className?: string;
}

export const AgentSelectorPortal: React.FC<AgentSelectorPortalProps> = ({ className }) => {
  const { agents, addAgent, removeAgent } = useAgents();
  const discussion = useDiscussion();

  const [showAddModal, setShowAddModal] = useState(false);
  const [agentName, setAgentName] = useState('');
  const [selectedModelId, setSelectedModelId] = useState<string>('');
  const [availableModels, setAvailableModels] = useState<ModelOption[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);

  useEffect(() => {
    loadModels();
    loadExistingAgents();
    setupDevelopmentAuth();
  }, []);

  const loadModels = async () => {
    setModelsLoading(true);
    setModelsError(null);
    
    try {
      const models = await getModels();
      setAvailableModels(models);
      
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
      const apiResponse = await uaipAPI.client.agents.list();
      
      if (apiResponse.success && apiResponse.data) {
        // Fix: Handle the API response structure properly
        const agentsArray = Array.isArray(apiResponse.data) 
          ? apiResponse.data 
          : (apiResponse.data as any).agents || [];
        
        if (Array.isArray(agentsArray)) {
          const frontendAgents = agentsArray.map(backendAgent => {
            return createAgentStateFromBackend(backendAgent);
          });

          frontendAgents.forEach(agent => {
            addAgent(agent);
          });
          
          console.log(`Loaded ${frontendAgents.length} agents from API`);
        } else {
          console.warn('API response data is not in expected format:', apiResponse.data);
        }
      } else {
        console.warn('Failed to load agents from API:', apiResponse.error?.message);
      }
    } catch (error) {
      console.warn('Error loading existing agents:', error);
    }
  };

  const setupDevelopmentAuth = () => {
    // For development: set up mock authentication if not authenticated
    if (!uaipAPI.client.isAuthenticated() && process.env.NODE_ENV === 'development') {
      console.log('Setting up development authentication...');
      
      // Set a mock auth token for development
      const mockToken = 'dev-token-' + Date.now();
      const mockUserId = 'dev-user-' + Date.now();
      
      uaipAPI.client.setAuthContext({
        token: mockToken,
        userId: mockUserId,
        sessionId: 'dev-session-' + Date.now(),
        rememberMe: false
      });
      
      console.log('Development authentication set up');
    }
  };

  const handleCreateAgent = async (persona: Persona) => {
    if (!agentName.trim() || !selectedModelId) {
      throw new Error('Please enter an agent name and select a model');
    }

    const selectedModel = availableModels?.find(m => m.id === selectedModelId);
    if (!selectedModel) {
      throw new Error('Selected model is no longer available');
    }

    try {
      const mapPersonaRoleToBackendRole = (personaRole: string) => {
        const roleMapping: Record<string, AgentRole> = {
          'assistant': AgentRole.ASSISTANT,
          'analyzer': AgentRole.ANALYZER,
          'orchestrator': AgentRole.ORCHESTRATOR,
          'specialist': AgentRole.SPECIALIST,
          'software engineer': AgentRole.SPECIALIST,
          'business analyst': AgentRole.ANALYZER,
          'project manager': AgentRole.ORCHESTRATOR,
          'data scientist': AgentRole.ANALYZER,
          'product manager': AgentRole.ORCHESTRATOR,
          'technical lead': AgentRole.SPECIALIST,
          'consultant': AgentRole.SPECIALIST,
          'researcher': AgentRole.ANALYZER,
          'facilitator': AgentRole.ORCHESTRATOR,
          'expert': AgentRole.SPECIALIST
        };
        
        const normalizedRole = (personaRole || 'assistant').toLowerCase();
        return roleMapping[normalizedRole] || AgentRole.ASSISTANT;
      };

      const apiAgentData = {
        name: agentName.trim(),
        role: mapPersonaRoleToBackendRole(persona.role || 'assistant'),
        personaId: persona.id,
        description: persona.description || persona.background || `AI agent with ${persona.name} persona`,
        capabilities: persona.expertise && persona.expertise.length > 0 ? persona.expertise : ['general_assistance'],
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
        createdBy: 'frontend-user'
      };

      const apiResponse = await uaipAPI.client.agents.create(apiAgentData);

      if (!apiResponse.success || !apiResponse.data) {
        throw new Error(apiResponse.error?.message || 'Failed to create agent via API');
      }

      const finalAgentState = createAgentStateFromBackend(apiResponse.data);
      addAgent(finalAgentState);
      setAgentName('');
      
      console.log('Agent creation completed successfully');
    } catch (error) {
      console.error('Failed to create agent:', error);
      throw error;
    }
  };

  const handleRemoveAgent = async (id: string) => {
    try {
      const apiResponse = await uaipAPI.client.agents.delete(id);
      
      if (!apiResponse.success) {
        console.warn('Failed to delete agent from API:', apiResponse.error?.message);
      }
    } catch (error) {
      console.warn('Error deleting agent from API:', error);
    }

    removeAgent(id);
    
    console.log('Agent removal completed successfully');
  };

  const agentCount = Object.values(agents).length;
  const maxAgents = 12; // 3x4 grid

  // Create grid with placeholders for empty slots
  const createAgentGrid = () => {
    const agentList = Object.values(agents);
    const gridItems = [];
    
    // Add existing agents
    agentList.forEach((agent: any, index) => {
      gridItems.push({ type: 'agent', agent, index });
    });
    
    // Add one "add new" slot if under limit
    if (agentCount < maxAgents) {
      gridItems.push({ type: 'add', index: agentCount });
    }
    
    // Fill remaining slots with placeholders
    while (gridItems.length < maxAgents) {
      gridItems.push({ type: 'placeholder', index: gridItems.length });
    }
    
    return gridItems;
  };

  const renderAgentCard = (agent: any, index: number) => {
    const modelInfo = availableModels?.find(m => m && m.id === agent.modelId);
    const ServiceIcon = modelInfo ? (modelInfo.apiType === 'ollama' ? Globe : Server) : Cpu;
    
    let modelName = 'Unknown Model';
    if (modelInfo) {
      modelName = modelInfo.name || agent.modelId;
      if (agent.modelId?.includes(':')) {
        const parts = agent.modelId.split(':');
        modelName = parts[parts.length - 1] || agent.modelId;
      }
    } else if (agent.modelId) {
      if (agent.modelId.includes(':')) {
        const parts = agent.modelId.split(':');
        modelName = parts[parts.length - 1] || agent.modelId;
      } else {
        modelName = agent.modelId;
      }
    }

    return (
      <motion.div
        key={agent.id}
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.8 }}
        transition={{ delay: index * 0.05 }}
        className="group relative aspect-square p-4 bg-gradient-to-br from-slate-800/60 via-slate-800/40 to-slate-700/60 backdrop-blur-xl border border-slate-700/50 rounded-2xl hover:border-blue-500/50 transition-all duration-300"
        whileHover={{ scale: 1.05, y: -5 }}
      >
        {/* Glow Effect */}
        <motion.div
          className="absolute inset-0 bg-gradient-to-br from-blue-500/10 via-purple-500/10 to-cyan-500/10 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"
          animate={{ 
            background: [
              'linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(168, 85, 247, 0.1) 50%, rgba(6, 182, 212, 0.1) 100%)',
              'linear-gradient(135deg, rgba(6, 182, 212, 0.1) 0%, rgba(59, 130, 246, 0.1) 50%, rgba(168, 85, 247, 0.1) 100%)',
              'linear-gradient(135deg, rgba(168, 85, 247, 0.1) 0%, rgba(6, 182, 212, 0.1) 50%, rgba(59, 130, 246, 0.1) 100%)'
            ]
          }}
          transition={{ duration: 3, repeat: Infinity }}
        />

        {/* Delete Button */}
        <motion.button
          onClick={() => handleRemoveAgent(agent.id)}
          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-2 text-red-400 hover:text-red-300 hover:bg-red-500/20 rounded-lg transition-all duration-200 z-10"
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
        >
          <X className="w-4 h-4" />
        </motion.button>

        <div className="relative h-full flex flex-col">
          {/* Avatar */}
          <div className="flex justify-center mb-3">
            <div className="relative">
              <motion.div
                className="w-12 h-12 bg-gradient-to-br from-blue-500 via-purple-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/25"
                whileHover={{ rotate: 5 }}
              >
                <Bot className="w-6 h-6 text-white" />
              </motion.div>
              <motion.div
                className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 border-2 border-slate-800 rounded-full"
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
            </div>
          </div>
          
          {/* Name */}
          <div className="text-center mb-2">
            <h4 className="font-bold text-sm text-white truncate" title={agent.name}>
              {agent.name}
            </h4>
          </div>
          
          {/* Role & Persona */}
          <div className="flex flex-col gap-2 mb-3">
            <motion.span
              className="inline-flex items-center justify-center px-2 py-1 bg-gradient-to-r from-blue-500/20 to-indigo-500/20 text-blue-300 text-xs rounded-full font-semibold border border-blue-500/30"
              whileHover={{ scale: 1.05 }}
            >
              {agent.role}
            </motion.span>
            {agent.personaId && (
              <motion.span
                className="inline-flex items-center justify-center px-2 py-1 bg-gradient-to-r from-purple-500/20 to-pink-500/20 text-purple-300 text-xs rounded-full font-medium border border-purple-500/30"
                whileHover={{ scale: 1.05 }}
                title={agent.persona?.name}
              >
                {agent.persona?.name && agent.persona.name.length > 10 
                  ? `${agent.persona.name.substring(0, 10)}...` 
                  : agent.persona?.name}
              </motion.span>
            )}
          </div>
          
          {/* Model Info */}
          <div className="mt-auto">
            <motion.div
              className="flex items-center gap-2 px-2 py-1.5 bg-slate-700/50 rounded-lg border border-slate-600/30"
              whileHover={{ borderColor: 'rgba(59, 130, 246, 0.5)' }}
            >
              <ServiceIcon className="w-4 h-4 text-slate-400 flex-shrink-0" />
              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-xs font-semibold text-slate-300 truncate" title={modelName}>
                  {modelName && modelName.length > 12 ? `${modelName.substring(0, 12)}...` : modelName}
                </span>
                <span className="text-xs text-slate-500">
                  {modelInfo?.apiType === 'ollama' ? '🌐' : '🖥️'}
                </span>
              </div>
            </motion.div>
          </div>
        </div>
      </motion.div>
    );
  };

  const renderAddCard = (index: number) => (
    <motion.div
      key="add-new"
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: index * 0.05 }}
      className="aspect-square p-4 bg-gradient-to-br from-slate-800/30 via-blue-900/10 to-purple-900/10 backdrop-blur-xl rounded-2xl border-2 border-dashed border-blue-500/30 hover:border-blue-400/50 transition-all duration-300"
    >
      <motion.button
        onClick={() => setShowAddModal(true)}
        disabled={modelsLoading}
        className="w-full h-full flex flex-col items-center justify-center gap-3 text-blue-400 hover:text-blue-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        {modelsLoading ? (
          <>
            <motion.div
              className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full"
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity }}
            />
            <span className="text-sm font-medium">Loading...</span>
          </>
        ) : (
          <>
            <motion.div
              className="w-12 h-12 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-xl flex items-center justify-center border border-blue-500/30"
              whileHover={{ rotate: 5 }}
            >
              <Plus className="w-6 h-6" />
            </motion.div>
            <span className="text-sm font-medium">Add Agent</span>
          </>
        )}
      </motion.button>
    </motion.div>
  );

  const renderPlaceholderCard = (index: number) => (
    <motion.div
      key={`placeholder-${index}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: index * 0.02 }}
      className="aspect-square p-4 bg-gradient-to-br from-slate-900/20 to-slate-800/20 backdrop-blur-sm rounded-2xl border border-slate-800/50"
    >
      <div className="w-full h-full flex items-center justify-center">
        <motion.div
          className="w-8 h-8 bg-slate-700/30 rounded-lg flex items-center justify-center"
          animate={{ opacity: [0.3, 0.6, 0.3] }}
          transition={{ duration: 2, repeat: Infinity, delay: index * 0.1 }}
        >
          <Bot className="w-4 h-4 text-slate-600" />
        </motion.div>
      </div>
    </motion.div>
  );

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div className="flex items-center gap-4">
          <motion.div
            className="w-12 h-12 bg-gradient-to-br from-purple-500 via-purple-600 to-pink-600 rounded-xl flex items-center justify-center shadow-lg shadow-purple-500/25"
            whileHover={{ scale: 1.05 }}
            animate={{ 
              boxShadow: [
                '0 10px 30px rgba(168, 85, 247, 0.25)',
                '0 10px 30px rgba(168, 85, 247, 0.5)',
                '0 10px 30px rgba(168, 85, 247, 0.25)'
              ]
            }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <Users className="w-6 h-6 text-white" />
          </motion.div>
          <div>
            <h3 className="text-xl font-bold text-white">Agent Matrix</h3>
            <p className="text-sm text-slate-400">neural network participants</p>
          </div>
        </div>
        
        <motion.div
          className="flex items-center gap-3 px-4 py-2 bg-gradient-to-r from-slate-800/50 to-slate-900/50 backdrop-blur-xl rounded-full border border-slate-700/50"
          whileHover={{ borderColor: 'rgba(168, 85, 247, 0.5)' }}
        >
          <motion.div
            className="w-3 h-3 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full"
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
          <span className="text-sm font-semibold text-slate-300">{agentCount}/{maxAgents}</span>
        </motion.div>
      </motion.div>
      
      {/* Agent Grid */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="grid grid-cols-3 gap-4"
      >
        <AnimatePresence>
          {createAgentGrid().map((item, index) => {
            if (item.type === 'agent') {
              return renderAgentCard(item.agent, index);
            } else if (item.type === 'add') {
              return renderAddCard(index);
            } else {
              return renderPlaceholderCard(index);
            }
          })}
        </AnimatePresence>
      </motion.div>

      {/* Status Indicators */}
      <AnimatePresence>
        {agentCount >= maxAgents && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-center gap-3 p-4 bg-gradient-to-r from-amber-900/30 to-orange-900/30 border border-amber-500/30 rounded-xl backdrop-blur-sm"
          >
            <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0" />
            <div>
              <span className="text-amber-300 font-semibold block">
                Neural Network at Capacity
              </span>
              <span className="text-amber-400/80 text-sm">
                Remove an agent to spawn a new entity (limit: {maxAgents})
              </span>
            </div>
          </motion.div>
        )}
        
        {agentCount >= 2 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-center gap-3 p-4 bg-gradient-to-r from-green-900/30 to-emerald-900/30 border border-green-500/30 rounded-xl backdrop-blur-sm"
          >
            <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0" />
            <div>
              <span className="text-green-300 font-semibold block">
                Neural Collective Ready
              </span>
              <span className="text-green-400/80 text-sm">
                Multi-agent consciousness can now be activated
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error Display */}
      {modelsError && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex items-start gap-3 p-4 bg-gradient-to-r from-red-900/30 to-pink-900/30 border border-red-500/30 rounded-xl backdrop-blur-sm"
        >
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-red-300 mb-1">
              Neural Model Loading Error
            </h3>
            <p className="text-sm text-red-400 mb-3">
              {modelsError}
            </p>
            <motion.button
              onClick={loadModels}
              disabled={modelsLoading}
              className="px-3 py-1 bg-red-600/20 hover:bg-red-600/30 text-red-300 text-sm rounded border border-red-500/30 hover:border-red-400/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {modelsLoading ? 'Retrying...' : 'Retry Connection'}
            </motion.button>
          </div>
        </motion.div>
      )}

      {/* Add Agent Modal */}
      <AnimatePresence>
        {showAddModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setShowAddModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl border border-slate-700 p-6 max-w-md w-full max-h-[80vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-white">Spawn New Agent</h3>
                <button
                  onClick={() => setShowAddModal(false)}
                  className="p-2 text-slate-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Agent Name
                  </label>
                  <input
                    type="text"
                    value={agentName}
                    onChange={(e) => setAgentName(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-blue-500"
                    placeholder="Enter agent name..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Model
                  </label>
                  <select
                    value={selectedModelId}
                    onChange={(e) => setSelectedModelId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="">Select a model...</option>
                    {availableModels.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.name || model.id}
                      </option>
                    ))}
                  </select>
                </div>

                <PersonaSelector
                  onPersonaSelect={handleCreateAgent}
                  disabled={!agentName.trim() || !selectedModelId}
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}; 