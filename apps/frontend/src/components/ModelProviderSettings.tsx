import React, { useState, useEffect, useCallback } from 'react';
import {
  Settings,
  Server,
  Globe,
  Cpu,
  Save,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Trash2,
  Plus,
  Edit3,
  X,
  Eye,
  EyeOff,
  ExternalLink,
  Activity,
  Zap
} from 'lucide-react';
import { uaipAPI } from '../utils/uaip-api';

interface ModelProvider {
  id: string;
  name: string;
  description?: string;
  type: string;
  baseUrl: string;
  defaultModel?: string;
  status: string;
  isActive: boolean;
  priority: number;
  totalTokensUsed: number;
  totalRequests: number;
  totalErrors: number;
  lastUsedAt?: string;
  healthCheckResult?: any;
  hasApiKey: boolean;
  createdAt: string;
  updatedAt: string;
}

interface CreateProviderForm {
  name: string;
  description: string;
  type: string;
  baseUrl: string;
  apiKey: string;
  defaultModel: string;
  priority: number;
}

interface ModelProviderSettingsProps {
  className?: string;
  // Enhanced props for better integration with AgentContext
  providers?: ModelProvider[];
  models?: Array<{
    id: string;
    name: string;
    description?: string;
    source: string;
    apiEndpoint: string;
    apiType: 'ollama' | 'llmstudio' | 'openai' | 'anthropic' | 'custom';
    provider: string;
    isAvailable: boolean;
  }>;
  loading?: boolean;
  error?: string | null;
  onCreateProvider?: (providerData: {
    name: string;
    description?: string;
    type: string;
    baseUrl: string;
    apiKey?: string;
    defaultModel?: string;
    configuration?: any;
    priority?: number;
  }) => Promise<boolean>;
  onUpdateProvider?: (providerId: string, config: {
    name?: string;
    description?: string;
    baseUrl?: string;
    defaultModel?: string;
    priority?: number;
    configuration?: any;
  }) => Promise<boolean>;
  onTestProvider?: (providerId: string) => Promise<any>;
  onDeleteProvider?: (providerId: string) => Promise<boolean>;
  onRefresh?: () => Promise<void>;
}

export const ModelProviderSettings: React.FC<ModelProviderSettingsProps> = ({
  className = '',
  providers: propProviders = [],
  models: propModels = [],
  loading: propLoading = false,
  error: propError = null,
  onCreateProvider,
  onUpdateProvider,
  onTestProvider,
  onDeleteProvider,
  onRefresh
}) => {
  const [providers, setProviders] = useState<ModelProvider[]>(propProviders);
  const [loading, setLoading] = useState(propLoading);
  const [error, setError] = useState<string | null>(propError);
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
  const [providerModels, setProviderModels] = useState<Record<string, any[]>>({});
  const [loadingModels, setLoadingModels] = useState<Set<string>>(new Set());

  // Add Provider Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [addingProvider, setAddingProvider] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [formData, setFormData] = useState<CreateProviderForm>({
    name: '',
    description: '',
    type: 'ollama',
    baseUrl: '',
    apiKey: '',
    defaultModel: '',
    priority: 100
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Edit Provider Modal State
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingProvider, setEditingProvider] = useState<ModelProvider | null>(null);
  const [editFormData, setEditFormData] = useState<CreateProviderForm>({
    name: '',
    description: '',
    type: 'ollama',
    baseUrl: '',
    apiKey: '',
    defaultModel: '',
    priority: 100
  });
  const [editFormErrors, setEditFormErrors] = useState<Record<string, string>>({});
  const [updatingProvider, setUpdatingProvider] = useState(false);
  const [testResult, setTestResult] = useState<Record<string, string | null>>({});
  const [testingProvider, setTestingProvider] = useState<string | null>(null);

  // Provider type configurations
  const providerTypes = [
    {
      id: 'ollama',
      name: 'Ollama',
      description: 'Local Ollama instance',
      defaultUrl: 'http://localhost:11434',
      requiresApiKey: false,
      icon: Globe
    },
    {
      id: 'openai',
      name: 'OpenAI',
      description: 'OpenAI API service',
      defaultUrl: 'https://api.openai.com',
      requiresApiKey: true,
      icon: Zap
    },
    {
      id: 'llmstudio',
      name: 'LLM Studio',
      description: 'Local LLM Studio instance',
      defaultUrl: 'http://localhost:1234',
      requiresApiKey: false,
      icon: Server
    },
    {
      id: 'anthropic',
      name: 'Anthropic',
      description: 'Anthropic Claude API',
      defaultUrl: 'https://api.anthropic.com',
      requiresApiKey: true,
      icon: Cpu
    },
    {
      id: 'custom',
      name: 'Custom',
      description: 'Custom API endpoint',
      defaultUrl: '',
      requiresApiKey: false,
      icon: Cpu
    }
  ];

  // Sync with prop data
  useEffect(() => {
    setProviders(propProviders);
  }, [propProviders]);

  useEffect(() => {
    setLoading(propLoading);
  }, [propLoading]);

  useEffect(() => {
    setError(propError);
  }, [propError]);

  // Load providers (fallback when no props provided)
  const loadProviders = useCallback(async () => {
    // Don't load if we already have prop data or if we're currently loading
    if (propProviders.length > 0 || loading) return;

    setLoading(true);
    setError(null);

    try {
      console.log('[ModelProviderSettings] Loading providers...');
      console.log('[ModelProviderSettings] API client info:', uaipAPI.getEnvironmentInfo());

      const providers = await uaipAPI.llm.getProviders();
      console.log('[ModelProviderSettings] Providers loaded:', providers);

      setProviders(providers || []);
    } catch (error) {
      console.error('Failed to load providers:', error);
      setError(error instanceof Error ? error.message : 'Failed to load providers');
      setProviders([]);
    } finally {
      setLoading(false);
    }
  }, [propProviders.length, loading]);

  // Load models for a specific provider
  const loadProviderModels = useCallback(async (providerType: string) => {
    if (loadingModels.has(providerType)) return;

    setLoadingModels(prev => new Set(prev).add(providerType));

    try {
      // Use prop models if available, otherwise fetch from API
      let models = propModels;
      if (models.length === 0) {
        models = await uaipAPI.llm.getModels();
      }

      // Filter models by provider type
      const filteredModels = models.filter(model =>
        model.provider?.toLowerCase() === providerType.toLowerCase() ||
        model.apiType?.toLowerCase() === providerType.toLowerCase()
      );

      setProviderModels(prev => ({
        ...prev,
        [providerType]: filteredModels
      }));
    } catch (error) {
      console.error(`Failed to load models for ${providerType}:`, error);
      setProviderModels(prev => ({
        ...prev,
        [providerType]: []
      }));
    } finally {
      setLoadingModels(prev => {
        const newSet = new Set(prev);
        newSet.delete(providerType);
        return newSet;
      });
    }
  }, [propModels]);

  // Only load providers if no props provided and not already loaded
  useEffect(() => {
    if (propProviders.length === 0 && providers.length === 0 && !loading) {
      loadProviders();
    }
  }, []); // Empty dependency array to run only once

  // Form handling
  const handleFormChange = (field: keyof CreateProviderForm, value: string | number) => {
    setFormData(prev => ({ ...prev, [field]: value }));

    // Clear error for this field
    if (formErrors[field]) {
      setFormErrors(prev => ({ ...prev, [field]: '' }));
    }

    // Auto-populate base URL when provider type changes
    if (field === 'type') {
      const providerType = providerTypes.find(p => p.id === value);
      if (providerType?.defaultUrl) {
        setFormData(prev => ({ ...prev, baseUrl: providerType.defaultUrl }));
      }
    }
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!formData.name.trim()) {
      errors.name = 'Provider name is required';
    }

    if (!formData.type) {
      errors.type = 'Provider type is required';
    }

    if (!formData.baseUrl.trim()) {
      errors.baseUrl = 'Base URL is required';
    } else {
      try {
        new URL(formData.baseUrl);
      } catch {
        errors.baseUrl = 'Invalid URL format';
      }
    }

    const selectedType = providerTypes.find(p => p.id === formData.type);
    // API key is optional - only validate if provided
    if (formData.apiKey.trim() && selectedType?.requiresApiKey) {
      // Additional validation can be added here if needed
    }

    if (formData.priority < 0 || formData.priority > 1000) {
      errors.priority = 'Priority must be between 0 and 1000';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleCreateProvider = async () => {
    if (!validateForm()) return;

    setAddingProvider(true);

    try {
      const providerData = {
        name: formData.name.trim(),
        description: formData.description.trim() || undefined,
        type: formData.type,
        baseUrl: formData.baseUrl.trim(),
        apiKey: formData.apiKey.trim() || undefined,
        defaultModel: formData.defaultModel.trim() || undefined,
        priority: formData.priority
      };

      // Use callback if provided, otherwise use direct API call
      if (onCreateProvider) {
        await onCreateProvider(providerData);
      } else {
        await uaipAPI.llm.createProvider(providerData);
      }

      // Always refresh the local provider list
      await loadProviders();

      // Reset form and close modal
      resetForm();
      setShowAddModal(false);

    } catch (error) {
      console.error('Failed to create provider:', error);
      setFormErrors(prev => ({
        ...prev,
        general: error instanceof Error ? error.message : 'Failed to create provider'
      }));
    } finally {
      setAddingProvider(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      type: 'ollama',
      baseUrl: '',
      apiKey: '',
      defaultModel: '',
      priority: 100
    });
    setFormErrors({});
    setShowApiKey(false);
  };

  const handleCloseModal = () => {
    setShowAddModal(false);
    resetForm();
  };

  // Edit Modal Handlers
  const openEditModal = (provider: ModelProvider) => {
    setEditingProvider(provider);
    setEditFormData({
      name: provider.name,
      description: provider.description || '',
      type: provider.type,
      baseUrl: provider.baseUrl,
      apiKey: '', // Don't prefill API key for security
      defaultModel: provider.defaultModel || '',
      priority: provider.priority
    });
    setEditFormErrors({});
    setShowEditModal(true);
  };

  const closeEditModal = () => {
    setShowEditModal(false);
    setEditingProvider(null);
    setEditFormErrors({});
  };

  const handleEditFormChange = (field: keyof CreateProviderForm, value: string | number) => {
    setEditFormData(prev => ({ ...prev, [field]: value }));
    if (editFormErrors[field]) {
      setEditFormErrors(prev => ({ ...prev, [field]: '' }));
    }
    if (field === 'type') {
      const providerType = providerTypes.find(p => p.id === value);
      if (providerType?.defaultUrl) {
        setEditFormData(prev => ({ ...prev, baseUrl: providerType.defaultUrl }));
      }
    }
  };

  const validateEditForm = (): boolean => {
    const errors: Record<string, string> = {};
    if (!editFormData.name.trim()) errors.name = 'Provider name is required';
    if (!editFormData.type) errors.type = 'Provider type is required';
    if (!editFormData.baseUrl.trim()) {
      errors.baseUrl = 'Base URL is required';
    } else {
      try { new URL(editFormData.baseUrl); } catch { errors.baseUrl = 'Invalid URL format'; }
    }
    // For edit, API key is optional - if empty, we keep the existing one
    // Only validate if user has entered a value
    if (editFormData.priority < 0 || editFormData.priority > 1000) {
      errors.priority = 'Priority must be between 0 and 1000';
    }
    setEditFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleUpdateProvider = async () => {
    if (!editingProvider || !validateEditForm()) return;
    setUpdatingProvider(true);
    try {
      const config: any = {
        name: editFormData.name.trim(),
        description: editFormData.description.trim() || undefined,
        type: editFormData.type,
        baseUrl: editFormData.baseUrl.trim(),
        defaultModel: editFormData.defaultModel.trim() || undefined,
        priority: editFormData.priority
      };
      // Only include API key if user has entered a value
      if (editFormData.apiKey.trim()) {
        config.apiKey = editFormData.apiKey.trim();
      }
      if (onUpdateProvider) {
        await onUpdateProvider(editingProvider.id, config);
      } else {
        await uaipAPI.llm.updateProvider(editingProvider.id, config);
      }
      
      // Always refresh the local provider list
      await loadProviders();
      
      closeEditModal();
    } catch (error) {
      setEditFormErrors(prev => ({ ...prev, general: error instanceof Error ? error.message : 'Failed to update provider' }));
    } finally {
      setUpdatingProvider(false);
    }
  };

  // Test Provider Handler
  const handleTestProvider = async (providerId: string) => {
    setTestingProvider(providerId);
    setTestResult(prev => ({ ...prev, [providerId]: null }));
    try {
      let result;
      if (onTestProvider) {
        result = await onTestProvider(providerId);
      } else {
        result = await uaipAPI.llm.testProvider(providerId);
      }
      setTestResult(prev => ({ ...prev, [providerId]: 'success' }));
      
      // Refresh providers list after testing (status might have changed)
      await loadProviders();
    } catch (error) {
      setTestResult(prev => ({ ...prev, [providerId]: error instanceof Error ? error.message : 'Test failed' }));
    } finally {
      setTestingProvider(null);
    }
  };

  // Toggle Active/Inactive Handler
  const handleToggleActive = async (provider: ModelProvider) => {
    setUpdatingProvider(true);
    try {
      if (onUpdateProvider) {
        await onUpdateProvider(provider.id, { isActive: !provider.isActive });
      } else {
        await uaipAPI.llm.updateProvider(provider.id, { isActive: !provider.isActive });
      }
      
      // Always refresh the local provider list
      await loadProviders();
    } catch (error) {
      // Optionally show error feedback
    } finally {
      setUpdatingProvider(false);
    }
  };

  // Delete Provider Handler
  const handleDeleteProvider = async (providerId: string) => {
    const confirmed = window.confirm('Are you sure you want to delete this provider? This action cannot be undone.');
    if (!confirmed) return;

    try {
      if (onDeleteProvider) {
        await onDeleteProvider(providerId);
      } else {
        await uaipAPI.llm.deleteProvider(providerId);
      }
      
      // Always refresh the local provider list
      await loadProviders();
    } catch (error: any) {
      console.error('Failed to delete provider:', error);
      
      // Check if this is a provider-in-use error
      // APIClientError has code directly on the error object
      if (error?.code === 'PROVIDER_IN_USE') {
        alert(`Cannot delete provider: ${error.message}`);
      } else if (error?.message) {
        alert(`Failed to delete provider: ${error.message}`);
      } else {
        alert('Failed to delete provider. Please try again.');
      }
    }
  };

  // Helper functions
  const getProviderIcon = (type: string) => {
    const providerType = providerTypes.find(p => p.id === type.toLowerCase());
    return providerType?.icon || Cpu;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'text-green-600 bg-green-100 dark:text-green-400 dark:bg-green-900/30';
      case 'inactive':
        return 'text-yellow-600 bg-yellow-100 dark:text-yellow-400 dark:bg-yellow-900/30';
      case 'error':
        return 'text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-900/30';
      default:
        return 'text-gray-600 bg-gray-100 dark:text-gray-400 dark:bg-gray-900/30';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return CheckCircle2;
      case 'error':
        return AlertCircle;
      default:
        return Activity;
    }
  };

  const handleToggleProvider = (providerName: string) => {
    if (expandedProvider === providerName) {
      setExpandedProvider(null);
    } else {
      setExpandedProvider(providerName);
      const provider = providers.find(p => p.name === providerName);
      if (provider && !providerModels[provider.type]) {
        loadProviderModels(provider.type);
      }
    }
  };

  const formatUrl = (url: string) => {
    try {
      const urlObj = new URL(url);
      return `${urlObj.hostname}${urlObj.port ? `:${urlObj.port}` : ''}`;
    } catch {
      return url;
    }
  };

  return (
    <div className={`h-full flex flex-col ${className}`}>
      {/* Action Buttons */}
      <div className="flex-shrink-0 flex items-center justify-end space-x-3 mb-6">
        <button
          onClick={() => setShowAddModal(true)}
          className="group flex items-center space-x-2 px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-semibold rounded-xl transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-[1.02]"
        >
          <Plus className="w-5 h-5 group-hover:rotate-90 transition-transform duration-300" />
          <span>Add Provider</span>
        </button>
        <button
          onClick={onRefresh || loadProviders}
          disabled={loading}
          className="flex items-center space-x-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold rounded-xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl transform hover:scale-[1.02]"
        >
          <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto space-y-6">
        {/* Add Provider Form */}
        {showAddModal && (
        <div className="bg-gradient-to-br from-blue-50/50 to-purple-50/50 dark:from-blue-900/20 dark:to-purple-900/20 border border-blue-200 dark:border-blue-800 rounded-2xl overflow-hidden">
          {/* Form Header */}
          <div className="relative bg-gradient-to-r from-blue-600 to-purple-600 p-4 lg:p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg lg:text-xl font-bold text-white">
                  Add New Provider
                </h3>
                <p className="text-blue-100 text-sm mt-1">
                  Configure a new AI model provider for your workspace
                </p>
              </div>
              <button
                onClick={handleCloseModal}
                className="p-2 hover:bg-white/20 rounded-xl transition-colors duration-200 text-white flex-shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Form Body */}
          <div className="p-4 lg:p-6 space-y-6">
            {/* Provider Type Selection */}
            <div>
              <label className="block text-base lg:text-lg font-semibold text-slate-900 dark:text-white mb-3">
                Choose Provider Type
              </label>
              <p className="text-slate-600 dark:text-slate-400 text-sm mb-4">
                Select the type of AI service you want to connect
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 lg:gap-4">
                {providerTypes.map((type) => {
                  const Icon = type.icon;
                  const isSelected = formData.type === type.id;
                  return (
                    <button
                      key={type.id}
                      type="button"
                      onClick={() => handleFormChange('type', type.id)}
                      className={`group relative p-4 lg:p-6 border-2 rounded-xl text-left transition-all duration-300 transform hover:scale-[1.02] ${isSelected
                          ? 'border-blue-500 bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-900/30 dark:to-purple-900/30 shadow-lg ring-4 ring-blue-500/20'
                          : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 hover:shadow-md'
                        }`}
                    >
                      <div className="flex items-start space-x-4">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-300 flex-shrink-0 ${isSelected
                            ? 'bg-gradient-to-br from-blue-500 to-purple-600 text-white shadow-lg scale-110'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 group-hover:bg-slate-200 dark:group-hover:bg-slate-700'
                          }`}>
                          <Icon className="w-6 h-6" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className={`font-semibold text-lg transition-colors duration-300 ${isSelected ? 'text-blue-700 dark:text-blue-300' : 'text-slate-900 dark:text-white'
                            }`}>
                            {type.name}
                          </div>
                          <div className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                            {type.description}
                          </div>
                          {type.requiresApiKey && (
                            <div className="flex items-center space-x-1 mt-2">
                              <div className="w-2 h-2 bg-amber-400 rounded-full"></div>
                              <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                                API Key Required
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                      {isSelected && (
                        <div className="absolute top-3 right-3">
                          <CheckCircle2 className="w-5 h-5 text-blue-600" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
              {formErrors.type && (
                <div className="flex items-center space-x-2 mt-3 text-red-600 dark:text-red-400">
                  <AlertCircle className="w-4 h-4" />
                  <span className="text-sm font-medium">{formErrors.type}</span>
                </div>
              )}
            </div>

            {/* Provider Configuration */}
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 lg:p-6 space-y-6">
              <h4 className="text-base lg:text-lg font-semibold text-slate-900 dark:text-white flex items-center space-x-2">
                <Settings className="w-5 h-5 text-blue-600" />
                <span>Provider Configuration</span>
              </h4>

              {/* Provider Name */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
                  Provider Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => handleFormChange('name', e.target.value)}
                  placeholder="e.g., My OpenAI Account"
                  className={`w-full px-4 py-3 border-2 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 text-lg ${formErrors.name
                      ? 'border-red-400 focus:border-red-500 focus:ring-red-500/20'
                      : 'border-slate-300 dark:border-slate-600'
                    } bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400`}
                />
                {formErrors.name && (
                  <div className="flex items-center space-x-2 mt-2 text-red-600 dark:text-red-400">
                    <AlertCircle className="w-4 h-4" />
                    <span className="text-sm font-medium">{formErrors.name}</span>
                  </div>
                )}
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => handleFormChange('description', e.target.value)}
                  placeholder="Optional description for this provider"
                  rows={3}
                  className="w-full px-4 py-3 border-2 border-slate-300 dark:border-slate-600 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400 resize-none"
                />
              </div>

              {/* Base URL */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
                  Base URL <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="url"
                    value={formData.baseUrl}
                    onChange={(e) => handleFormChange('baseUrl', e.target.value)}
                    placeholder="https://api.example.com"
                    className={`w-full px-4 py-3 pl-12 border-2 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 text-lg ${formErrors.baseUrl
                        ? 'border-red-400 focus:border-red-500 focus:ring-red-500/20'
                        : 'border-slate-300 dark:border-slate-600'
                      } bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400`}
                  />
                  <Globe className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
                </div>
                {formErrors.baseUrl && (
                  <div className="flex items-center space-x-2 mt-2 text-red-600 dark:text-red-400">
                    <AlertCircle className="w-4 h-4" />
                    <span className="text-sm font-medium">{formErrors.baseUrl}</span>
                  </div>
                )}
              </div>

              {/* API Key */}
              {providerTypes.find(p => p.id === formData.type)?.requiresApiKey && (
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
                    API Key <span className="text-slate-400 dark:text-slate-500">(Optional)</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showApiKey ? 'text' : 'password'}
                      value={formData.apiKey}
                      onChange={(e) => handleFormChange('apiKey', e.target.value)}
                      placeholder="Enter your API key"
                      className={`w-full px-4 py-3 pr-12 border-2 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 text-lg font-mono ${formErrors.apiKey
                          ? 'border-red-400 focus:border-red-500 focus:ring-red-500/20'
                          : 'border-slate-300 dark:border-slate-600'
                        } bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors duration-200"
                    >
                      {showApiKey ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                  {formErrors.apiKey && (
                    <div className="flex items-center space-x-2 mt-2 text-red-600 dark:text-red-400">
                      <AlertCircle className="w-4 h-4" />
                      <span className="text-sm font-medium">{formErrors.apiKey}</span>
                    </div>
                  )}
                  <div className="mt-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                    <div className="flex items-start space-x-2">
                      <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                      <div className="text-sm text-amber-800 dark:text-amber-200">
                        <strong>Security Notice:</strong> Your API key will be encrypted and stored securely. Never share your API keys with others.
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Default Model & Priority Row */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Default Model */}
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
                    Default Model
                  </label>
                  <input
                    type="text"
                    value={formData.defaultModel}
                    onChange={(e) => handleFormChange('defaultModel', e.target.value)}
                    placeholder="e.g., gpt-3.5-turbo, llama2"
                    className="w-full px-4 py-3 border-2 border-slate-300 dark:border-slate-600 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400"
                  />
                </div>

                {/* Priority */}
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
                    Priority
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="1000"
                    value={formData.priority}
                    onChange={(e) => handleFormChange('priority', parseInt(e.target.value) || 0)}
                    className={`w-full px-4 py-3 border-2 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 ${formErrors.priority
                        ? 'border-red-400 focus:border-red-500 focus:ring-red-500/20'
                        : 'border-slate-300 dark:border-slate-600'
                      } bg-white dark:bg-slate-900 text-slate-900 dark:text-white`}
                  />
                  <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                    Lower numbers = higher priority (0-1000)
                  </p>
                  {formErrors.priority && (
                    <div className="flex items-center space-x-2 mt-2 text-red-600 dark:text-red-400">
                      <AlertCircle className="w-4 h-4" />
                      <span className="text-sm font-medium">{formErrors.priority}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Submit Error */}
            {formErrors.general && (
              <div className="flex items-start space-x-3 p-4 bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800 rounded-xl">
                <AlertCircle className="w-6 h-6 text-red-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-red-800 dark:text-red-200">
                    Failed to create provider
                  </p>
                  <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                    {formErrors.general}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Form Footer */}
          <div className="border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-4 lg:p-6">
            <div className="flex flex-col gap-3">
              <div className="text-sm text-slate-600 dark:text-slate-400 text-center">
                All fields marked with <span className="text-red-500">*</span> are required
              </div>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <button
                  onClick={handleCloseModal}
                  disabled={addingProvider}
                  className="order-2 sm:order-1 px-6 py-3 text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 font-medium transition-colors duration-200 disabled:opacity-50 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-600"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateProvider}
                  disabled={addingProvider}
                  className="order-1 sm:order-2 flex items-center justify-center space-x-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl transform hover:scale-[1.02] min-h-[44px]"
                >
                  {addingProvider && <RefreshCw className="w-4 h-4 animate-spin" />}
                  <span>{addingProvider ? 'Creating...' : 'Create Provider'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Provider Inline Form */}
      {showEditModal && editingProvider && (
        <div className="bg-gradient-to-br from-blue-50/50 to-purple-50/50 dark:from-blue-900/20 dark:to-purple-900/20 border border-blue-200 dark:border-blue-800 rounded-2xl overflow-hidden mb-6">
          {/* Form Header */}
          <div className="relative bg-gradient-to-r from-blue-600 to-purple-600 p-4 lg:p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg lg:text-xl font-bold text-white">
                  Edit Provider: {editingProvider.name}
                </h3>
                <p className="text-blue-100 text-sm mt-1">
                  Update your provider configuration
                </p>
              </div>
              <button
                onClick={closeEditModal}
                className="p-2 hover:bg-white/20 rounded-xl transition-colors duration-200 text-white flex-shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Form Body */}
          <div className="p-4 lg:p-6 space-y-6">
            {/* Provider Configuration */}
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 lg:p-6 space-y-6">
              <h4 className="text-base lg:text-lg font-semibold text-slate-900 dark:text-white flex items-center space-x-2">
                <Settings className="w-5 h-5 text-blue-600" />
                <span>Provider Configuration</span>
              </h4>

              {/* Provider Name */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
                  Provider Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={editFormData.name}
                  onChange={e => handleEditFormChange('name', e.target.value)}
                  className={`w-full px-4 py-3 border-2 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 text-lg ${editFormErrors.name
                      ? 'border-red-400 focus:border-red-500 focus:ring-red-500/20'
                      : 'border-slate-300 dark:border-slate-600'
                    } bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400`}
                />
                {editFormErrors.name && (
                  <div className="flex items-center space-x-2 mt-2 text-red-600 dark:text-red-400">
                    <AlertCircle className="w-4 h-4" />
                    <span className="text-sm font-medium">{editFormErrors.name}</span>
                  </div>
                )}
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
                  Description
                </label>
                <textarea
                  value={editFormData.description}
                  onChange={e => handleEditFormChange('description', e.target.value)}
                  placeholder="Optional description for this provider"
                  rows={3}
                  className="w-full px-4 py-3 border-2 border-slate-300 dark:border-slate-600 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400 resize-none"
                />
              </div>

              {/* Provider Type Selection */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
                  Provider Type <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {providerTypes.map((type) => {
                    const Icon = type.icon;
                    const isSelected = editFormData.type === type.id;
                    return (
                      <button
                        key={type.id}
                        type="button"
                        onClick={() => handleEditFormChange('type', type.id)}
                        className={`group relative p-3 border-2 rounded-xl text-left transition-all duration-300 ${isSelected
                            ? 'border-blue-500 bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-900/30 dark:to-purple-900/30'
                            : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                          }`}
                      >
                        <div className="flex items-center space-x-3">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isSelected
                              ? 'bg-gradient-to-br from-blue-500 to-purple-600 text-white'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                            }`}>
                            <Icon className="w-4 h-4" />
                          </div>
                          <div>
                            <div className={`font-medium ${isSelected ? 'text-blue-700 dark:text-blue-300' : 'text-slate-900 dark:text-white'}`}>
                              {type.name}
                            </div>
                            <div className="text-xs text-slate-500 dark:text-slate-400">
                              {type.description}
                            </div>
                          </div>
                        </div>
                        {isSelected && (
                          <div className="absolute top-2 right-2">
                            <CheckCircle2 className="w-4 h-4 text-blue-600" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
                {editFormErrors.type && (
                  <div className="flex items-center space-x-2 mt-2 text-red-600 dark:text-red-400">
                    <AlertCircle className="w-4 h-4" />
                    <span className="text-sm font-medium">{editFormErrors.type}</span>
                  </div>
                )}
              </div>

              {/* Base URL */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
                  Base URL <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="url"
                    value={editFormData.baseUrl}
                    onChange={e => handleEditFormChange('baseUrl', e.target.value)}
                    placeholder="https://api.example.com"
                    className={`w-full px-4 py-3 pl-12 border-2 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 text-lg ${editFormErrors.baseUrl
                        ? 'border-red-400 focus:border-red-500 focus:ring-red-500/20'
                        : 'border-slate-300 dark:border-slate-600'
                      } bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400`}
                  />
                  <Globe className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
                </div>
                {editFormErrors.baseUrl && (
                  <div className="flex items-center space-x-2 mt-2 text-red-600 dark:text-red-400">
                    <AlertCircle className="w-4 h-4" />
                    <span className="text-sm font-medium">{editFormErrors.baseUrl}</span>
                  </div>
                )}
              </div>

              {/* API Key */}
              {providerTypes.find(p => p.id === editFormData.type)?.requiresApiKey && (
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
                    API Key <span className="text-slate-400 dark:text-slate-500">(Leave empty to keep current)</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showApiKey ? 'text' : 'password'}
                      value={editFormData.apiKey}
                      onChange={e => handleEditFormChange('apiKey', e.target.value)}
                      placeholder="Enter new API key or leave empty to keep current"
                      className={`w-full px-4 py-3 pr-12 border-2 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 text-lg font-mono ${editFormErrors.apiKey
                          ? 'border-red-400 focus:border-red-500 focus:ring-red-500/20'
                          : 'border-slate-300 dark:border-slate-600'
                        } bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors duration-200"
                    >
                      {showApiKey ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                  {editFormErrors.apiKey && (
                    <div className="flex items-center space-x-2 mt-2 text-red-600 dark:text-red-400">
                      <AlertCircle className="w-4 h-4" />
                      <span className="text-sm font-medium">{editFormErrors.apiKey}</span>
                    </div>
                  )}
                  <div className="mt-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                    <div className="flex items-start space-x-2">
                      <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                      <div className="text-sm text-amber-800 dark:text-amber-200">
                        <strong>Security Notice:</strong> Leave empty to keep your existing API key. Your API key will be encrypted and stored securely.
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Default Model and Priority */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
                    Default Model
                  </label>
                  <input
                    type="text"
                    value={editFormData.defaultModel}
                    onChange={e => handleEditFormChange('defaultModel', e.target.value)}
                    placeholder="e.g., gpt-4, claude-3-sonnet"
                    className="w-full px-4 py-3 border-2 border-slate-300 dark:border-slate-600 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
                    Priority (0-1000)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="1000"
                    value={editFormData.priority}
                    onChange={e => handleEditFormChange('priority', parseInt(e.target.value) || 0)}
                    className={`w-full px-4 py-3 border-2 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 ${editFormErrors.priority
                        ? 'border-red-400 focus:border-red-500 focus:ring-red-500/20'
                        : 'border-slate-300 dark:border-slate-600'
                      } bg-white dark:bg-slate-900 text-slate-900 dark:text-white`}
                  />
                  {editFormErrors.priority && (
                    <div className="flex items-center space-x-2 mt-2 text-red-600 dark:text-red-400">
                      <AlertCircle className="w-4 h-4" />
                      <span className="text-sm font-medium">{editFormErrors.priority}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* General Error Message */}
              {editFormErrors.general && (
                <div className="flex items-start space-x-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
                  <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <div className="text-red-700 dark:text-red-300 text-sm">{editFormErrors.general}</div>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end gap-3">
              <button
                onClick={closeEditModal}
                className="px-6 py-3 rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-white font-medium hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors duration-200"
                disabled={updatingProvider}
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateProvider}
                className="flex items-center space-x-2 px-6 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl transform hover:scale-[1.02]"
                disabled={updatingProvider}
              >
                {updatingProvider && <RefreshCw className="w-4 h-4 animate-spin" />}
                <span>{updatingProvider ? 'Saving...' : 'Save Changes'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error State */}
      {propError && (
        <div className="flex items-center space-x-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-red-800 dark:text-red-200">
              Failed to load providers
            </p>
            <p className="text-xs text-red-600 dark:text-red-400 mt-1">
              {propError}
            </p>
          </div>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="flex items-center space-x-3">
            <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
            <span className="text-slate-600 dark:text-slate-400">Loading providers...</span>
          </div>
        </div>
      )}

      {/* Providers List */}
      {!loading && providers.length > 0 && (
        <div className="space-y-4">
          {providers.map((provider, providerIndex) => {
            const Icon = getProviderIcon(provider.type);
            const StatusIcon = getStatusIcon(provider.status);
            const isExpanded = expandedProvider === provider.name;
            const models = providerModels[provider.type] || [];
            const isLoadingModels = loadingModels.has(provider.type);

            return (
              <div
                key={provider.id || `provider-${providerIndex}`}
                className="bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden group"
              >
                {/* Provider Header */}
                <div
                  className="p-6 cursor-pointer hover:bg-gradient-to-r hover:from-slate-50 hover:to-blue-50 dark:hover:from-slate-800 dark:hover:to-slate-700 transition-all duration-300"
                  onClick={() => handleToggleProvider(provider.name)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-5">
                      <div className="relative">
                        <div className="w-16 h-16 bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-700 rounded-2xl flex items-center justify-center shadow-lg group-hover:shadow-xl transition-all duration-300 group-hover:scale-110">
                          <Icon className="w-8 h-8 text-slate-600 dark:text-slate-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors duration-300" />
                        </div>
                        {provider.isActive && (
                          <div className="absolute -top-1 -right-1 w-5 h-5 bg-green-500 rounded-full border-2 border-white dark:border-slate-900 flex items-center justify-center">
                            <div className="w-2 h-2 bg-white rounded-full"></div>
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-xl font-bold text-slate-900 dark:text-white group-hover:text-blue-700 dark:group-hover:text-blue-300 transition-colors duration-300">
                          {provider.name}
                        </h3>
                        <div className="flex items-center space-x-4 mt-2">
                          <div className="flex items-center space-x-2">
                            <Globe className="w-4 h-4 text-slate-500" />
                            <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
                              {formatUrl(provider.baseUrl)}
                            </span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Activity className="w-4 h-4 text-slate-500" />
                            <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
                              {provider.totalRequests} requests
                            </span>
                          </div>
                          {provider.description && (
                            <div className="flex items-center space-x-2">
                              <div className="w-1 h-1 bg-slate-400 rounded-full"></div>
                              <span className="text-sm text-slate-600 dark:text-slate-400 truncate max-w-xs">
                                {provider.description}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-4">
                      {/* Test Button */}
                      <button
                        onClick={e => { e.stopPropagation(); handleTestProvider(provider.id); }}
                        className="px-3 py-1 rounded-lg bg-emerald-500 text-white text-xs font-semibold hover:bg-emerald-600 transition-all duration-200 disabled:opacity-50"
                        disabled={testingProvider === provider.id}
                      >
                        {testingProvider === provider.id ? 'Testing...' : 'Test'}
                      </button>
                      {testResult[provider.id] && (
                        <span className={`ml-2 text-xs font-semibold ${testResult[provider.id] === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                          {testResult[provider.id] === 'success' ? 'OK' : testResult[provider.id]}
                        </span>
                      )}
                      {/* Toggle Active/Inactive */}
                      <button
                        onClick={e => { e.stopPropagation(); handleToggleActive(provider); }}
                        className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all duration-200 ${provider.isActive ? 'bg-green-500 text-white hover:bg-green-600' : 'bg-slate-300 text-slate-700 hover:bg-slate-400'}`}
                        disabled={updatingProvider}
                      >
                        {provider.isActive ? 'Active' : 'Inactive'}
                      </button>
                      {/* Edit Button */}
                      <button
                        onClick={e => { e.stopPropagation(); openEditModal(provider); }}
                        className="px-3 py-1 rounded-lg bg-blue-500 text-white text-xs font-semibold hover:bg-blue-600 transition-all duration-200"
                      >Edit</button>
                      {/* Delete Button */}
                      <button
                        onClick={e => { e.stopPropagation(); handleDeleteProvider(provider.id); }}
                        className="px-3 py-1 rounded-lg bg-red-500 text-white text-xs font-semibold hover:bg-red-600 transition-all duration-200"
                      >Delete</button>
                      <ExternalLink className="w-5 h-5 text-slate-400 group-hover:text-blue-500 transition-colors duration-300" />
                      <div className={`w-2 h-8 rounded-full transition-all duration-300 ${isExpanded ? 'bg-blue-500 rotate-180' : 'bg-slate-300 dark:bg-slate-600'}`}></div>
                    </div>
                  </div>
                </div>

                {/* Expanded Content */}
                {isExpanded && (
                  <div className="border-t-2 border-slate-200 dark:border-slate-700 bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-800 dark:to-slate-700">
                    <div className="p-8">
                      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                        {/* Provider Details */}
                        <div className="bg-white dark:bg-slate-900 rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-700">
                          <h4 className="text-lg font-bold text-slate-900 dark:text-white mb-6 flex items-center space-x-2">
                            <Settings className="w-5 h-5 text-blue-600" />
                            <span>Provider Details</span>
                          </h4>
                          <div className="space-y-4">
                            {[
                              { label: 'Type', value: provider.type, format: 'capitalize' },
                              { label: 'Base URL', value: formatUrl(provider.baseUrl), format: 'url' },
                              { label: 'Default Model', value: provider.defaultModel || 'None', format: 'text' },
                              { label: 'Active', value: provider.isActive ? 'Yes' : 'No', format: 'boolean' },
                              { label: 'Priority', value: provider.priority.toString(), format: 'number' },
                              { label: 'Total Requests', value: provider.totalRequests.toString(), format: 'number' },
                              { label: 'Total Errors', value: provider.totalErrors.toString(), format: 'error' },
                              { label: 'Has API Key', value: provider.hasApiKey ? 'Yes' : 'No', format: 'security' }
                            ].map((item, index) => (
                              <div key={index} className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800 last:border-b-0">
                                <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
                                  {item.label}:
                                </span>
                                <span className={`text-sm font-semibold ${item.format === 'boolean'
                                    ? (item.value === 'Yes' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400')
                                    : item.format === 'error'
                                      ? (parseInt(item.value) > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400')
                                      : item.format === 'security'
                                        ? (item.value === 'Yes' ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400')
                                        : item.format === 'capitalize'
                                          ? 'text-slate-900 dark:text-white capitalize'
                                          : 'text-slate-900 dark:text-white'
                                }`}>
                                  {item.value}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Available Models */}
                        <div className="bg-white dark:bg-slate-900 rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-700">
                          <h4 className="text-lg font-bold text-slate-900 dark:text-white mb-6 flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                              <Cpu className="w-5 h-5 text-purple-600" />
                              <span>Available Models</span>
                            </div>
                            <span className="text-sm font-normal bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-3 py-1 rounded-full">
                              {models.length} models
                            </span>
                          </h4>
                          {isLoadingModels ? (
                            <div className="flex items-center justify-center py-8">
                              <div className="flex items-center space-x-3">
                                <RefreshCw className="w-5 h-5 animate-spin text-blue-500" />
                                <span className="text-slate-600 dark:text-slate-400">Loading models...</span>
                              </div>
                            </div>
                          ) : models.length > 0 ? (
                            <div className="space-y-3 max-h-48 overflow-y-auto pr-2">
                              {models.map((model, index) => (
                                <div
                                  key={model.id || model.name || `model-${provider.id || providerIndex}-${index}`}
                                  className="flex items-center space-x-3 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors duration-200"
                                >
                                  <div className="w-3 h-3 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex-shrink-0"></div>
                                  <div className="flex-1 min-w-0">
                                    <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                                      {model.name || 'Unknown Model'}
                                    </div>
                                    {model.description && (
                                      <div className="text-xs text-slate-500 dark:text-slate-400 truncate mt-1">
                                        {model.description}
                                      </div>
                                    )}
                                  </div>
                                  <div className="text-xs text-slate-400 bg-slate-200 dark:bg-slate-700 px-2 py-1 rounded">
                                    {model.provider || provider.type}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-center py-8">
                              <div className="w-12 h-12 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-3">
                                <Cpu className="w-6 h-6 text-slate-400" />
                              </div>
                              <p className="text-sm text-slate-500 dark:text-slate-400">
                                No models available
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

        {/* Empty State */}
        {!loading && providers.length === 0 && !error && (
          <div className="text-center py-16">
            <div className="relative mx-auto mb-8">
              <div className="w-24 h-24 bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-700 rounded-3xl flex items-center justify-center mx-auto shadow-xl">
                <Server className="w-12 h-12 text-slate-400" />
              </div>
              <div className="absolute -top-2 -right-2 w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                <Plus className="w-4 h-4 text-white" />
              </div>
            </div>
            <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-3">
              No providers configured
            </h3>
            <p className="text-slate-600 dark:text-slate-400 mb-8 max-w-md mx-auto leading-relaxed">
              Get started by adding your first AI model provider. Connect to services like OpenAI, Ollama, or custom endpoints to unlock powerful AI capabilities.
            </p>
            <div className="space-y-4">
              <button
                onClick={() => setShowAddModal(true)}
                className="group flex items-center space-x-3 px-8 py-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold rounded-xl transition-all duration-300 mx-auto shadow-lg hover:shadow-xl transform hover:scale-[1.02]"
              >
                <Plus className="w-5 h-5 group-hover:rotate-90 transition-transform duration-300" />
                <span>Add Your First Provider</span>
              </button>
              <div className="flex items-center justify-center space-x-8 pt-6">
                {[
                  { icon: Globe, name: 'Ollama', color: 'from-green-500 to-emerald-600' },
                  { icon: Zap, name: 'OpenAI', color: 'from-blue-500 to-cyan-600' },
                  { icon: Server, name: 'LLM Studio', color: 'from-purple-500 to-pink-600' },
                  { icon: Cpu, name: 'Custom', color: 'from-orange-500 to-red-600' }
                ].map((provider, index) => {
                  const Icon = provider.icon;
                  return (
                    <div key={index} className="text-center group cursor-pointer" onClick={() => setShowAddModal(true)}>
                      <div className={`w-12 h-12 bg-gradient-to-br ${provider.color} rounded-xl flex items-center justify-center mb-2 shadow-lg group-hover:shadow-xl transition-all duration-300 group-hover:scale-110`}>
                        <Icon className="w-6 h-6 text-white" />
                      </div>
                      <span className="text-xs text-slate-500 dark:text-slate-400 font-medium group-hover:text-slate-700 dark:group-hover:text-slate-300 transition-colors duration-300">
                        {provider.name}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}; 