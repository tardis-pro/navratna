import React, { useState, useEffect, useCallback } from 'react';
import { useAgents } from '../contexts/AgentContext';
import { AgentSettings } from './AgentSettings';
import { ModelProviderSettings } from './ModelProviderSettings';
import { Button } from './ui/button';
import { Bot, Server, Settings, Users, AlertCircle, CheckCircle2, RefreshCw } from 'lucide-react';

type SettingsTab = 'agents' | 'providers' | 'general';

export const SettingsContent: React.FC = () => {
  const { 
    agents, 
    updateAgentState,
    modelState,
    loadProviders,
    loadModels,
    refreshModelData,
    createProvider,
    updateProvider,
    testProvider,
    deleteProvider,
    getModelsForProvider,
    getRecommendedModels
  } = useAgents();
  
  const [activeTab, setActiveTab] = useState<SettingsTab>('agents');
  const [initializationStatus, setInitializationStatus] = useState<{
    loading: boolean;
    error: string | null;
    providersLoaded: boolean;
    modelsLoaded: boolean;
    initialized: boolean;
  }>({
    loading: false,
    error: null,
    providersLoaded: false,
    modelsLoaded: false,
    initialized: false
  });

  // Initialize providers and models on component mount (only once)
  const initializeModelData = useCallback(async () => {
    if (initializationStatus.initialized || initializationStatus.loading) {
      return; // Prevent multiple initializations
    }

    setInitializationStatus(prev => ({ ...prev, loading: true, error: null }));
    
    try {
      // Load providers and models in parallel
      const results = await Promise.allSettled([
        loadProviders(),
        loadModels()
      ]);

      const providersResult = results[0];
      const modelsResult = results[1];

      setInitializationStatus(prev => ({ 
        ...prev, 
        loading: false,
        initialized: true,
        providersLoaded: providersResult.status === 'fulfilled',
        modelsLoaded: modelsResult.status === 'fulfilled',
        error: providersResult.status === 'rejected' || modelsResult.status === 'rejected' 
          ? 'Failed to load some model data' 
          : null
      }));
    } catch (error) {
      console.error('Failed to initialize model data:', error);
      setInitializationStatus(prev => ({ 
        ...prev, 
        loading: false,
        initialized: true,
        error: error instanceof Error ? error.message : 'Failed to load model data'
      }));
    }
  }, [loadProviders, loadModels, initializationStatus.initialized, initializationStatus.loading]);

  // Only initialize once when component mounts
  useEffect(() => {
    if (!initializationStatus.initialized && !initializationStatus.loading) {
      initializeModelData();
    }
  }, [initializeModelData, initializationStatus.initialized, initializationStatus.loading]);

  const handleRefreshAgents = useCallback(() => {
    console.log('Refreshing agents...');
    // Could trigger agent refresh from backend if needed
  }, []);

  const handleRefreshProviders = useCallback(async () => {
    setInitializationStatus(prev => ({ ...prev, loading: true, error: null }));
    
    try {
      await refreshModelData();
      setInitializationStatus(prev => ({ ...prev, loading: false }));
    } catch (error) {
      console.error('Failed to refresh providers:', error);
      setInitializationStatus(prev => ({ 
        ...prev, 
        loading: false, 
        error: error instanceof Error ? error.message : 'Failed to refresh providers'
      }));
    }
  }, [refreshModelData]);

  // Calculate statistics
  const agentCount = Object.keys(agents).length;
  const activeAgentCount = Object.values(agents).filter(agent => agent.isActive !== false).length;
  const providerCount = modelState.providers.length;
  const activeProviderCount = modelState.providers.filter(p => p.isActive).length;
  const modelCount = modelState.models.length;
  const availableModelCount = modelState.models.filter(m => m.isAvailable).length;

  return (
    <div className="space-y-6">
      {/* Settings Header */}
      <div className="border-b border-slate-200 dark:border-slate-700 pb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
              Settings
            </h1>
            <p className="text-slate-600 dark:text-slate-400">
              Configure your AI agents, model providers, and system preferences
            </p>
          </div>
          
          {/* Status Indicators */}
          <div className="flex items-center space-x-4">
            {initializationStatus.loading && (
              <div className="flex items-center space-x-2 px-3 py-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
                <span className="text-sm text-blue-700 dark:text-blue-300 font-medium">
                  Loading...
                </span>
              </div>
            )}
            
            {initializationStatus.error && (
              <div className="flex items-center space-x-2 px-3 py-2 bg-red-50 dark:bg-red-900/20 rounded-lg">
                <AlertCircle className="w-4 h-4 text-red-600" />
                <span className="text-sm text-red-700 dark:text-red-300 font-medium">
                  Error Loading
                </span>
              </div>
            )}
            
            {!initializationStatus.loading && !initializationStatus.error && (
              <div className="flex items-center space-x-2 px-3 py-2 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <CheckCircle2 className="w-4 h-4 text-green-600" />
                <span className="text-sm text-green-700 dark:text-green-300 font-medium">
                  Ready
                </span>
              </div>
            )}
            
            <Button
              onClick={handleRefreshProviders}
              disabled={initializationStatus.loading}
              variant="outline"
              size="sm"
              className="flex items-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${initializationStatus.loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>
        
        {/* Quick Stats */}
        <div className="flex items-center space-x-6 mt-4">
          <div className="flex items-center space-x-2">
            <Bot className="w-4 h-4 text-blue-600" />
            <span className="text-sm text-slate-600 dark:text-slate-400">
              {activeAgentCount}/{agentCount} Agents Active
            </span>
          </div>
          <div className="flex items-center space-x-2">
            <Server className="w-4 h-4 text-purple-600" />
            <span className="text-sm text-slate-600 dark:text-slate-400">
              {activeProviderCount}/{providerCount} Providers Active
            </span>
          </div>
          <div className="flex items-center space-x-2">
            <Settings className="w-4 h-4 text-green-600" />
            <span className="text-sm text-slate-600 dark:text-slate-400">
              {availableModelCount}/{modelCount} Models Available
            </span>
          </div>
        </div>
      </div>

      {/* Settings Tabs */}
      <div className="flex space-x-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
        <Button
          variant={activeTab === 'agents' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setActiveTab('agents')}
          className="flex items-center gap-2 px-4 py-2 text-sm"
        >
          <Bot className="w-4 h-4" />
          Agent Settings
          {agentCount > 0 && (
            <span className="ml-1 px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs rounded-full">
              {agentCount}
            </span>
          )}
        </Button>
        <Button
          variant={activeTab === 'providers' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setActiveTab('providers')}
          className="flex items-center gap-2 px-4 py-2 text-sm"
        >
          <Server className="w-4 h-4" />
          Model Providers
          {providerCount > 0 && (
            <span className="ml-1 px-2 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 text-xs rounded-full">
              {providerCount}
            </span>
          )}
        </Button>
        <Button
          variant={activeTab === 'general' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setActiveTab('general')}
          className="flex items-center gap-2 px-4 py-2 text-sm"
        >
          <Settings className="w-4 h-4" />
          General
        </Button>
      </div>

      {/* Error Display */}
      {initializationStatus.error && (
        <div className="flex items-start space-x-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
          <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-red-700 dark:text-red-300 mb-1">
              Initialization Error
            </h3>
            <p className="text-sm text-red-600 dark:text-red-400">
              {initializationStatus.error}
            </p>
            <button
              onClick={handleRefreshProviders}
              className="mt-2 text-sm text-red-700 dark:text-red-300 hover:text-red-800 dark:hover:text-red-200 font-medium underline"
            >
              Try Again
            </button>
          </div>
        </div>
      )}

      {/* Settings Content */}
      <div className="min-h-[500px]">
        {activeTab === 'agents' && (
          <AgentSettings 
            agents={agents}
            onUpdateAgent={updateAgentState}
            onRefreshAgents={handleRefreshAgents}
            // Pass model provider data to AgentSettings
            modelState={modelState}
            getRecommendedModels={getRecommendedModels}
            getModelsForProvider={getModelsForProvider}
          />
        )}
        
        {activeTab === 'providers' && (
          <ModelProviderSettings 
            // Pass enhanced props for better integration
            providers={modelState.providers}
            models={modelState.models}
            loading={modelState.loadingProviders || modelState.loadingModels}
            error={modelState.providersError || modelState.modelsError}
            onCreateProvider={createProvider}
            onUpdateProvider={updateProvider}
            onTestProvider={testProvider}
            onDeleteProvider={deleteProvider}
            onRefresh={handleRefreshProviders}
          />
        )}
        
        {activeTab === 'general' && (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <Settings className="w-12 h-12 text-slate-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
                General Settings
              </h3>
              <p className="text-slate-600 dark:text-slate-400">
                General settings coming soon...
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}; 