import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAgents } from '../../../contexts/AgentContext';
import { PersonaSelector } from '../../PersonaSelector';
import { AgentState, createAgentStateFromBackend } from '../../../types/agent';
import { Persona, PersonaDisplay } from '../../../types/persona';
import { useDiscussion } from '../../../contexts/DiscussionContext';
import { uaipAPI } from '../../../utils/uaip-api';
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
import { ModelOption } from '@/types/models';

interface ViewportSize {
  width: number;
  height: number;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
}

interface AgentManagerPortalProps {
  className?: string;
  viewport?: ViewportSize;
  defaultView?: 'grid' | 'list' | 'settings';
  mode?: 'spawner' | 'monitor' | 'manager';
}

type ViewMode = 'grid' | 'list' | 'settings' | 'create';
type ActionMode = 'view' | 'edit' | 'create' | 'delete';

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

export const AgentManagerPortal: React.FC<AgentManagerPortalProps> = ({ 
  className, 
  viewport,
  defaultView = 'grid',
  mode = 'manager'
}) => {
  // Default viewport if not provided
  const defaultViewport: ViewportSize = {
    width: typeof window !== 'undefined' ? window.innerWidth : 1024,
    height: typeof window !== 'undefined' ? window.innerHeight : 768,
    isMobile: typeof window !== 'undefined' ? window.innerWidth < 768 : false,
    isTablet: typeof window !== 'undefined' ? window.innerWidth >= 768 && window.innerWidth < 1024 : false,
    isDesktop: typeof window !== 'undefined' ? window.innerWidth >= 1024 : true
  };

  const currentViewport = viewport || defaultViewport;

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

  // Portal-specific state management (no URL params)
  const [viewMode, setViewMode] = useState<ViewMode>(defaultView);
  const [actionMode, setActionMode] = useState<ActionMode>('view');
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRole, setFilterRole] = useState('');

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

  // Load models
  const loadModels = async () => {
    setModelsLoading(true);
    setModelsError(null);
    
    try {
      const models = await getModels();
      setAvailableModels(models);
    } catch (error) {
      console.error('Failed to load models:', error);
      setModelsError('Failed to load available models');
    } finally {
      setModelsLoading(false);
    }
  };

  // Load existing agents
  const loadExistingAgents = async () => {
    try {
      const response = await uaipAPI.agents.list();
      
      // Handle response properly - the API returns an array directly
      if (Array.isArray(response)) {
        // Update agent context with fresh data
        for (const agentData of response) {
          const agentState = createAgentStateFromBackend(agentData);
          addAgent(agentState);
        }
      }
    } catch (error) {
      console.error('Failed to load existing agents:', error);
    }
  };

  // Initialize data
  useEffect(() => {
    loadModels();
    loadExistingAgents();
  }, []);

  // Debug: Monitor agents changes
  useEffect(() => {
    if (Object.keys(agents).length > 0) {
      console.log(`✅ Agent Manager: ${Object.keys(agents).length} agents loaded`);
    }
  }, [agents]);

  // Navigation helpers (portal-specific, no URL changes)
  const navigateToAgent = (agentId: string, action: ActionMode = 'view') => {
    setSelectedAgentId(agentId);
    setActionMode(action);
  };

  const navigateToCreate = () => {
    setViewMode('create');
    setActionMode('create');
    setSelectedAgentId(null);
    setAgentForm({
      name: '',
      role: 'assistant' as AgentRole,
      modelId: '',
      personaId: '',
      description: '',
      isActive: true
    });
  };

  const navigateToView = () => {
    setViewMode(defaultView);
    setActionMode('view');
    setSelectedAgentId(null);
  };

  const handleCreateAgent = async (persona: PersonaDisplay) => {
    if (!agentForm.name.trim() || !agentForm.modelId || !persona.id) {
      return;
    }

    try {
      const agentData = {
        name: agentForm.name.trim(),
        role: agentForm.role,
        modelId: agentForm.modelId,
        personaId: persona.id,
        description: agentForm.description.trim(),
        isActive: agentForm.isActive,
        capabilities: persona.expertise || [],
        systemPrompt: persona.background || persona.description || '',
        temperature: 0.7,
        maxTokens: 2000,
        topP: 0.9,
        frequencyPenalty: 0,
        presencePenalty: 0
      };

      const response = await uaipAPI.agents.create(agentData);
      
      if (response.success && response.data) {
        const newAgent = createAgentStateFromBackend(response.data);
        addAgent(newAgent);
        
        // Reset form and navigate back
        setAgentForm({
          name: '',
          role: 'assistant' as AgentRole,
          modelId: '',
          personaId: '',
          description: '',
          isActive: true
        });
        
        navigateToView();
      }
    } catch (error) {
      console.error('Failed to create agent:', error);
    }
  };

  const handleDeleteAgent = async (agentId: string) => {
    if (!agentId) return;

    try {
      await uaipAPI.agents.delete(agentId);
      
      // If no error was thrown, assume success
      removeAgent(agentId);
      
      // If we're viewing this agent, go back to main view
      if (selectedAgentId === agentId) {
        navigateToView();
      }
    } catch (error) {
      console.error('Failed to delete agent:', error);
    }
  };

  // Filter and search logic
  const filteredAgents = useMemo(() => {
    let filtered = Object.values(agents);

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(agent =>
        agent.name.toLowerCase().includes(query) ||
        agent.role.toLowerCase().includes(query) ||
        agent.description?.toLowerCase().includes(query)
      );
    }

    // Apply role filter
    if (filterRole) {
      filtered = filtered.filter(agent => agent.role === filterRole);
    }

    return filtered;
  }, [agents, searchQuery, filterRole]);

  // Pagination logic
  const totalPages = Math.ceil(filteredAgents.length / itemsPerPage);
  const paginatedAgents = filteredAgents.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterRole, viewMode]);

  const renderAgentCard = (agent: AgentState, index: number) => {
    const isSelected = selectedAgentId === agent.id;
    const delay = index * 0.1;

    // Get model name without the long ID
    const getModelDisplayName = (modelId: string) => {
      if (!modelId) return 'No model';
      // Extract just the model name part (after the last colon)
      const parts = modelId.split(':');
      return parts[parts.length - 1] || modelId;
    };

    // Get persona display name
    const getPersonaDisplayName = (agent: AgentState) => {
      if (agent.persona?.name) {
        return agent.persona.name;
      }
      if (agent.personaId) {
        // Try to extract a readable name from persona ID
        const parts = agent.personaId.split('-');
        return parts.map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
      }
      return 'No persona';
    };

    return (
      <motion.div
        key={agent.id}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay, duration: 0.3 }}
        className={`
          relative group cursor-pointer
          ${viewMode === 'grid' 
            ? 'bg-slate-800/50 hover:bg-slate-700/50 border border-slate-700/50 hover:border-slate-600/50 rounded-xl p-4 transition-all duration-300' 
            : 'bg-slate-800/30 hover:bg-slate-700/30 border-l-4 border-l-blue-500/50 hover:border-l-blue-400 p-4 transition-all duration-300'
          }
          ${isSelected ? 'ring-2 ring-blue-500/50 bg-blue-500/10' : ''}
        `}
        onClick={() => navigateToAgent(agent.id)}
        whileHover={{ scale: viewMode === 'grid' ? 1.02 : 1.01 }}
      >
        {/* Agent Status Indicator */}
        <div className="absolute top-2 right-2 flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${agent.isActive ? 'bg-green-400 animate-pulse' : 'bg-gray-500'}`} />
          {agent.isActive && (
            <div className="text-xs text-green-400 font-medium">Active</div>
          )}
        </div>

        {/* Agent Info */}
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-lg flex items-center justify-center flex-shrink-0">
            <Bot className="w-5 h-5 text-white" />
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <h3 className="font-semibold text-white truncate text-base" title={agent.name}>
                {agent.name}
              </h3>
              <span className="text-xs px-2 py-1 bg-blue-500/20 text-blue-300 rounded-full capitalize font-medium border border-blue-500/30">
                {agent.role}
              </span>
            </div>
            
            {/* Persona Tag */}
            <div className="mb-2">
              <span 
                className="inline-flex items-center gap-1 px-2 py-1 bg-purple-500/20 text-purple-300 text-xs rounded-full font-medium border border-purple-500/30 max-w-full"
                title={getPersonaDisplayName(agent)}
              >
                <User className="w-3 h-3 flex-shrink-0" />
                <span className="truncate">
                  {getPersonaDisplayName(agent).length > 15 
                    ? `${getPersonaDisplayName(agent).substring(0, 15)}...` 
                    : getPersonaDisplayName(agent)
                  }
                </span>
              </span>
            </div>
            
            {/* Model Tag */}
            <div className="mb-2">
              <span 
                className="inline-flex items-center gap-1 px-2 py-1 bg-slate-700/50 text-slate-300 text-xs rounded-full font-medium border border-slate-600/30 max-w-full"
                title={agent.modelId}
              >
                <Cpu className="w-3 h-3 flex-shrink-0" />
                <span className="truncate">
                  {getModelDisplayName(agent.modelId).length > 12 
                    ? `${getModelDisplayName(agent.modelId).substring(0, 12)}...` 
                    : getModelDisplayName(agent.modelId)
                  }
                </span>
              </span>
            </div>
            
            {/* Description (if exists) */}
            {agent.description && (
              <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed" title={agent.description}>
                {agent.description.length > 60 
                  ? `${agent.description.substring(0, 60)}...` 
                  : agent.description
                }
              </p>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="flex items-center gap-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                navigateToAgent(agent.id, 'edit');
              }}
              className="w-6 h-6 bg-slate-700/80 hover:bg-slate-600/80 rounded-md flex items-center justify-center text-slate-300 hover:text-white transition-colors"
              title="Edit Agent"
            >
              <Edit3 className="w-3 h-3" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteAgent(agent.id);
              }}
              className="w-6 h-6 bg-red-500/20 hover:bg-red-500/30 rounded-md flex items-center justify-center text-red-400 hover:text-red-300 transition-colors"
              title="Delete Agent"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        </div>
      </motion.div>
    );
  };

  const renderHeader = () => (
    <div className="flex items-center justify-between mb-6">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-lg flex items-center justify-center">
          {mode === 'spawner' ? <Zap className="w-4 h-4 text-white" /> : 
           mode === 'monitor' ? <Activity className="w-4 h-4 text-white" /> :
           <Users className="w-4 h-4 text-white" />}
        </div>
        <div>
          <h2 className="text-xl font-bold text-white">
            {mode === 'spawner' ? 'Agent Spawner' : 
             mode === 'monitor' ? 'Agent Monitor' : 
             viewMode === 'settings' ? 'Agent Settings' :
             'Agent Manager'}
          </h2>
          <p className="text-sm text-slate-400">
            {mode === 'spawner' ? 'Create and deploy new agents' :
             mode === 'monitor' ? 'Monitor agent performance and status' :
             viewMode === 'settings' ? 'Configure agent models and personas' :
             `${Object.values(agents).length} active agent${Object.values(agents).length !== 1 ? 's' : ''}`}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* View Mode Toggle */}
        <div className="flex items-center bg-slate-800/50 rounded-lg p-1">
          <button
            onClick={() => setViewMode('grid')}
            className={`p-2 rounded-md transition-colors ${
              viewMode === 'grid' 
                ? 'bg-blue-500/20 text-blue-400' 
                : 'text-slate-400 hover:text-white'
            }`}
            title="Grid View"
          >
            <Grid className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`p-2 rounded-md transition-colors ${
              viewMode === 'list' 
                ? 'bg-blue-500/20 text-blue-400' 
                : 'text-slate-400 hover:text-white'
            }`}
            title="List View"
          >
            <List className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode('settings')}
            className={`p-2 rounded-md transition-colors ${
              viewMode === 'settings' 
                ? 'bg-blue-500/20 text-blue-400' 
                : 'text-slate-400 hover:text-white'
            }`}
            title="Settings View"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>

        {/* Refresh Button */}
        <button
          onClick={() => {
            setRefreshing(true);
            Promise.all([loadModels(), loadExistingAgents()]).finally(() => {
              setRefreshing(false);
            });
          }}
          disabled={refreshing}
          className="p-2 bg-slate-800/50 hover:bg-slate-700/50 rounded-lg text-slate-400 hover:text-white transition-colors disabled:opacity-50"
          title="Refresh Data"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
        </button>

        {/* Create Agent Button */}
        {viewMode !== 'settings' && (
          <button
            onClick={navigateToCreate}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white rounded-lg transition-all duration-300 font-medium"
          >
            <Plus className="w-4 h-4" />
            {currentViewport.isMobile ? '' : 'Create Agent'}
          </button>
        )}
      </div>
    </div>
  );

  const renderFilters = () => (
    <div className="flex items-center gap-4 mb-6">
      {/* Search */}
      <div className="flex-1 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          placeholder="Search agents..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-colors"
        />
      </div>

      {/* Role Filter */}
      <div className="relative">
        <select
          value={filterRole}
          onChange={(e) => setFilterRole(e.target.value)}
          className="pl-3 pr-8 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-colors appearance-none"
        >
          <option value="">All Roles</option>
          <option value="assistant">Assistant</option>
          <option value="analyst">Analyst</option>
          <option value="coordinator">Coordinator</option>
          <option value="specialist">Specialist</option>
        </select>
        <Filter className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
      </div>
    </div>
  );

  const renderCreateForm = () => (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-6"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">Create New Agent</h3>
        <button
          onClick={navigateToView}
          className="p-2 hover:bg-slate-700/50 rounded-lg text-slate-400 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Agent Name */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Agent Name
          </label>
          <input
            type="text"
            value={agentForm.name}
            onChange={(e) => setAgentForm(prev => ({ ...prev, name: e.target.value }))}
            placeholder="Enter agent name..."
            className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-colors"
          />
        </div>

        {/* Agent Role */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Role
          </label>
          <select
            value={agentForm.role}
            onChange={(e) => setAgentForm(prev => ({ ...prev, role: e.target.value as AgentRole }))}
            className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-colors"
          >
            <option value="assistant">Assistant</option>
            <option value="analyst">Analyst</option>
            <option value="coordinator">Coordinator</option>
            <option value="specialist">Specialist</option>
          </select>
        </div>

        {/* Model Selection */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Language Model
          </label>
          <select
            value={agentForm.modelId}
            onChange={(e) => setAgentForm(prev => ({ ...prev, modelId: e.target.value }))}
            className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-colors"
            disabled={modelsLoading}
          >
            <option value="">Select a model...</option>
            {Object.entries(groupModelsByProvider(availableModels)).map(([providerKey, models]) => {
              const [apiType, source] = providerKey.split(':');
              const providerName = getServerDisplayName(source, apiType);
              
              return (
                <optgroup key={providerKey} label={providerName}>
                  {models.map(model => (
                    <option key={model.id} value={model.id} disabled={!model.isAvailable}>
                      {model.name} {!model.isAvailable ? '(Unavailable)' : ''}
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </select>
          {modelsLoading && (
            <div className="text-xs text-slate-400 mt-1">Loading models...</div>
          )}
          {modelsError && (
            <div className="text-xs text-red-400 mt-1">{modelsError}</div>
          )}
        </div>
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-2">
          Description (Optional)
        </label>
        <textarea
          value={agentForm.description}
          onChange={(e) => setAgentForm(prev => ({ ...prev, description: e.target.value }))}
          placeholder="Describe the agent's purpose and capabilities..."
          rows={3}
          className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-colors resize-none"
        />
      </div>

      {/* Persona Selection */}
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-2">
          Persona
        </label>
        <PersonaSelector
          onSelectPersona={handleCreateAgent}
          disabled={!agentForm.name.trim() || !agentForm.modelId}
        />
      </div>
    </motion.div>
  );

  const renderPagination = () => {
    if (totalPages <= 1) return null;

    return (
      <div className="flex items-center justify-between mt-6">
        <div className="text-sm text-slate-400">
          Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredAgents.length)} of {filteredAgents.length} agents
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
            disabled={currentPage === 1}
            className="p-2 bg-slate-800/50 hover:bg-slate-700/50 rounded-lg text-slate-400 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          
          <div className="flex items-center gap-1">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
              <button
                key={page}
                onClick={() => setCurrentPage(page)}
                className={`px-3 py-1 rounded-md text-sm transition-colors ${
                  currentPage === page
                    ? 'bg-blue-500/20 text-blue-400'
                    : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                }`}
              >
                {page}
              </button>
            ))}
          </div>
          
          <button
            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
            disabled={currentPage === totalPages}
            className="p-2 bg-slate-800/50 hover:bg-slate-700/50 rounded-lg text-slate-400 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  };

  const renderSettingsView = () => (
    <div className="space-y-6">
      {/* Settings Header */}
      <div className="flex items-center justify-between bg-slate-800/50 rounded-xl p-4">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2 px-3 py-2 bg-gradient-to-r from-slate-100 to-slate-200 dark:from-slate-700 dark:to-slate-600 rounded-full shadow-inner">
            <div className="w-2 h-2 bg-gradient-to-r from-green-500 to-blue-500 rounded-full"></div>
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              {availableModels.length} Models
            </span>
          </div>
        </div>

        <button
          onClick={() => {
            loadModels();
            loadExistingAgents();
          }}
          disabled={modelsLoading}
          className="flex items-center space-x-2 px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${modelsLoading ? 'animate-spin' : ''}`} />
          <span>Refresh Models</span>
        </button>
      </div>

      {/* Models Error */}
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
          </div>
        </div>
      )}

      {/* Agent Configuration Cards */}
      <div className="space-y-4">
        {Object.values(agents).length === 0 ? (
          <div className="text-center py-16">
            <div className="w-20 h-20 bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-700 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-inner">
              <Bot className="w-10 h-10 text-slate-400" />
            </div>
            <p className="text-slate-600 dark:text-slate-300 font-semibold text-lg">No agents configured</p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">Create agents first to configure their model associations</p>
          </div>
        ) : (
          Object.values(agents).map((agent) => {
            const modelInfo = availableModels.find(m => m.id === agent.modelId);
            const hasValidModel = !!modelInfo;
            const hasPersona = !!agent.personaId;
            const isFullyConfigured = hasValidModel && hasPersona;
            const modelName = modelInfo?.name || agent.modelId || 'No model selected';

            return (
              <div
                key={agent.id}
                className={`group relative p-6 bg-gradient-to-r from-white via-white to-slate-50 dark:from-slate-800 dark:via-slate-800 dark:to-slate-700 border-2 rounded-2xl transition-all duration-300 ${
                  isFullyConfigured
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
                        agent.isActive ? 'bg-green-500' : 'bg-gray-400'
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

                      {/* Current Model Display */}
                      <div className="flex items-center space-x-3 p-3 bg-slate-100 dark:bg-slate-700 rounded-lg mb-3">
                        <Cpu className="w-5 h-5 text-slate-600 dark:text-slate-400 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-slate-900 dark:text-white truncate">
                            {modelName}
                          </div>
                          <div className="text-sm text-slate-500 dark:text-slate-400">
                            {agent.apiType === 'ollama' ? '🌐 Ollama' : '🖥️ LLM Studio'}
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
                    </div>
                  </div>

                  {/* Action Button */}
                  <button
                    onClick={() => navigateToAgent(agent.id, 'edit')}
                    className="opacity-0 group-hover:opacity-100 p-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-xl transition-all duration-200 hover:scale-110 flex-shrink-0"
                  >
                    <Edit3 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
      className={`h-full w-full ${className} ${currentViewport.isMobile ? 'px-2' : ''}`}
    >
      <div className="h-full bg-gradient-to-br from-blue-500/5 to-cyan-500/5 backdrop-blur-xl rounded-2xl border border-blue-500/10 overflow-hidden">
        <div className="h-full p-4 md:p-6 overflow-y-auto">
          {viewMode === 'create' ? (
            renderCreateForm()
          ) : viewMode === 'settings' ? (
            renderSettingsView()
          ) : (
            <>
              {renderHeader()}
              {renderFilters()}
              
              {/* Agents Grid/List */}
              <div className={`
                ${viewMode === 'grid' 
                  ? `grid gap-4 ${
                      currentViewport.isMobile ? 'grid-cols-1' : 
                      currentViewport.isTablet ? 'grid-cols-2' : 
                      'grid-cols-3'
                    }`
                  : 'space-y-3'
                }
              `}>
                <AnimatePresence>
                  {paginatedAgents.map((agent, index) => renderAgentCard(agent, index))}
                </AnimatePresence>
              </div>

              {/* Empty State */}
              {filteredAgents.length === 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-center py-12"
                >
                  <div className="w-16 h-16 bg-slate-800/50 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Bot className="w-8 h-8 text-slate-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-2">
                    {searchQuery || filterRole ? 'No agents found' : 'No agents yet'}
                  </h3>
                  <p className="text-slate-400 mb-6">
                    {searchQuery || filterRole 
                      ? 'Try adjusting your search or filters'
                      : 'Create your first agent to get started'
                    }
                  </p>
                  {!searchQuery && !filterRole && (
                    <button
                      onClick={navigateToCreate}
                      className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white rounded-lg transition-all duration-300 font-medium mx-auto"
                    >
                      <Plus className="w-4 h-4" />
                      Create Your First Agent
                    </button>
                  )}
                </motion.div>
              )}

              {renderPagination()}
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
}; 