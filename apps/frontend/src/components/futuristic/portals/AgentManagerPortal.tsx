import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAgents } from '../../../contexts/AgentContext';
import { PersonaSelector } from '../../PersonaSelector';
import { AgentState, createAgentStateFromBackend } from '../../../types/agent';
import { Persona, PersonaDisplay } from '../../../types/persona';
import { useDiscussion } from '../../../contexts/DiscussionContext';
import { uaipAPI } from '../../../utils/uaip-api';
import { AgentRole, LLMModel, LLMProviderType } from '@uaip/types';
import { useToast } from '@/components/ui/use-toast';
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
  Sparkles,
  Play,
  Pause,
  BarChart3,
  Clock,
  Shield,
  Layers,
  MoreVertical,
  Copy,
  Download,
  Upload,
  GitBranch,
  Target,
  Workflow,
  Gauge,
  Lightbulb,
  MessageSquare,
  Bookmark
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

type ViewMode = 'grid' | 'list' | 'settings' | 'create' | 'create-persona';
type ActionMode = 'view' | 'edit' | 'create' | 'create-persona' | 'delete';

const getModels = async (): Promise<ModelOption[]> => {
  try {
    const response = await uaipAPI.llm.getModels();
    const models = Array.isArray(response) ? response : [];
    
    if (models.length > 0) {
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
    }
  } catch (error) {
    console.warn('Failed to fetch models from API, using fallback models:', error);
  }
  
  // Fallback models when API is unavailable
  return [
    {
      id: 'gpt-4o-mini',
      name: 'GPT-4O Mini',
      description: 'Fast and efficient OpenAI model for general tasks',
      source: 'openai',
      apiEndpoint: 'https://api.openai.com/v1',
      apiType: 'llmstudio' as const,
      provider: 'OpenAI',
      isAvailable: true
    },
    {
      id: 'claude-3-5-sonnet-20241022',
      name: 'Claude 3.5 Sonnet',
      description: 'Advanced Anthropic model for complex reasoning',
      source: 'anthropic',
      apiEndpoint: 'https://api.anthropic.com',
      apiType: 'llmstudio' as const,
      provider: 'Anthropic',
      isAvailable: true
    },
    {
      id: 'llama-3.2-3b-instruct',
      name: 'Llama 3.2 3B Instruct',
      description: 'Local Ollama model for privacy-focused tasks',
      source: 'localhost:11434',
      apiEndpoint: 'http://localhost:11434',
      apiType: 'ollama' as const,
      provider: 'Meta',
      isAvailable: true
    },
    {
      id: 'mistral-7b-instruct',
      name: 'Mistral 7B Instruct',
      description: 'Efficient local model for general tasks',
      source: 'localhost:11434',
      apiEndpoint: 'http://localhost:11434',
      apiType: 'ollama' as const,
      provider: 'Mistral AI',
      isAvailable: true
    }
  ];
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
  const { toast } = useToast();

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
    isActive: true,
    attachedTools: [] as Array<{toolId: string, toolName: string, category: string, permissions?: string[]}>,
    chatConfig: {
      enableKnowledgeAccess: true,
      enableToolExecution: true,
      enableMemoryEnhancement: true,
      maxConcurrentChats: 5,
      conversationTimeout: 3600000
    }
  });

  // Selected persona state for confirmation step
  const [selectedPersona, setSelectedPersona] = useState<PersonaDisplay | null>(null);

  // Available tools state
  const [availableTools, setAvailableTools] = useState<Array<{id: string, name: string, category: string, description: string}>>([]);

  // Form state for persona creation
  const [personaForm, setPersonaForm] = useState({
    name: '',
    role: '',
    description: '',
    background: '',
    systemPrompt: '',
    tags: [] as string[],
    expertise: [] as string[],
    status: 'active' as const,
    visibility: 'public' as const
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
      
      if (models.length === 0) {
        setModelsError('No models available');
      } else if (models.some(m => m.source === 'localhost:11434' || m.source === 'openai' || m.source === 'anthropic')) {
        // If we have fallback models, show a warning that backend is unavailable
        const hasAPIModels = models.some(m => !['localhost:11434', 'openai', 'anthropic'].includes(m.source));
        if (!hasAPIModels) {
          setModelsError('Backend unavailable - using fallback models');
        }
      }
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
        // Clear existing agents first by removing all current agents
        const currentAgentIds = Object.keys(agents || {});
        currentAgentIds.forEach(agentId => {
          removeAgent(agentId);
        });

        // Add fresh agents from the API
        for (const agentData of response) {
          const agentState = createAgentStateFromBackend(agentData);
          addAgent(agentState);
        }
        
        console.log(`✅ Loaded ${response.length} agents from API`);
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
    if (Object.keys(agents || {}).length > 0) {
      console.log(`✅ Agent Manager: ${Object.keys(agents || {}).length} agents loaded`);
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
      isActive: true,
      attachedTools: [],
      chatConfig: {
        enableKnowledgeAccess: true,
        enableToolExecution: true,
        enableMemoryEnhancement: true,
        maxConcurrentChats: 5,
        conversationTimeout: 3600000
      }
    });
  };

  const navigateToCreatePersona = () => {
    setViewMode('create-persona');
    setActionMode('create-persona');
    setSelectedAgentId(null);
    setPersonaForm({
      name: '',
      role: '',
      description: '',
      background: '',
      systemPrompt: '',
      tags: [],
      expertise: [],
      status: 'active',
      visibility: 'public'
    });
  };

  const navigateToView = () => {
    setViewMode(defaultView);
    setActionMode('view');
    setSelectedAgentId(null);
    setSelectedPersona(null);
  };

  const handlePersonaSelect = (persona: PersonaDisplay) => {
    setSelectedPersona(persona);
  };

  const handleCreateAgent = async () => {
    if (!selectedPersona) return;
    if (!agentForm.name.trim() || !agentForm.modelId || !selectedPersona.id) {
      return;
    }

    try {
      const agentData = {
        name: agentForm.name.trim(),
        role: agentForm.role,
        modelId: agentForm.modelId,
        personaId: selectedPersona.id,
        description: agentForm.description.trim(),
        isActive: agentForm.isActive,
        capabilities: Array.isArray(selectedPersona.expertise) ? selectedPersona.expertise : 
                     (selectedPersona.expertise && typeof selectedPersona.expertise === 'string') ? 
                     selectedPersona.expertise.split(',').map(s => s.trim()).filter(s => s.length > 0) :
                     ['general-assistance'],
        systemPrompt: selectedPersona.background || selectedPersona.description || '',
        temperature: 0.7,
        maxTokens: 2000,
        topP: 0.9,
        frequencyPenalty: 0,
        presencePenalty: 0,
        // Enhanced agent functionality
        attachedTools: agentForm.attachedTools,
        chatConfig: agentForm.chatConfig
      };

      // Validate required fields before sending
      console.log('Creating agent with data:', {
        ...agentData,
        capabilities: agentData.capabilities,
        capabilitiesLength: agentData.capabilities?.length
      });

      if (!agentData.capabilities || agentData.capabilities.length === 0) {
        toast({
          title: 'Validation Error',
          description: 'Agent must have at least one capability',
          variant: 'destructive'
        });
        return;
      }

      const response = await uaipAPI.agents.create(agentData);
      
      if (response.success && response.data) {
        const newAgent = createAgentStateFromBackend(response.data);
        addAgent(newAgent);
        
        // Show success message
        toast({
          title: 'Agent Created',
          description: `Agent "${agentData.name}" has been created successfully`,
        });

        // Refresh the agents list to ensure UI is updated
        await loadExistingAgents();
        
        // Reset form and navigate back
        setAgentForm({
          name: '',
          role: 'assistant' as AgentRole,
          modelId: '',
          personaId: '',
          description: '',
          isActive: true,
          attachedTools: [],
          chatConfig: {
            enableKnowledgeAccess: true,
            enableToolExecution: true,
            enableMemoryEnhancement: true,
            maxConcurrentChats: 5,
            conversationTimeout: 3600000
          }
        });
        setSelectedPersona(null);
        
        navigateToView();
      }
    } catch (error) {
      console.error('Failed to create agent:', error);
    }
  };

  const handleCreatePersona = async () => {
    if (!personaForm.name.trim() || !personaForm.role.trim() || !personaForm.description.trim()) {
      return;
    }

    try {
      const personaData = {
        name: personaForm.name.trim(),
        role: personaForm.role.trim(),
        description: personaForm.description.trim(),
        background: personaForm.background.trim(),
        systemPrompt: personaForm.systemPrompt.trim() || `You are a ${personaForm.role} named ${personaForm.name}. ${personaForm.description}`,
        traits: [], // Will be populated based on role
        expertise: personaForm.expertise.map(exp => ({
          id: `exp-${Date.now()}-${Math.random()}`,
          name: exp,
          category: 'general',
          level: 'intermediate' as const,
          description: `Expertise in ${exp}`,
          keywords: [exp],
          relatedDomains: []
        })),
        conversationalStyle: {
          tone: 'professional' as const,
          verbosity: 'moderate' as const,
          formality: 'neutral' as const,
          empathy: 0.7,
          assertiveness: 0.6,
          creativity: 0.5,
          analyticalDepth: 0.7,
          questioningStyle: 'direct' as const,
          responsePattern: 'structured' as const
        },
        status: personaForm.status,
        visibility: personaForm.visibility,
        tags: personaForm.tags
      };

      const response = await uaipAPI.personas.create(personaData);
      
      if (response) {
        // Reset form and navigate back
        setPersonaForm({
          name: '',
          role: '',
          description: '',
          background: '',
          systemPrompt: '',
          tags: [],
          expertise: [],
          status: 'active',
          visibility: 'public'
        });
        navigateToView();
        
        // Optionally refresh personas in PersonaSelector
        console.log('Persona created successfully:', response);
      }
    } catch (error) {
      console.error('Failed to create persona:', error);
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
    let filtered = Object.values(agents || {});

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

    // Get agent health status
    const getAgentHealth = (agent: AgentState) => {
      if (!agent.isActive) return { status: 'offline', color: 'bg-gray-500', text: 'Offline' };
      if (agent.modelId && agent.personaId) return { status: 'healthy', color: 'bg-green-500', text: 'Healthy' };
      if (agent.modelId || agent.personaId) return { status: 'warning', color: 'bg-yellow-500', text: 'Partial' };
      return { status: 'error', color: 'bg-red-500', text: 'Error' };
    };

    const health = getAgentHealth(agent);

    return (
      <motion.div
        key={agent.id}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay, duration: 0.3 }}
        className={`
          relative group cursor-pointer overflow-hidden
          ${viewMode === 'grid' 
            ? 'bg-gradient-to-br from-slate-800/50 via-slate-800/40 to-slate-900/60 hover:from-slate-700/60 hover:via-slate-700/50 hover:to-slate-800/70 border border-slate-700/50 hover:border-slate-600/60 rounded-xl p-5 transition-all duration-300 shadow-lg hover:shadow-xl' 
            : 'bg-gradient-to-r from-slate-800/40 via-slate-800/30 to-slate-800/20 hover:from-slate-700/50 hover:via-slate-700/40 hover:to-slate-700/30 border-l-4 border-l-blue-500/50 hover:border-l-blue-400 border-t border-b border-r border-slate-700/30 p-4 transition-all duration-300'
          }
          ${isSelected ? 'ring-2 ring-blue-500/60 bg-blue-500/10 shadow-blue-500/20' : ''}
          backdrop-blur-sm
        `}
        onClick={() => navigateToAgent(agent.id)}
        whileHover={{ scale: viewMode === 'grid' ? 1.02 : 1.01 }}
      >
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-blue-500/30 to-transparent rounded-full blur-2xl" />
          <div className="absolute bottom-0 left-0 w-16 h-16 bg-gradient-to-tr from-cyan-500/20 to-transparent rounded-full blur-xl" />
        </div>

        {/* Agent Status & Health Indicator */}
        <div className="absolute top-3 right-3 flex items-center gap-2 z-10">
          <div className={`w-2.5 h-2.5 rounded-full ${health.color} ${agent.isActive ? 'animate-pulse' : ''} shadow-sm`} />
          <div className="text-xs text-slate-300 font-medium px-2 py-1 bg-slate-900/50 rounded-full backdrop-blur-sm">
            {health.text}
          </div>
        </div>

        {/* Quick Action Menu */}
        <div className="absolute top-3 left-3 opacity-0 group-hover:opacity-100 transition-all duration-200 z-10">
          <div className="flex items-center gap-1 bg-slate-900/80 rounded-lg p-1 backdrop-blur-sm shadow-lg">
            <button
              onClick={(e) => {
                e.stopPropagation();
                navigateToAgent(agent.id, 'edit');
              }}
              className="w-7 h-7 bg-slate-700/80 hover:bg-slate-600/80 rounded-md flex items-center justify-center text-slate-300 hover:text-white transition-colors"
              title="Edit Agent"
            >
              <Edit3 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                // TODO: Copy agent configuration
              }}
              className="w-7 h-7 bg-slate-700/80 hover:bg-blue-600/80 rounded-md flex items-center justify-center text-slate-300 hover:text-blue-300 transition-colors"
              title="Duplicate Agent"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteAgent(agent.id);
              }}
              className="w-7 h-7 bg-red-500/20 hover:bg-red-500/40 rounded-md flex items-center justify-center text-red-400 hover:text-red-300 transition-colors"
              title="Delete Agent"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Agent Info */}
        <div className="relative z-10">
          <div className="flex items-start gap-4 mb-4">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 via-cyan-500 to-purple-500 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg ring-2 ring-blue-500/20">
              <Bot className="w-6 h-6 text-white" />
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <h3 className="font-bold text-white truncate text-lg" title={agent.name}>
                  {agent.name}
                </h3>
                <span className="text-xs px-2.5 py-1 bg-gradient-to-r from-blue-500/20 to-cyan-500/20 text-blue-300 rounded-full capitalize font-semibold border border-blue-500/30 shadow-sm">
                  {agent.role}
                </span>
              </div>
              
              {/* Persona Tag */}
              <div className="mb-3">
                <span 
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gradient-to-r from-purple-500/20 to-pink-500/20 text-purple-300 text-xs rounded-full font-semibold border border-purple-500/30 max-w-full shadow-sm"
                  title={getPersonaDisplayName(agent)}
                >
                  <User className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="truncate">
                    {getPersonaDisplayName(agent).length > 15 
                      ? `${getPersonaDisplayName(agent).substring(0, 15)}...` 
                      : getPersonaDisplayName(agent)
                    }
                  </span>
                </span>
              </div>
              
              {/* Model Tag */}
              <div className="mb-3">
                <span 
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gradient-to-r from-slate-700/60 to-slate-600/60 text-slate-300 text-xs rounded-full font-semibold border border-slate-600/40 max-w-full shadow-sm"
                  title={agent.modelId}
                >
                  <Cpu className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="truncate">
                    {getModelDisplayName(agent.modelId).length > 12 
                      ? `${getModelDisplayName(agent.modelId).substring(0, 12)}...` 
                      : getModelDisplayName(agent.modelId)
                    }
                  </span>
                </span>
              </div>
              
              {/* Description */}
              {agent.description && (
                <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed" title={agent.description}>
                  {agent.description.length > 80 
                    ? `${agent.description.substring(0, 80)}...` 
                    : agent.description
                  }
                </p>
              )}
            </div>
          </div>

          {/* Agent Stats/Metrics (if in grid view) */}
          {viewMode === 'grid' && (
            <div className="flex items-center justify-between text-xs text-slate-400 pt-3 border-t border-slate-700/50">
              <div className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                <span>Last active</span>
              </div>
              <div className="flex items-center gap-1">
                <BarChart3 className="w-3 h-3" />
                <span>Performance</span>
              </div>
              <div className="flex items-center gap-1">
                <Shield className="w-3 h-3" />
                <span>Security</span>
              </div>
            </div>
          )}

          {/* Hover Actions */}
          <div className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-all duration-200">
            <div className="flex items-center gap-1">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  // TODO: Start/Stop agent
                }}
                className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                  agent.isActive 
                    ? 'bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 hover:text-orange-300' 
                    : 'bg-green-500/20 hover:bg-green-500/30 text-green-400 hover:text-green-300'
                }`}
                title={agent.isActive ? 'Pause Agent' : 'Start Agent'}
              >
                {agent.isActive ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  // TODO: View agent details/metrics
                }}
                className="w-8 h-8 bg-blue-500/20 hover:bg-blue-500/30 rounded-lg flex items-center justify-center text-blue-400 hover:text-blue-300 transition-colors"
                title="View Details"
              >
                <BarChart3 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    );
  };

  // Helper functions for tool attachment and chat configuration
  const mockAvailableTools = [
    { id: 'web-search', name: 'Web Search', category: 'search', description: 'Search the web for information' },
    { id: 'document-analyzer', name: 'Document Analyzer', category: 'analysis', description: 'Analyze documents and extract insights' },
    { id: 'code-executor', name: 'Code Executor', category: 'development', description: 'Execute and test code snippets' },
    { id: 'data-processor', name: 'Data Processor', category: 'data', description: 'Process and transform data' },
    { id: 'image-generator', name: 'Image Generator', category: 'creative', description: 'Generate images from text descriptions' },
    { id: 'email-sender', name: 'Email Sender', category: 'communication', description: 'Send emails and notifications' },
    { id: 'calendar-manager', name: 'Calendar Manager', category: 'productivity', description: 'Manage calendar events and scheduling' },
    { id: 'file-manager', name: 'File Manager', category: 'utility', description: 'Manage files and directories' }
  ];

  const toggleToolAttachment = (tool: {id: string, name: string, category: string, description: string}) => {
    setAgentForm(prev => {
      const isAttached = prev.attachedTools?.some(t => t.toolId === tool.id) || false;
      if (isAttached) {
        return {
          ...prev,
          attachedTools: (prev.attachedTools || []).filter(t => t.toolId !== tool.id)
        };
      } else {
        return {
          ...prev,
          attachedTools: [...(prev.attachedTools || []), {
            toolId: tool.id,
            toolName: tool.name,
            category: tool.category,
            permissions: ['execute', 'read']
          }]
        };
      }
    });
  };

  const removeToolAttachment = (toolId: string) => {
    setAgentForm(prev => ({
      ...prev,
      attachedTools: prev.attachedTools.filter(t => t.toolId !== toolId)
    }));
  };

  const updateChatConfig = (key: string, value: any) => {
    setAgentForm(prev => ({
      ...prev,
      chatConfig: {
        enableKnowledgeAccess: true,
        enableToolExecution: true,
        enableMemoryEnhancement: true,
        maxConcurrentChats: 5,
        conversationTimeout: 3600000,
        ...prev.chatConfig,
        [key]: value
      }
    }));
  };

  const renderHeader = () => (
    <div className="flex items-center justify-between mb-6">
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 bg-gradient-to-br from-blue-500 via-cyan-500 to-purple-500 rounded-xl flex items-center justify-center shadow-lg ring-2 ring-blue-500/20">
          {mode === 'spawner' ? <Zap className="w-5 h-5 text-white" /> : 
           mode === 'monitor' ? <Activity className="w-5 h-5 text-white" /> :
           <Users className="w-5 h-5 text-white" />}
        </div>
        <div>
          <h2 className="text-2xl font-bold text-white">
            {mode === 'spawner' ? 'Agent Spawner' : 
             mode === 'monitor' ? 'Agent Monitor' : 
             viewMode === 'settings' ? 'Agent Settings' :
             'Agent Manager'}
          </h2>
          <div className="flex items-center gap-3">
            <p className="text-sm text-slate-400">
              {mode === 'spawner' ? 'Create and deploy new agents' :
               mode === 'monitor' ? 'Monitor agent performance and status' :
               viewMode === 'settings' ? 'Configure agent models and personas' :
               `${Object.values(agents || {}).length} active agent${Object.values(agents || {}).length !== 1 ? 's' : ''}`}
            </p>
            {Object.values(agents || {}).length > 0 && viewMode !== 'settings' && (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 px-2 py-1 bg-green-500/20 text-green-400 text-xs rounded-full font-medium">
                  <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                  {Object.values(agents || {}).filter(a => a.isActive).length} Online
                </div>
                <div className="flex items-center gap-1 px-2 py-1 bg-slate-500/20 text-slate-400 text-xs rounded-full font-medium">
                  <div className="w-1.5 h-1.5 bg-slate-400 rounded-full" />
                  {Object.values(agents || {}).filter(a => !a.isActive).length} Offline
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* Quick Stats */}
        {Object.values(agents || {}).length > 0 && viewMode !== 'settings' && (
          <div className="hidden md:flex items-center gap-2 bg-slate-800/50 rounded-lg p-2">
            <div className="flex items-center gap-1 text-xs text-slate-400">
              <Gauge className="w-3 h-3" />
              <span>Status</span>
            </div>
            <div className="w-px h-4 bg-slate-600/50" />
            <div className="flex items-center gap-1 text-xs text-green-400">
              <CheckCircle2 className="w-3 h-3" />
              <span>{Object.values(agents || {}).filter(a => a.modelId && a.personaId).length} Ready</span>
            </div>
          </div>
        )}

        {/* View Mode Toggle */}
        <div className="flex items-center bg-slate-800/50 rounded-lg p-1 border border-slate-700/50">
          <button
            onClick={() => setViewMode('grid')}
            className={`p-2 rounded-md transition-all duration-200 ${
              viewMode === 'grid' 
                ? 'bg-blue-500/20 text-blue-400 shadow-sm' 
                : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
            }`}
            title="Grid View"
          >
            <Grid className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`p-2 rounded-md transition-all duration-200 ${
              viewMode === 'list' 
                ? 'bg-blue-500/20 text-blue-400 shadow-sm' 
                : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
            }`}
            title="List View"
          >
            <List className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode('settings')}
            className={`p-2 rounded-md transition-all duration-200 ${
              viewMode === 'settings' 
                ? 'bg-blue-500/20 text-blue-400 shadow-sm' 
                : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
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
          className="p-2 bg-slate-800/50 hover:bg-slate-700/50 rounded-lg text-slate-400 hover:text-white transition-colors disabled:opacity-50 border border-slate-700/50 shadow-sm"
          title="Refresh Data"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
        </button>

        {/* Create Buttons */}
        {viewMode !== 'settings' && (
          <div className="flex items-center gap-2">
            <button
              onClick={navigateToCreatePersona}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white rounded-lg transition-all duration-300 font-semibold shadow-lg hover:shadow-xl transform hover:scale-105"
            >
              <User className="w-4 h-4" />
              {currentViewport.isMobile ? '' : 'Create Persona'}
            </button>
            
            <button
              onClick={navigateToCreate}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white rounded-lg transition-all duration-300 font-semibold shadow-lg hover:shadow-xl transform hover:scale-105"
            >
              <Plus className="w-4 h-4" />
              {currentViewport.isMobile ? '' : 'Create Agent'}
            </button>
          </div>
        )}
      </div>
    </div>
  );

  const renderFilters = () => (
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 mb-6">
      {/* Search */}
      <div className="flex-1 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          placeholder="Search agents by name, role, or description..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-3 bg-slate-800/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all duration-200 shadow-sm"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 bg-slate-600/50 hover:bg-slate-500/50 rounded-full flex items-center justify-center text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Filters Row */}
      <div className="flex items-center gap-3">
        {/* Role Filter */}
        <div className="relative">
          <select
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value)}
            className="pl-3 pr-10 py-3 bg-slate-800/50 border border-slate-700/50 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all duration-200 appearance-none min-w-[140px] shadow-sm"
          >
            <option value="">All Roles</option>
            <option value="assistant">Assistant</option>
            <option value="analyst">Analyst</option>
            <option value="coordinator">Coordinator</option>
            <option value="specialist">Specialist</option>
          </select>
          <Filter className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        </div>

        {/* Status Filter */}
        <div className="relative">
          <select
            value={viewMode === 'grid' ? 'active' : 'all'}
            onChange={(e) => {
              // TODO: Implement status filtering
            }}
            className="pl-3 pr-10 py-3 bg-slate-800/50 border border-slate-700/50 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all duration-200 appearance-none min-w-[120px] shadow-sm"
          >
            <option value="all">All Status</option>
            <option value="active">Active Only</option>
            <option value="inactive">Inactive Only</option>
            <option value="healthy">Healthy Only</option>
            <option value="issues">With Issues</option>
          </select>
          <Shield className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        </div>

        {/* Clear Filters */}
        {(searchQuery || filterRole) && (
          <button
            onClick={() => {
              setSearchQuery('');
              setFilterRole('');
            }}
            className="px-3 py-3 bg-slate-700/50 hover:bg-slate-600/50 text-slate-300 hover:text-white rounded-lg transition-colors flex items-center gap-2 text-sm font-medium border border-slate-600/50 shadow-sm"
            title="Clear all filters"
          >
            <X className="w-4 h-4" />
            <span className="hidden sm:inline">Clear</span>
          </button>
        )}

        {/* Sort Options */}
        <div className="relative">
          <select
            value="name"
            onChange={(e) => {
              // TODO: Implement sorting
            }}
            className="pl-3 pr-10 py-3 bg-slate-800/50 border border-slate-700/50 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all duration-200 appearance-none min-w-[140px] shadow-sm"
          >
            <option value="name">Sort by Name</option>
            <option value="role">Sort by Role</option>
            <option value="status">Sort by Status</option>
            <option value="created">Sort by Created</option>
            <option value="updated">Sort by Updated</option>
          </select>
          <BarChart3 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        </div>
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
          onSelectPersona={handlePersonaSelect}
          disabled={!agentForm.name.trim() || !agentForm.modelId}
        />
      </div>

      {/* Selected Persona Confirmation */}
      {selectedPersona && (
        <div className="border border-slate-700/50 rounded-lg p-4 bg-slate-800/30">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-medium text-slate-300">Selected Persona</h4>
            <button
              onClick={() => setSelectedPersona(null)}
              className="text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <span className="text-sm font-medium text-white">{selectedPersona.name}</span>
              <span className="text-xs px-2 py-1 bg-blue-500/20 text-blue-300 rounded-full">
                {selectedPersona.role}
              </span>
            </div>
            <p className="text-sm text-slate-400">{selectedPersona.description}</p>
            {selectedPersona.tags && selectedPersona.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {selectedPersona.tags.map((tag, index) => (
                  <span key={index} className="text-xs px-2 py-1 bg-slate-700/50 text-slate-300 rounded">
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tool Attachment Section */}
      {selectedPersona && (
        <div className="border border-slate-700/50 rounded-lg p-4 bg-slate-800/30">
          <h4 className="text-sm font-medium text-slate-300 mb-3">Tool Attachment</h4>
          <div className="space-y-3">
            {/* Available Tools */}
            <div>
              <label className="block text-xs text-slate-400 mb-2">Available Tools</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-32 overflow-y-auto">
                {mockAvailableTools.map((tool) => (
                  <div
                    key={tool.id}
                    className={`p-2 border rounded cursor-pointer transition-colors ${
                      agentForm.attachedTools?.some(t => t.toolId === tool.id)
                        ? 'border-blue-500 bg-blue-500/10 text-blue-300'
                        : 'border-slate-600 hover:border-slate-500 text-slate-300'
                    }`}
                    onClick={() => toggleToolAttachment(tool)}
                  >
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-medium">{tool.name}</span>
                      <span className="text-xs px-1 py-0.5 bg-slate-600 rounded">{tool.category}</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">{tool.description}</p>
                  </div>
                ))}
              </div>
            </div>
            
            {/* Attached Tools Summary */}
            {(agentForm.attachedTools?.length || 0) > 0 && (
              <div>
                <label className="block text-xs text-slate-400 mb-2">
                  Attached Tools ({agentForm.attachedTools?.length || 0})
                </label>
                <div className="flex flex-wrap gap-1">
                  {(agentForm.attachedTools || []).map((tool, index) => (
                    <span
                      key={index}
                      className="text-xs px-2 py-1 bg-blue-500/20 text-blue-300 rounded flex items-center gap-1"
                    >
                      {tool.toolName}
                      <button
                        onClick={() => removeToolAttachment(tool.toolId)}
                        className="hover:text-blue-100 transition-colors"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Chat Configuration Section */}
      {selectedPersona && (
        <div className="border border-slate-700/50 rounded-lg p-4 bg-slate-800/30">
          <h4 className="text-sm font-medium text-slate-300 mb-3">Chat Configuration</h4>
          <div className="space-y-3">
            {/* Chat Capabilities */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={agentForm.chatConfig?.enableKnowledgeAccess || false}
                  onChange={(e) => updateChatConfig('enableKnowledgeAccess', e.target.checked)}
                  className="w-4 h-4 text-blue-600 bg-slate-800 border-slate-600 rounded focus:ring-blue-500 focus:ring-2"
                />
                <span className="text-xs text-slate-300">Knowledge Access</span>
              </label>
              
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={agentForm.chatConfig?.enableToolExecution || false}
                  onChange={(e) => updateChatConfig('enableToolExecution', e.target.checked)}
                  className="w-4 h-4 text-blue-600 bg-slate-800 border-slate-600 rounded focus:ring-blue-500 focus:ring-2"
                />
                <span className="text-xs text-slate-300">Tool Execution</span>
              </label>
              
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={agentForm.chatConfig?.enableMemoryEnhancement || false}
                  onChange={(e) => updateChatConfig('enableMemoryEnhancement', e.target.checked)}
                  className="w-4 h-4 text-blue-600 bg-slate-800 border-slate-600 rounded focus:ring-blue-500 focus:ring-2"
                />
                <span className="text-xs text-slate-300">Memory Enhancement</span>
              </label>
            </div>

            {/* Chat Settings */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Max Concurrent Chats</label>
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={agentForm.chatConfig?.maxConcurrentChats || 5}
                  onChange={(e) => updateChatConfig('maxConcurrentChats', parseInt(e.target.value))}
                  className="w-full px-2 py-1 text-xs bg-slate-800/50 border border-slate-700/50 rounded text-white"
                />
              </div>
              
              <div>
                <label className="block text-xs text-slate-400 mb-1">Conversation Timeout (minutes)</label>
                <input
                  type="number"
                  min="5"
                  max="1440"
                  value={Math.floor((agentForm.chatConfig?.conversationTimeout || 3600000) / 60000)}
                  onChange={(e) => updateChatConfig('conversationTimeout', parseInt(e.target.value) * 60000)}
                  className="w-full px-2 py-1 text-xs bg-slate-800/50 border border-slate-700/50 rounded text-white"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Agent Button */}
      {selectedPersona && (
        <div className="flex justify-end pt-4">
          <button
            onClick={handleCreateAgent}
            disabled={!agentForm.name.trim() || !agentForm.modelId || !selectedPersona}
            className="px-6 py-2 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 disabled:from-slate-600 disabled:to-slate-700 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-all duration-200 transform hover:scale-105 disabled:scale-100"
          >
            Create Agent
          </button>
        </div>
      )}
    </motion.div>
  );

  const renderCreatePersonaForm = () => (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-6"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">Create New Persona</h3>
        <button
          onClick={navigateToView}
          className="p-2 hover:bg-slate-700/50 rounded-lg text-slate-400 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Persona Name */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Persona Name *
          </label>
          <input
            type="text"
            value={personaForm.name}
            onChange={(e) => setPersonaForm(prev => ({ ...prev, name: e.target.value }))}
            placeholder="Enter persona name..."
            className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 transition-colors"
          />
        </div>

        {/* Persona Role */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Role/Title *
          </label>
          <input
            type="text"
            value={personaForm.role}
            onChange={(e) => setPersonaForm(prev => ({ ...prev, role: e.target.value }))}
            placeholder="e.g., Software Engineer, Data Scientist..."
            className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 transition-colors"
          />
        </div>

        {/* Status */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Status
          </label>
          <select
            value={personaForm.status}
            onChange={(e) => setPersonaForm(prev => ({ ...prev, status: e.target.value as 'active' | 'inactive' }))}
            className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 transition-colors"
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>

        {/* Visibility */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Visibility
          </label>
          <select
            value={personaForm.visibility}
            onChange={(e) => setPersonaForm(prev => ({ ...prev, visibility: e.target.value as 'public' | 'private' }))}
            className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 transition-colors"
          >
            <option value="public">Public</option>
            <option value="private">Private</option>
          </select>
        </div>
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-2">
          Description *
        </label>
        <textarea
          value={personaForm.description}
          onChange={(e) => setPersonaForm(prev => ({ ...prev, description: e.target.value }))}
          placeholder="Describe the persona's characteristics and purpose..."
          rows={3}
          className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 transition-colors resize-none"
        />
      </div>

      {/* Background */}
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-2">
          Background (Optional)
        </label>
        <textarea
          value={personaForm.background}
          onChange={(e) => setPersonaForm(prev => ({ ...prev, background: e.target.value }))}
          placeholder="Provide detailed background information about the persona's experience and history..."
          rows={4}
          className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 transition-colors resize-none"
        />
      </div>

      {/* Expertise */}
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-2">
          Expertise Areas (Optional)
        </label>
        <input
          type="text"
          value={personaForm.expertise.join(', ')}
          onChange={(e) => setPersonaForm(prev => ({ 
            ...prev, 
            expertise: e.target.value.split(',').map(s => s.trim()).filter(s => s.length > 0)
          }))}
          placeholder="Enter expertise areas separated by commas (e.g., Python, Machine Learning, Data Analysis)"
          className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 transition-colors"
        />
        <p className="text-xs text-slate-500 mt-1">Separate multiple areas with commas</p>
      </div>

      {/* Tags */}
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-2">
          Tags (Optional)
        </label>
        <input
          type="text"
          value={personaForm.tags.join(', ')}
          onChange={(e) => setPersonaForm(prev => ({ 
            ...prev, 
            tags: e.target.value.split(',').map(s => s.trim()).filter(s => s.length > 0)
          }))}
          placeholder="Enter tags separated by commas (e.g., technical, analytical, creative)"
          className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 transition-colors"
        />
        <p className="text-xs text-slate-500 mt-1">Separate multiple tags with commas</p>
      </div>

      {/* System Prompt */}
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-2">
          System Prompt (Optional)
        </label>
        <textarea
          value={personaForm.systemPrompt}
          onChange={(e) => setPersonaForm(prev => ({ ...prev, systemPrompt: e.target.value }))}
          placeholder="Custom system prompt for the persona (if left empty, will be auto-generated)"
          rows={4}
          className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 transition-colors resize-none"
        />
        <p className="text-xs text-slate-500 mt-1">If empty, a system prompt will be generated automatically based on the role and description</p>
      </div>

      {/* Create Button */}
      <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-700/50">
        <button
          onClick={navigateToView}
          className="px-6 py-2 text-slate-400 hover:text-white transition-colors font-medium"
        >
          Cancel
        </button>
        <button
          onClick={handleCreatePersona}
          disabled={!personaForm.name.trim() || !personaForm.role.trim() || !personaForm.description.trim()}
          className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 disabled:from-slate-600 disabled:to-slate-600 text-white rounded-lg transition-all duration-300 font-semibold disabled:cursor-not-allowed"
        >
          <User className="w-4 h-4" />
          Create Persona
        </button>
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
        {Object.values(agents || {}).length === 0 ? (
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
      <div className="h-full relative overflow-hidden">
        {/* Background with enhanced gradients and patterns */}
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900/95 via-slate-800/90 to-slate-900/95 backdrop-blur-xl" />
        <div className="absolute inset-0 bg-gradient-to-tr from-blue-500/5 via-transparent to-cyan-500/10" />
        <div className="absolute inset-0 bg-gradient-to-bl from-purple-500/5 via-transparent to-pink-500/5" />
        
        {/* Animated background elements */}
        <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-gradient-to-br from-blue-500/10 to-transparent rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-48 h-48 bg-gradient-to-tl from-cyan-500/10 to-transparent rounded-full blur-2xl animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/2 right-1/3 w-32 h-32 bg-gradient-to-tr from-purple-500/10 to-transparent rounded-full blur-xl animate-pulse" style={{ animationDelay: '2s' }} />
        
        {/* Grid pattern overlay */}
        <div className="absolute inset-0 opacity-[0.02]" style={{
          backgroundImage: `
            linear-gradient(rgba(59, 130, 246, 0.5) 1px, transparent 1px),
            linear-gradient(90deg, rgba(59, 130, 246, 0.5) 1px, transparent 1px)
          `,
          backgroundSize: '50px 50px'
        }} />
        
        {/* Main content */}
        <div className="relative h-full border border-slate-700/30 rounded-2xl backdrop-blur-sm shadow-2xl">
          <div className="h-full p-4 md:p-6 overflow-y-auto custom-scrollbar">
            {viewMode === 'create' ? (
              renderCreateForm()
            ) : viewMode === 'create-persona' ? (
              renderCreatePersonaForm()
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
                        'grid-cols-3 xl:grid-cols-4'
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
                    className="text-center py-16"
                  >
                    <div className="relative mb-8">
                      {/* Main Icon */}
                      <div className="w-24 h-24 bg-gradient-to-br from-slate-800/50 via-slate-700/50 to-slate-600/50 rounded-3xl flex items-center justify-center mx-auto border border-slate-600/30 shadow-xl">
                        <Bot className="w-12 h-12 text-slate-400" />
                      </div>
                      
                      {/* Floating Elements */}
                      <div className="absolute -top-2 -right-2 w-8 h-8 bg-gradient-to-br from-blue-500/20 to-cyan-500/20 rounded-full flex items-center justify-center border border-blue-500/30">
                        <Sparkles className="w-4 h-4 text-blue-400" />
                      </div>
                      <div className="absolute -bottom-2 -left-2 w-6 h-6 bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded-full flex items-center justify-center border border-purple-500/30">
                        <Brain className="w-3 h-3 text-purple-400" />
                      </div>
                      
                      {/* Pulse Effect */}
                      <div className="absolute inset-0 w-24 h-24 mx-auto bg-gradient-to-br from-blue-500/10 to-cyan-500/10 rounded-3xl animate-pulse" />
                    </div>

                    <div className="max-w-md mx-auto">
                      <h3 className="text-xl font-bold text-white mb-3">
                        {searchQuery || filterRole ? 'No agents found' : 'Welcome to Agent Manager'}
                      </h3>
                      <p className="text-slate-400 mb-8 leading-relaxed">
                        {searchQuery || filterRole 
                          ? 'No agents match your current search criteria. Try adjusting your filters or search terms.'
                          : 'Create intelligent AI agents to automate tasks, analyze data, and collaborate with your team. Each agent can have unique personalities, skills, and capabilities.'
                        }
                      </p>

                      {!searchQuery && !filterRole ? (
                        <div className="space-y-4">
                          <button
                            onClick={navigateToCreate}
                            className="flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white rounded-xl transition-all duration-300 font-semibold mx-auto shadow-lg hover:shadow-xl transform hover:scale-105"
                          >
                            <Plus className="w-5 h-5" />
                            Create Your First Agent
                          </button>
                          
                          <div className="flex items-center justify-center gap-4 text-xs text-slate-500">
                            <div className="flex items-center gap-1">
                              <Lightbulb className="w-3 h-3" />
                              <span>AI-Powered</span>
                            </div>
                            <div className="w-px h-3 bg-slate-600" />
                            <div className="flex items-center gap-1">
                              <Target className="w-3 h-3" />
                              <span>Task-Focused</span>
                            </div>
                            <div className="w-px h-3 bg-slate-600" />
                            <div className="flex items-center gap-1">
                              <Workflow className="w-3 h-3" />
                              <span>Collaborative</span>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                          <button
                            onClick={() => {
                              setSearchQuery('');
                              setFilterRole('');
                            }}
                            className="flex items-center gap-2 px-6 py-3 bg-slate-700/50 hover:bg-slate-600/50 text-slate-300 hover:text-white rounded-lg transition-colors font-medium border border-slate-600/50"
                          >
                            <RefreshCw className="w-4 h-4" />
                            Clear Filters
                          </button>
                          <button
                            onClick={navigateToCreate}
                            className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white rounded-lg transition-all duration-300 font-medium"
                          >
                            <Plus className="w-4 h-4" />
                            Create New Agent
                          </button>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}

                {renderPagination()}
              </>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}; 