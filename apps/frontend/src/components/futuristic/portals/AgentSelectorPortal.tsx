import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAgents } from '../../../contexts/AgentContext';
import { PersonaSelector } from '../../PersonaSelector';
import { AgentState, createAgentStateFromBackend } from '../../../types/agent';
import { Persona } from '../../../types/persona';
import { ModelOption } from '../../ModelSelector';
import { useDiscussion } from '../../../contexts/DiscussionContext';
import { uaipAPI } from '../../../utils/uaip-api';
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
    const models = Array.isArray(response) ? response : (response?.data || []);
    
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
        const frontendAgents = apiResponse.data.map(backendAgent => {
          return createAgentStateFromBackend(backendAgent);
        });

        frontendAgents.forEach(agent => {
          addAgent(agent);
        });
      }
    } catch (error) {
      console.warn('Error loading existing agents:', error);
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
        const roleMapping: Record<string, 'assistant' | 'analyzer' | 'orchestrator' | 'specialist'> = {
          'assistant': 'assistant',
          'analyzer': 'analyzer',
          'orchestrator': 'orchestrator',
          'specialist': 'specialist',
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
      
      try {
        if (discussion.syncWithBackend) {
          await discussion.syncWithBackend();
        }
      } catch (error) {
        console.warn('Failed to sync with backend:', error);
      }
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
    
    try {
      if (discussion.syncWithBackend) {
        await discussion.syncWithBackend();
      }
    } catch (error) {
      console.warn('Failed to sync agent removal with backend:', error);
    }
  };

  const agentCount = Object.values(agents).length;
  const maxAgents = 10;

  return (
    <div className={`space-y-6 ${className}`}>
      {/*  Header */}
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
            <p className="text-sm text-slate-400"> network participants</p>
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
      <AnimatePresence>
        {agentCount > 0 ? (
          <motion.div className="space-y-4">
            {Object.values(agents).map((agent: any, index) => {
              const modelInfo = availableModels?.find(m => m && m.id === agent.modelId);
              const serverName = modelInfo?.source ? 'Server' : 'Unknown';
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
                  initial={{ opacity: 0, x: -50 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 50 }}
                  transition={{ delay: index * 0.1 }}
                  className="group relative p-5 bg-gradient-to-r from-slate-800/50 via-slate-800/50 to-slate-700/50 backdrop-blur-xl border border-slate-700/50 rounded-2xl hover:border-blue-500/50 transition-all duration-300"
                  whileHover={{ scale: 1.02, y: -5 }}
                >
                  {/*  Glow Effect */}
                  <motion.div
                    className="absolute inset-0 bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-cyan-500/10 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                    animate={{ 
                      background: [
                        'linear-gradient(90deg, rgba(59, 130, 246, 0.1) 0%, rgba(168, 85, 247, 0.1) 50%, rgba(6, 182, 212, 0.1) 100%)',
                        'linear-gradient(90deg, rgba(6, 182, 212, 0.1) 0%, rgba(59, 130, 246, 0.1) 50%, rgba(168, 85, 247, 0.1) 100%)',
                        'linear-gradient(90deg, rgba(168, 85, 247, 0.1) 0%, rgba(6, 182, 212, 0.1) 50%, rgba(59, 130, 246, 0.1) 100%)'
                      ]
                    }}
                    transition={{ duration: 3, repeat: Infinity }}
                  />

                  <div className="relative flex items-center justify-between">
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      <div className="relative flex-shrink-0">
                        <motion.div
                          className="w-14 h-14 bg-gradient-to-br from-blue-500 via-purple-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/25"
                          whileHover={{ rotate: 5 }}
                        >
                          <Bot className="w-7 h-7 text-white" />
                        </motion.div>
                        <motion.div
                          className="absolute -bottom-1 -right-1 w-5 h-5 bg-emerald-500 border-2 border-slate-800 rounded-full"
                          animate={{ scale: [1, 1.2, 1] }}
                          transition={{ duration: 2, repeat: Infinity }}
                        />
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-lg text-white truncate mb-2">{agent.name}</div>
                        <div className="flex flex-col gap-3">
                          <div className="flex items-center gap-2">
                            <motion.span
                              className="inline-flex items-center px-3 py-1 bg-gradient-to-r from-blue-500/20 to-indigo-500/20 text-blue-300 text-sm rounded-full font-semibold border border-blue-500/30"
                              whileHover={{ scale: 1.05 }}
                            >
                              {agent.role}
                            </motion.span>
                            {agent.personaId && (
                              <motion.span
                                className="inline-flex items-center px-2 py-1 bg-gradient-to-r from-purple-500/20 to-pink-500/20 text-purple-300 text-xs rounded-full font-medium border border-purple-500/30"
                                whileHover={{ scale: 1.05 }}
                              >
                                {agent.persona?.name}
                              </motion.span>
                            )}
                          </div>
                          
                          <motion.div
                            className="flex items-center gap-3 px-3 py-2 bg-slate-700/50 rounded-lg border border-slate-600/30"
                            whileHover={{ borderColor: 'rgba(59, 130, 246, 0.5)' }}
                          >
                            <ServiceIcon className="w-5 h-5 text-slate-400 flex-shrink-0" />
                            <div className="flex flex-col min-w-0">
                              <span className="text-sm font-semibold text-slate-300 truncate" title={modelName}>
                                {modelName && modelName.length > 20 ? `${modelName.substring(0, 20)}...` : modelName}
                              </span>
                              <span className="text-xs text-slate-500 font-medium">
                                {modelInfo?.apiType === 'ollama' ? '🌐' : '🖥️'} {serverName}
                              </span>
                            </div>
                          </motion.div>
                        </div>
                      </div>
                    </div>
                    
                    <motion.button
                      onClick={() => handleRemoveAgent(agent.id)}
                      className="opacity-0 group-hover:opacity-100 p-3 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-xl transition-all duration-200 border border-red-500/20 hover:border-red-400/40"
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                    >
                      <Trash2 className="w-5 h-5" />
                    </motion.button>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center py-16"
          >
            <div className="relative w-32 h-32 bg-gradient-to-br from-blue-500/10 via-purple-500/10 to-indigo-500/10 rounded-3xl flex items-center justify-center mx-auto mb-6 border-2 border-dashed border-blue-500/30">
              <motion.div
                className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-purple-500/5 rounded-3xl"
                animate={{ rotate: 360 }}
                transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
              />
              <div className="relative flex items-center justify-center">
                <motion.div
                  animate={{ y: [-5, 5, -5] }}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  <Bot className="w-12 h-12 text-blue-400" />
                </motion.div>
                <motion.div
                  animate={{ y: [5, -5, 5] }}
                  transition={{ duration: 2, repeat: Infinity, delay: 0.5 }}
                >
                  <User className="w-8 h-8 text-purple-400 ml-2" />
                </motion.div>
                <motion.div
                  className="absolute -top-2 -right-2 w-4 h-4 bg-gradient-to-r from-emerald-400 to-green-500 rounded-full"
                  animate={{ scale: [1, 1.5, 1] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                />
              </div>
            </div>
            
            <div className="space-y-4">
              <h3 className="text-white font-bold text-2xl"> Network Empty</h3>
              <p className="text-slate-400 leading-relaxed max-w-md mx-auto">
                Initialize your first AI agent to begin collaborative  processing and multi-agent consciousness
              </p>
              <div className="flex items-center justify-center gap-2 mt-6">
                {[...Array(3)].map((_, i) => (
                  <motion.div
                    key={i}
                    className="w-2 h-2 bg-blue-400 rounded-full"
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.5 }}
                  />
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Creation Portal */}
      {agentCount < maxAgents && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative p-8 bg-gradient-to-br from-slate-800/30 via-blue-900/10 to-purple-900/10 backdrop-blur-xl rounded-2xl border border-blue-500/20"
        >
          <motion.div
            className="absolute inset-0 bg-gradient-to-r from-blue-600/10 via-purple-600/10 to-indigo-600/10 rounded-2xl"
            animate={{ opacity: [0.5, 0.8, 0.5] }}
            transition={{ duration: 3, repeat: Infinity }}
          />
          
          <div className="relative text-center space-y-6">
            <div className="flex items-center justify-center">
              <motion.div
                className="relative w-20 h-20 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg"
                animate={{ 
                  rotate: [0, 5, -5, 0],
                  scale: [1, 1.05, 1]
                }}
                transition={{ duration: 4, repeat: Infinity }}
              >
                <Plus className="w-10 h-10 text-white" />
                <motion.div
                  className="absolute -top-2 -right-2 w-8 h-8 bg-gradient-to-r from-emerald-400 to-green-500 rounded-full flex items-center justify-center"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 3, repeat: Infinity }}
                >
                  <Sparkles className="w-4 h-4 text-white" />
                </motion.div>
              </motion.div>
            </div>
            
            <div>
              <h3 className="font-bold text-2xl text-white mb-3">Spawn New Agent</h3>
              <p className="text-slate-400 mb-8">Create an AI entity to join the  collective</p>
            </div>
            
            <motion.button
              onClick={() => setShowAddModal(true)}
              disabled={modelsLoading}
              className="group relative px-10 py-5 bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 hover:from-blue-700 hover:via-purple-700 hover:to-indigo-700 text-white rounded-xl font-semibold text-lg transition-all duration-300 flex items-center gap-4 mx-auto shadow-xl shadow-blue-500/30 hover:shadow-blue-500/50 disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden"
              whileHover={{ scale: 1.05, y: -2 }}
              whileTap={{ scale: 0.95 }}
            >
              <motion.div
                className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0"
                animate={{ x: [-100, 200] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
              
              {modelsLoading ? (
                <>
                  <motion.div
                    className="w-6 h-6 border-2 border-white border-t-transparent rounded-full"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity }}
                  />
                  <span>Loading  Models...</span>
                </>
              ) : (
                <>
                  <Brain className="w-6 h-6 group-hover:rotate-12 transition-transform duration-300" />
                  <span>Initialize Agent</span>
                  <Network className="w-5 h-5 group-hover:scale-110 transition-transform duration-300" />
                </>
              )}
            </motion.button>
          </div>
        </motion.div>
      )}

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
                 Network at Capacity
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
                 Collective Ready
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
               Model Loading Error
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
    </div>
  );
}; 