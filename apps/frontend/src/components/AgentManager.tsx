import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAgents } from '../contexts/AgentContext';
import { PersonaSelector } from './PersonaSelector';
import { AgentState, createAgentStateFromBackend } from '../types/agent';
import { Persona, PersonaDisplay } from '../types/persona';
import { useDiscussion } from '../contexts/DiscussionContext';
import { uaipAPI } from '../utils/uaip-api';
import { AgentRole, LLMModel, LLMProviderType } from '@uaip/types';
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
  Edit3,
  Save,
  RefreshCw,
  Grid,
  List,
  Settings,
  Eye,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  EyeOff,
  Activity,
  Network,
  Brain,
  Sparkles
} from 'lucide-react';

// Types
interface ModelOption {
  id: string;
  name: string;
  description: string;
  source: string;
  apiEndpoint: string;
  apiType: 'ollama' | 'llmstudio';
  provider: string;
  isAvailable?: boolean;
}

interface AgentManagerProps {
  className?: string;
  defaultView?: 'grid' | 'list' | 'settings';
  viewport?: {
    width: number;
    height: number;
    isMobile: boolean;
    isTablet: boolean;
    isDesktop: boolean;
  };
}

type ViewMode = 'grid' | 'list' | 'settings' | 'create';
type ActionMode = 'view' | 'edit' | 'create' | 'delete';

interface ViewportSize {
  width: number;
  height: number;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
}

const getModels = async (): Promise<ModelOption[]> => {
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
      provider: model.provider,
      isAvailable: model.isAvailable ?? true
    }));
  } catch (error) {
    console.error('Failed to fetch models:', error);
    return [];
  }
};

const getServerIcon = (apiType: string) => {
  return apiType === 'ollama' ? Globe : Server;
};

const getServerDisplayName = (source: string, apiType: string): string => {
  const serviceName = apiType === 'ollama' ? 'Ollama' : 'LLM Studio';
  
  if (!source || source === 'local' || source === 'unknown') {
    return serviceName;
  }
  
  try {
    const url = new URL(source);
    const hostname = url.hostname;
    const port = url.port;
    
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return port ? `${serviceName} (localhost:${port})` : `${serviceName} (localhost)`;
    }
    
    return `${serviceName} (${hostname}${port ? ':' + port : ''})`;
  } catch {
    return `${serviceName} (${source.split('/').pop() || source.substring(0, 10)})`;
  }
};

const groupModelsByProvider = (models: ModelOption[]) => {
  const grouped: Record<string, ModelOption[]> = {};
  
  if (!models || !Array.isArray(models)) {
    return grouped;
  }
  
  models.forEach(model => {
    if (!model || !model.id) return;
    
    const providerKey = `${model.apiType}:${model.source}`;
    if (!grouped[providerKey]) {
      grouped[providerKey] = [];
    }
    grouped[providerKey].push(model);
  });
  
  return grouped;
};

export const AgentManager: React.FC<AgentManagerProps> = ({ 
  className, 
  defaultView = 'grid',
  viewport 
}) => {
  const { 
    agents, 
    addAgent, 
    removeAgent, 
    updateAgentState,
    modelState,
    getRecommendedModels,
    getModelsForProvider,
    refreshModelData
  } = useAgents();
  const discussion = useDiscussion();
  const [searchParams, setSearchParams] = useSearchParams();

  // URL-driven state management
  const [viewMode, setViewMode] = useState<ViewMode>(
    (searchParams.get('view') as ViewMode) || defaultView
  );
  const [actionMode, setActionMode] = useState<ActionMode>(
    (searchParams.get('action') as ActionMode) || 'view'
  );
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(
    searchParams.get('agent') || null
  );
  const [searchQuery, setSearchQuery] = useState(searchParams.get('search') || '');
  const [filterRole, setFilterRole] = useState(searchParams.get('role') || '');

  // Component state
  const [availableModels, setAvailableModels] = useState<ModelOption[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Form state for create/edit
  const [agentForm, setAgentForm] = useState({
    name: '',
    role: 'assistant' as AgentRole,
    modelId: '',
    personaId: '',
    description: '',
    isActive: true
  });

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = viewMode === 'grid' ? 12 : 10;

  // Sync URL with state
  useEffect(() => {
    const params = new URLSearchParams();
    if (viewMode !== 'grid') params.set('view', viewMode);
    if (actionMode !== 'view') params.set('action', actionMode);
    if (selectedAgentId) params.set('agent', selectedAgentId);
    if (searchQuery) params.set('search', searchQuery);
    if (filterRole) params.set('role', filterRole);
    
    setSearchParams(params);
  }, [viewMode, actionMode, selectedAgentId, searchQuery, filterRole, setSearchParams]);

  // Load models and agents on mount
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
      
      if (models.length > 0 && !agentForm.modelId) {
        setAgentForm(prev => ({ ...prev, modelId: models[0].id }));
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
        }
      }
    } catch (error) {
      console.warn('Error loading existing agents:', error);
    }
  };

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        loadModels(),
        loadExistingAgents(),
        refreshModelData()
      ]);
    } catch (error) {
      console.error('Refresh error:', error);
    } finally {
      setTimeout(() => setRefreshing(false), 500);
    }
  }, [refreshModelData]);

  // Navigation helpers
  const navigateToAgent = (agentId: string, action: ActionMode = 'view') => {
    setSelectedAgentId(agentId);
    setActionMode(action);
  };

  const navigateToCreate = () => {
    setSelectedAgentId(null);
    setActionMode('create');
    setAgentForm({
      name: '',
      role: 'assistant' as AgentRole,
      modelId: availableModels[0]?.id || '',
      personaId: '',
      description: '',
      isActive: true
    });
  };

  const navigateToView = () => {
    setSelectedAgentId(null);
    setActionMode('view');
  };

  // CRUD operations
  const handleCreateAgent = async (persona: PersonaDisplay) => {
    if (!agentForm.name.trim() || !agentForm.modelId) {
      throw new Error('Please enter an agent name and select a model');
    }

    const selectedModel = availableModels?.find(m => m.id === agentForm.modelId);
    if (!selectedModel) {
      throw new Error('Selected model is no longer available');
    }

    try {
      const apiAgentData = {
        name: agentForm.name.trim(),
        role: agentForm.role,
        personaId: persona.id,
        description: agentForm.description || persona.description || `AI agent with ${persona.name} persona`,
        capabilities: persona.expertise && persona.expertise.length > 0 ? persona.expertise : ['general_assistance'],
        modelId: agentForm.modelId,
        apiType: selectedModel?.apiType || 'ollama',
        configuration: {
          model: agentForm.modelId,
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
        isActive: agentForm.isActive,
        createdBy: 'frontend-user'
      };

      const apiResponse = await uaipAPI.client.agents.create(apiAgentData);

      if (!apiResponse.success || !apiResponse.data) {
        throw new Error(apiResponse.error?.message || 'Failed to create agent via API');
      }

      const finalAgentState = createAgentStateFromBackend(apiResponse.data);
      addAgent(finalAgentState);
      
      // Navigate to the new agent
      navigateToAgent(finalAgentState.id, 'view');
      
      console.log('Agent creation completed successfully');
    } catch (error) {
      console.error('Failed to create agent:', error);
      throw error;
    }
  };

  const handleDeleteAgent = async (agentId: string) => {
    try {
      const apiResponse = await uaipAPI.client.agents.delete(agentId);
      
      if (!apiResponse.success) {
        console.warn('Failed to delete agent from API:', apiResponse.error?.message);
      }
    } catch (error) {
      console.warn('Error deleting agent from API:', error);
    }

    removeAgent(agentId);
    
    // Navigate away if we're viewing the deleted agent
    if (selectedAgentId === agentId) {
      navigateToView();
    }
  };

  // Filter and search logic
  const filteredAgents = Object.values(agents).filter(agent => {
    const matchesSearch = !searchQuery || 
      agent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      agent.role.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (agent.persona?.name && agent.persona.name.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesRole = !filterRole || agent.role === filterRole;
    
    return matchesSearch && matchesRole;
  });

  // Pagination logic
  const totalPages = Math.ceil(filteredAgents.length / itemsPerPage);
  const paginatedAgents = filteredAgents.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const renderAgentCard = (agent: AgentState, index: number) => {
    const modelInfo = availableModels?.find(m => m && m.id === agent.modelId);
    const ServiceIcon = modelInfo ? (modelInfo.apiType === 'ollama' ? Globe : Server) : Cpu;
    
    let modelName = 'Unknown Model';
    if (modelInfo) {
      modelName = modelInfo.name || agent.modelId;
      if (agent.modelId?.includes(':')) {
        const parts = agent.modelId.split(':');
        modelName = parts[parts.length - 1] || agent.modelId;
      }
    }

    return (
      <motion.div
        key={agent.id}
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        transition={{ delay: index * 0.05 }}
        className="group relative p-4 bg-gradient-to-br from-slate-800/60 via-slate-800/40 to-slate-700/60 backdrop-blur-xl border border-slate-700/50 rounded-2xl hover:border-blue-500/50 transition-all duration-300 cursor-pointer"
        onClick={() => navigateToAgent(agent.id)}
        whileHover={{ scale: 1.02, y: -2 }}
      >
        {/* Action buttons */}
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 flex gap-1 z-10">
          <motion.button
            onClick={(e) => {
              e.stopPropagation();
              navigateToAgent(agent.id, 'edit');
            }}
            className="p-1.5 text-blue-400 hover:text-blue-300 hover:bg-blue-500/20 rounded-lg transition-all duration-200"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
          >
            <Edit3 className="w-3 h-3" />
          </motion.button>
          <motion.button
            onClick={(e) => {
              e.stopPropagation();
              handleDeleteAgent(agent.id);
            }}
            className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/20 rounded-lg transition-all duration-200"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
          >
            <Trash2 className="w-3 h-3" />
          </motion.button>
        </div>

        <div className="flex flex-col h-full">
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
                className={`absolute -bottom-1 -right-1 w-4 h-4 border-2 border-slate-800 rounded-full ${
                  agent.isActive ? 'bg-emerald-500' : 'bg-gray-400'
                }`}
                animate={{ scale: agent.isActive ? [1, 1.2, 1] : 1 }}
                transition={{ duration: 2, repeat: agent.isActive ? Infinity : 0 }}
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
            <span className="inline-flex items-center justify-center px-2 py-1 bg-gradient-to-r from-blue-500/20 to-indigo-500/20 text-blue-300 text-xs rounded-full font-semibold border border-blue-500/30">
              {agent.role}
            </span>
            {agent.personaId && (
              <span className="inline-flex items-center justify-center px-2 py-1 bg-gradient-to-r from-purple-500/20 to-pink-500/20 text-purple-300 text-xs rounded-full font-medium border border-purple-500/30">
                {agent.persona?.name && agent.persona.name.length > 10 
                  ? `${agent.persona.name.substring(0, 10)}...` 
                  : agent.persona?.name || 'Persona'}
              </span>
            )}
          </div>
          
          {/* Model Info */}
          <div className="mt-auto">
            <div className="flex items-center gap-2 px-2 py-1.5 bg-slate-700/50 rounded-lg border border-slate-600/30">
              <ServiceIcon className="w-4 h-4 text-slate-400 flex-shrink-0" />
              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-xs font-semibold text-slate-300 truncate" title={modelName}>
                  {modelName && modelName.length > 12 ? `${modelName.substring(0, 12)}...` : modelName}
                </span>
                <span className="text-xs text-slate-500">
                  {modelInfo?.apiType === 'ollama' ? '🌐' : '🖥️'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    );
  };

  const renderHeader = () => (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center justify-between mb-6"
    >
      <div className="flex items-center gap-4">
        <motion.div
          className="w-12 h-12 bg-gradient-to-br from-purple-500 via-purple-600 to-pink-600 rounded-xl flex items-center justify-center shadow-lg shadow-purple-500/25"
          whileHover={{ scale: 1.05 }}
        >
          <Users className="w-6 h-6 text-white" />
        </motion.div>
        <div>
          <h1 className="text-2xl font-bold text-white">Agent Manager</h1>
          <p className="text-sm text-slate-400">
            Manage AI consciousness entities
          </p>
        </div>
      </div>
      
      <div className="flex items-center gap-3">
        {/* View mode toggle */}
        <div className="flex items-center bg-slate-800/50 rounded-lg p-1">
          <button
            onClick={() => setViewMode('grid')}
            className={`p-2 rounded-md transition-colors ${
              viewMode === 'grid' 
                ? 'bg-blue-500 text-white' 
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Grid3X3 className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`p-2 rounded-md transition-colors ${
              viewMode === 'list' 
                ? 'bg-blue-500 text-white' 
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <List className="w-4 h-4" />
          </button>
        </div>
        
        {/* Refresh button */}
        <motion.button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 bg-slate-800/50 hover:bg-slate-700/50 text-white rounded-lg transition-colors disabled:opacity-50"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          <motion.div
            animate={{ rotate: refreshing ? 360 : 0 }}
            transition={{ duration: 1, repeat: refreshing ? Infinity : 0 }}
          >
            <RefreshCw className="w-4 h-4" />
          </motion.div>
          <span>Refresh</span>
        </motion.button>
        
        {/* Add agent button */}
        <motion.button
          onClick={navigateToCreate}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white rounded-lg transition-all duration-300 shadow-lg shadow-blue-500/25"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          <Plus className="w-4 h-4" />
          <span>Add Agent</span>
        </motion.button>
      </div>
    </motion.div>
  );

  const renderFilters = () => (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-4 mb-6"
    >
      {/* Search */}
      <div className="flex-1 relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search agents..."
          className="w-full pl-10 pr-4 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-blue-500"
        />
      </div>
      
      {/* Role filter */}
      <div className="relative">
        <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
        <select
          value={filterRole}
          onChange={(e) => setFilterRole(e.target.value)}
          className="pl-10 pr-8 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
        >
          <option value="">All Roles</option>
          <option value="assistant">Assistant</option>
          <option value="analyzer">Analyzer</option>
          <option value="orchestrator">Orchestrator</option>
          <option value="specialist">Specialist</option>
        </select>
      </div>
      
      {/* Results count */}
      <div className="text-sm text-slate-400">
        {filteredAgents.length} agent{filteredAgents.length !== 1 ? 's' : ''}
      </div>
    </motion.div>
  );

  return (
    <div className={`space-y-6 ${className}`}>
      {renderHeader()}
      
      {actionMode === 'view' && (
        <>
          {renderFilters()}
          
          {viewMode === 'grid' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
            >
              <AnimatePresence>
                {paginatedAgents.map((agent, index) => renderAgentCard(agent, index))}
              </AnimatePresence>
            </motion.div>
          )}
        </>
      )}

      {/* Create/Edit Modal */}
      <AnimatePresence>
        {(actionMode === 'create' || actionMode === 'edit') && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={navigateToView}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl border border-slate-700 p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-white">
                  {actionMode === 'create' ? 'Create New Agent' : 'Edit Agent'}
                </h3>
                <button
                  onClick={navigateToView}
                  className="p-2 text-slate-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Agent Name
                    </label>
                    <input
                      type="text"
                      value={agentForm.name}
                      onChange={(e) => setAgentForm(prev => ({ ...prev, name: e.target.value }))}
                      className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-blue-500"
                      placeholder="Enter agent name..."
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Role
                    </label>
                    <select
                      value={agentForm.role}
                      onChange={(e) => setAgentForm(prev => ({ ...prev, role: e.target.value as AgentRole }))}
                      className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                    >
                      <option value="assistant">Assistant</option>
                      <option value="analyzer">Analyzer</option>
                      <option value="orchestrator">Orchestrator</option>
                      <option value="specialist">Specialist</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Model
                  </label>
                  <select
                    value={agentForm.modelId}
                    onChange={(e) => setAgentForm(prev => ({ ...prev, modelId: e.target.value }))}
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

                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="isActive"
                    checked={agentForm.isActive}
                    onChange={(e) => setAgentForm(prev => ({ ...prev, isActive: e.target.checked }))}
                    className="w-4 h-4 text-blue-600 bg-slate-700 border-slate-600 rounded focus:ring-blue-500"
                  />
                  <label htmlFor="isActive" className="text-sm text-slate-300">
                    Agent is active
                  </label>
                </div>

                <PersonaSelector
                  onSelectPersona={handleCreateAgent}
                  disabled={!agentForm.name.trim() || !agentForm.modelId}
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error states */}
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
            <button
              onClick={loadModels}
              disabled={modelsLoading}
              className="px-3 py-1 bg-red-600/20 hover:bg-red-600/30 text-red-300 text-sm rounded border border-red-500/30 hover:border-red-400/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {modelsLoading ? 'Retrying...' : 'Retry'}
            </button>
          </div>
        </motion.div>
      )}
    </div>
  );
}; 