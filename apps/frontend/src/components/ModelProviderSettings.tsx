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
  name: string;
  type: string;
  baseUrl: string;
  isActive: boolean;
  defaultModel?: string;
  modelCount: number;
  status: 'active' | 'inactive' | 'error';
}

interface ModelProviderSettingsProps {
  className?: string;
}

export const ModelProviderSettings: React.FC<ModelProviderSettingsProps> = ({ className = '' }) => {
  const [providers, setProviders] = useState<ModelProvider[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
  const [providerModels, setProviderModels] = useState<Record<string, any[]>>({});
  const [loadingModels, setLoadingModels] = useState<Set<string>>(new Set());

  // Load providers
  const loadProviders = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const providersData = await uaipAPI.llm.getProviders();
      setProviders(providersData);
    } catch (error) {
      console.error('Failed to load providers:', error);
      setError(error instanceof Error ? error.message : 'Failed to load providers');
      setProviders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load models for a specific provider
  const loadProviderModels = useCallback(async (providerType: string) => {
    if (loadingModels.has(providerType)) return;
    
    setLoadingModels(prev => new Set(prev).add(providerType));
    
    try {
      const models = await uaipAPI.llm.getModelsFromProvider(providerType);
      setProviderModels(prev => ({
        ...prev,
        [providerType]: models
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
  }, [loadingModels]);

  useEffect(() => {
    loadProviders();
  }, [loadProviders]);

  // Helper functions
  const getProviderIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case 'ollama':
        return Globe;
      case 'openai':
        return Zap;
      case 'llmstudio':
        return Server;
      default:
        return Cpu;
    }
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
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl flex items-center justify-center shadow-lg shadow-purple-500/25">
            <Settings className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">
              Model Providers
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Configure and manage your AI model providers
            </p>
          </div>
        </div>
        <button
          onClick={loadProviders}
          disabled={loading}
          className="flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Error State */}
      {error && (
        <div className="flex items-center space-x-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-red-800 dark:text-red-200">
              Failed to load providers
            </p>
            <p className="text-xs text-red-600 dark:text-red-400 mt-1">
              {error}
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
          {providers.map((provider) => {
            const Icon = getProviderIcon(provider.type);
            const StatusIcon = getStatusIcon(provider.status);
            const isExpanded = expandedProvider === provider.name;
            const models = providerModels[provider.type] || [];
            const isLoadingModels = loadingModels.has(provider.type);

            return (
              <div
                key={provider.name}
                className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm overflow-hidden"
              >
                {/* Provider Header */}
                <div
                  className="p-6 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors duration-200"
                  onClick={() => handleToggleProvider(provider.name)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div className="w-12 h-12 bg-slate-100 dark:bg-slate-700 rounded-xl flex items-center justify-center">
                        <Icon className="w-6 h-6 text-slate-600 dark:text-slate-400" />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                          {provider.name}
                        </h3>
                        <div className="flex items-center space-x-3 mt-1">
                          <span className="text-sm text-slate-600 dark:text-slate-400">
                            {formatUrl(provider.baseUrl)}
                          </span>
                          <span className="text-slate-300 dark:text-slate-600">•</span>
                          <span className="text-sm text-slate-600 dark:text-slate-400">
                            {provider.modelCount} models
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-3">
                      <div className={`flex items-center space-x-2 px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(provider.status)}`}>
                        <StatusIcon className="w-3 h-3" />
                        <span className="capitalize">{provider.status}</span>
                      </div>
                      <ExternalLink className="w-4 h-4 text-slate-400" />
                    </div>
                  </div>
                </div>

                {/* Expanded Content */}
                {isExpanded && (
                  <div className="border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                    <div className="p-6">
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Provider Details */}
                        <div>
                          <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">
                            Provider Details
                          </h4>
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                              <span className="text-slate-600 dark:text-slate-400">Type:</span>
                              <span className="text-slate-900 dark:text-white font-medium capitalize">
                                {provider.type}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-600 dark:text-slate-400">Base URL:</span>
                              <span className="text-slate-900 dark:text-white font-medium">
                                {formatUrl(provider.baseUrl)}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-600 dark:text-slate-400">Default Model:</span>
                              <span className="text-slate-900 dark:text-white font-medium">
                                {provider.defaultModel || 'None'}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-600 dark:text-slate-400">Active:</span>
                              <span className={`font-medium ${provider.isActive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                {provider.isActive ? 'Yes' : 'No'}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Available Models */}
                        <div>
                          <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">
                            Available Models ({provider.modelCount})
                          </h4>
                          {isLoadingModels ? (
                            <div className="flex items-center space-x-2 text-sm text-slate-600 dark:text-slate-400">
                              <RefreshCw className="w-4 h-4 animate-spin" />
                              <span>Loading models...</span>
                            </div>
                          ) : models.length > 0 ? (
                            <div className="space-y-2 max-h-32 overflow-y-auto">
                              {models.map((model, index) => (
                                <div
                                  key={model.id || index}
                                  className="flex items-center space-x-2 text-sm"
                                >
                                  <div className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0"></div>
                                  <span className="text-slate-900 dark:text-white font-medium">
                                    {model.name}
                                  </span>
                                  {model.description && (
                                    <span className="text-slate-500 dark:text-slate-400 text-xs truncate">
                                      ({model.description})
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-sm text-slate-500 dark:text-slate-400">
                              No models available
                            </p>
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
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <Server className="w-8 h-8 text-slate-400" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
            No providers configured
          </h3>
          <p className="text-slate-600 dark:text-slate-400 mb-6">
            Configure your first model provider to get started with AI capabilities.
          </p>
          <button className="flex items-center space-x-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors duration-200 mx-auto">
            <Plus className="w-4 h-4" />
            <span>Add Provider</span>
          </button>
        </div>
      )}
    </div>
  );
}; 