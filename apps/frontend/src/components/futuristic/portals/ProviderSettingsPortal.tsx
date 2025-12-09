import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAgents } from '../../../contexts/AgentContext';
import { ModelProviderSettings } from '../../ModelProviderSettings';
import {
  Server,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Database,
  Activity,
  Zap,
  User,
  Settings,
  Cpu,
  Plus,
  Trash2,
} from 'lucide-react';
import { LLMTaskType, LLMProviderType, UserLLMPreference } from '@uaip/types';
import { uaipAPI } from '../../../utils/uaip-api';
import { usersAPI } from '../../../api/users.api';

interface ViewportSize {
  width: number;
  height: number;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
}

interface ProviderSettingsPortalProps {
  className?: string;
  viewport?: ViewportSize;
}

export const ProviderSettingsPortal: React.FC<ProviderSettingsPortalProps> = ({
  className,
  viewport,
}) => {
  const {
    modelState,
    loadProviders,
    loadModels,
    refreshModelData,
    createProvider,
    updateProvider,
    testProvider,
    deleteProvider,
  } = useAgents();

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
    initialized: false,
  });

  const [activeTab, setActiveTab] = useState<'providers' | 'preferences'>('providers');
  const [userPreferences, setUserPreferences] = useState<
    Omit<UserLLMPreference, 'id' | 'userId' | 'createdAt' | 'updatedAt'>[]
  >([]);
  const [loadingPreferences, setLoadingPreferences] = useState(false);

  // Default viewport if not provided
  const defaultViewport: ViewportSize = {
    width: typeof window !== 'undefined' ? window.innerWidth : 1024,
    height: typeof window !== 'undefined' ? window.innerHeight : 768,
    isMobile: typeof window !== 'undefined' ? window.innerWidth < 768 : false,
    isTablet:
      typeof window !== 'undefined' ? window.innerWidth >= 768 && window.innerWidth < 1024 : false,
    isDesktop: typeof window !== 'undefined' ? window.innerWidth >= 1024 : true,
  };

  const currentViewport = viewport || defaultViewport;

  // LLM Task Types for UI
  const LLM_TASK_TYPE_OPTIONS = [
    { value: LLMTaskType.REASONING, label: 'Reasoning & Analysis' },
    { value: LLMTaskType.CODE_GENERATION, label: 'Code Generation' },
    { value: LLMTaskType.CREATIVE_WRITING, label: 'Creative Writing' },
    { value: LLMTaskType.SUMMARIZATION, label: 'Summarization' },
    { value: LLMTaskType.CLASSIFICATION, label: 'Classification' },
    { value: LLMTaskType.TRANSLATION, label: 'Translation' },
    { value: LLMTaskType.TOOL_CALLING, label: 'Tool Calling' },
    { value: LLMTaskType.VISION, label: 'Vision Analysis' },
  ];

  // LLM Provider Types for UI
  const LLM_PROVIDER_TYPE_OPTIONS = [
    { value: LLMProviderType.ANTHROPIC, label: 'Anthropic' },
    { value: LLMProviderType.OPENAI, label: 'OpenAI' },
    { value: LLMProviderType.OLLAMA, label: 'Ollama' },
    { value: LLMProviderType.LLMSTUDIO, label: 'LLM Studio' },
    { value: LLMProviderType.CUSTOM, label: 'Custom' },
  ];

  // Load user preferences
  const loadUserPreferences = useCallback(async () => {
    setLoadingPreferences(true);
    try {
      const response = await usersAPI.getUserLLMPreferences();
      setUserPreferences(response || []);
    } catch (error) {
      console.error('Failed to load user preferences:', error);
    } finally {
      setLoadingPreferences(false);
    }
  }, []);

  // Add user preference
  const addUserPreference = () => {
    const newPreference: Omit<UserLLMPreference, 'id' | 'userId' | 'createdAt' | 'updatedAt'> = {
      taskType: LLMTaskType.REASONING,
      preferredProvider: LLMProviderType.ANTHROPIC,
      preferredModel: 'claude-3-5-sonnet-20241022',
      settings: {
        temperature: 0.7,
      },
      isActive: true,
      priority: 50,
    };
    setUserPreferences((prev) => [...prev, newPreference]);
  };

  // Update user preference
  const updateUserPreference = (
    index: number,
    updates: Partial<Omit<UserLLMPreference, 'id' | 'userId' | 'createdAt' | 'updatedAt'>>
  ) => {
    setUserPreferences((prev) =>
      prev.map((pref, i) => (i === index ? { ...pref, ...updates } : pref))
    );
  };

  // Remove user preference
  const removeUserPreference = (index: number) => {
    setUserPreferences((prev) => prev.filter((_, i) => i !== index));
  };

  // Save user preferences
  const saveUserPreferences = async () => {
    try {
      await usersAPI.updateUserLLMPreferences(userPreferences);
      // Show success message or notification
    } catch (error) {
      console.error('Failed to save user preferences:', error);
    }
  };

  // Initialize providers and models on component mount (only once)
  const initializeModelData = useCallback(async () => {
    if (initializationStatus.initialized || initializationStatus.loading) {
      return;
    }

    setInitializationStatus((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const results = await Promise.allSettled([
        loadProviders?.() || Promise.resolve(),
        loadModels?.() || Promise.resolve(),
      ]);

      const providersResult = results[0];
      const modelsResult = results[1];

      setInitializationStatus((prev) => ({
        ...prev,
        loading: false,
        initialized: true,
        providersLoaded: providersResult.status === 'fulfilled',
        modelsLoaded: modelsResult.status === 'fulfilled',
        error:
          providersResult.status === 'rejected' || modelsResult.status === 'rejected'
            ? 'Failed to load some  model data'
            : null,
      }));
    } catch (error) {
      console.error('Failed to initialize model data:', error);
      setInitializationStatus((prev) => ({
        ...prev,
        loading: false,
        initialized: true,
        error: error instanceof Error ? error.message : 'Failed to load  model data',
      }));
    }
  }, [loadProviders, loadModels, initializationStatus.initialized, initializationStatus.loading]);

  useEffect(() => {
    if (!initializationStatus.initialized && !initializationStatus.loading) {
      initializeModelData();
    }
  }, [initializeModelData, initializationStatus.initialized, initializationStatus.loading]);

  useEffect(() => {
    loadUserPreferences();
  }, [loadUserPreferences]);

  const handleRefreshProviders = useCallback(async () => {
    setInitializationStatus((prev) => ({ ...prev, loading: true, error: null }));

    try {
      if (refreshModelData) {
        await refreshModelData();
      }
      // Also refresh user preferences when refreshing
      await loadUserPreferences();
      setInitializationStatus((prev) => ({ ...prev, loading: false }));
    } catch (error) {
      console.error('Failed to refresh  providers:', error);
      setInitializationStatus((prev) => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to refresh  providers',
      }));
    }
  }, [refreshModelData, loadUserPreferences]);

  // Calculate statistics
  const providerCount = modelState?.providers?.length || 0;
  const activeProviderCount = modelState?.providers?.filter((p: any) => p.isActive)?.length || 0;
  const modelCount = modelState?.models?.length || 0;
  const availableModelCount = modelState?.models?.filter((m: any) => m.isAvailable)?.length || 0;

  return (
    <div className={`h-full flex flex-col space-y-4 overflow-hidden ${className}`}>
      {/* Provider Settings Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative p-3 md:p-4 bg-gradient-to-br from-purple-500/10 to-pink-500/10 backdrop-blur-xl rounded-xl border border-purple-500/20"
      >
        <div
          className={`flex items-center ${currentViewport.isMobile ? 'flex-col gap-2' : 'justify-between'}`}
        >
          <div className="flex items-center gap-3">
            <motion.div
              className="w-8 h-8 md:w-10 md:h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg flex items-center justify-center shadow-lg"
              animate={{
                boxShadow: [
                  '0 10px 30px rgba(147, 51, 234, 0.3)',
                  '0 10px 30px rgba(236, 72, 153, 0.4)',
                  '0 10px 30px rgba(147, 51, 234, 0.3)',
                ],
              }}
              transition={{ duration: 3, repeat: Infinity }}
            >
              <Server className="w-4 h-4 md:w-5 md:h-5 text-white" />
            </motion.div>
            <div className={currentViewport.isMobile ? 'text-center' : ''}>
              <h1
                className={`font-bold text-white mb-1 ${currentViewport.isMobile ? 'text-base' : 'text-xl'}`}
              >
                Model Providers
              </h1>
              <p className={`text-purple-100 ${currentViewport.isMobile ? 'text-xs' : 'text-sm'}`}>
                {currentViewport.isMobile
                  ? 'Configure model sources'
                  : 'Configure and manage your model provider connections'}
              </p>
            </div>
          </div>

          {/* Status Indicators */}
          <div
            className={`flex items-center gap-2 ${currentViewport.isMobile ? 'flex-wrap justify-center' : ''}`}
          >
            <AnimatePresence mode="wait">
              {initializationStatus.loading && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="flex items-center gap-1 px-2 py-1 bg-purple-500/20 rounded-lg border border-purple-500/30"
                >
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity }}
                  >
                    <RefreshCw className="w-3 h-3 text-purple-400" />
                  </motion.div>
                  <span className="text-xs text-purple-300 font-medium">
                    {currentViewport.isMobile ? 'Sync...' : 'Sync...'}
                  </span>
                </motion.div>
              )}

              {initializationStatus.error && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="flex items-center gap-1 px-2 py-1 bg-red-500/20 rounded-lg border border-red-500/30"
                >
                  <AlertCircle className="w-3 h-3 text-red-400" />
                  <span className="text-xs text-red-300 font-medium">
                    {currentViewport.isMobile ? 'Error' : 'Error'}
                  </span>
                </motion.div>
              )}

              {!initializationStatus.loading && !initializationStatus.error && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="flex items-center gap-1 px-2 py-1 bg-emerald-500/20 rounded-lg border border-emerald-500/30"
                >
                  <motion.div
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  >
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                  </motion.div>
                  <span className="text-xs text-emerald-300 font-medium">Ready</span>
                </motion.div>
              )}
            </AnimatePresence>

            <motion.button
              onClick={handleRefreshProviders}
              disabled={initializationStatus.loading}
              className="flex items-center gap-1 px-3 py-1 bg-gradient-to-r from-purple-600/80 to-pink-600/80 hover:from-purple-500/80 hover:to-pink-500/80 text-white rounded-lg transition-all duration-300 border border-purple-500/50 hover:border-purple-400/50 disabled:opacity-50"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <motion.div
                animate={{ rotate: initializationStatus.loading ? 360 : 0 }}
                transition={{ duration: 1, repeat: initializationStatus.loading ? Infinity : 0 }}
              >
                <RefreshCw className="w-3 h-3" />
              </motion.div>
              <span className="text-xs font-medium">Sync</span>
            </motion.button>
          </div>
        </div>

        {/* Tabs */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="flex gap-2 mt-4"
        >
          {[
            { id: 'providers', label: 'Providers', icon: Server },
            { id: 'preferences', label: 'User Preferences', icon: User },
          ].map((tab) => (
            <motion.button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as 'providers' | 'preferences')}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                  : 'text-slate-400 hover:text-slate-300 hover:bg-slate-700/30'
              }`}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </motion.button>
          ))}
        </motion.div>

        {/* Provider Stats Grid */}
        {activeTab === 'providers' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className={`flex items-center gap-3 mt-3 ${currentViewport.isMobile ? 'flex-wrap justify-center' : ''}`}
          >
            {[
              { icon: Server, label: `${providerCount} Providers`, color: 'purple' },
              { icon: Activity, label: `${activeProviderCount} Active`, color: 'green' },
              {
                icon: Database,
                label: `${availableModelCount}/${modelCount} Models`,
                color: 'blue',
              },
            ].map((stat, index) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + index * 0.1 }}
                className="flex items-center gap-1"
              >
                <stat.icon className={`w-3 h-3 text-${stat.color}-400`} />
                <span
                  className={`text-slate-300 ${currentViewport.isMobile ? 'text-xs' : 'text-xs'}`}
                >
                  {stat.label}
                </span>
              </motion.div>
            ))}
          </motion.div>
        )}
      </motion.div>

      {/* Error Display */}
      <AnimatePresence>
        {initializationStatus.error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-start gap-3 p-4 bg-gradient-to-r from-red-900/30 to-pink-900/30 border border-red-500/30 rounded-xl backdrop-blur-sm"
          >
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-red-300 mb-1">Initialization Error</h3>
              <p className="text-sm text-red-400 mb-3">{initializationStatus.error}</p>
              <motion.button
                onClick={handleRefreshProviders}
                className="text-sm text-red-300 hover:text-red-200 font-medium underline"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                Retry Sync
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <motion.div
        className="flex-1 overflow-hidden"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
      >
        <div className="h-full bg-gradient-to-br from-purple-500/5 to-pink-500/5 backdrop-blur-xl rounded-2xl border border-purple-500/10 overflow-hidden">
          {activeTab === 'providers' ? (
            <ModelProviderSettings
              className="h-full overflow-auto"
              providers={modelState?.providers || []}
              models={modelState?.models || []}
              loading={
                modelState?.loadingProviders ||
                modelState?.loadingModels ||
                initializationStatus.loading
              }
              error={
                modelState?.providersError || modelState?.modelsError || initializationStatus.error
              }
              onCreateProvider={createProvider}
              onUpdateProvider={updateProvider}
              onTestProvider={testProvider}
              onDeleteProvider={deleteProvider}
              onRefresh={handleRefreshProviders}
            />
          ) : (
            <div className="h-full overflow-auto p-6">
              {/* User LLM Preferences */}
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-lg flex items-center justify-center">
                      <User className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-white">User LLM Preferences</h2>
                      <p className="text-sm text-slate-400">
                        Configure your default model preferences for different tasks
                      </p>
                    </div>
                  </div>
                  <motion.button
                    onClick={addUserPreference}
                    className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white rounded-lg transition-all"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <Plus className="w-4 h-4" />
                    Add Preference
                  </motion.button>
                </div>

                {loadingPreferences ? (
                  <div className="flex items-center justify-center py-8">
                    <RefreshCw className="w-6 h-6 text-purple-400 animate-spin" />
                  </div>
                ) : userPreferences.length === 0 ? (
                  <div className="text-center py-12 border-2 border-dashed border-slate-600/50 rounded-xl">
                    <Cpu className="w-12 h-12 mx-auto mb-4 text-slate-500" />
                    <h3 className="text-lg font-medium text-slate-300 mb-2">
                      No preferences configured
                    </h3>
                    <p className="text-sm text-slate-500 mb-4">
                      Add task-specific model preferences to optimize your AI experience
                    </p>
                    <motion.button
                      onClick={addUserPreference}
                      className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white rounded-lg transition-all mx-auto"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <Plus className="w-4 h-4" />
                      Create First Preference
                    </motion.button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {userPreferences.map((preference, index) => (
                      <motion.div
                        key={index}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4"
                      >
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">
                              Task Type
                            </label>
                            <select
                              value={preference.taskType}
                              onChange={(e) =>
                                updateUserPreference(index, {
                                  taskType: e.target.value as LLMTaskType,
                                })
                              }
                              className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600/50 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                            >
                              {LLM_TASK_TYPE_OPTIONS.map((type) => (
                                <option key={type.value} value={type.value}>
                                  {type.label}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">
                              Provider
                            </label>
                            <select
                              value={preference.preferredProvider}
                              onChange={(e) =>
                                updateUserPreference(index, {
                                  preferredProvider: e.target.value as LLMProviderType,
                                })
                              }
                              className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600/50 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                            >
                              {LLM_PROVIDER_TYPE_OPTIONS.map((provider) => (
                                <option key={provider.value} value={provider.value}>
                                  {provider.label}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">
                              Model
                            </label>
                            <div className="flex gap-2">
                              <select
                                value={preference.preferredModel}
                                onChange={(e) =>
                                  updateUserPreference(index, { preferredModel: e.target.value })
                                }
                                className="flex-1 px-3 py-2 bg-slate-700/50 border border-slate-600/50 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                              >
                                <option value="">Select a model...</option>
                                {(modelState?.models || [])
                                  .filter(
                                    (model: any) =>
                                      model.provider === preference.preferredProvider ||
                                      model.apiType === preference.preferredProvider ||
                                      // Include popular models regardless of provider
                                      model.name?.toLowerCase().includes('claude') ||
                                      model.name?.toLowerCase().includes('gpt')
                                  )
                                  .map((model: any) => (
                                    <option key={model.id} value={model.id}>
                                      {model.name} ({model.provider || model.source})
                                    </option>
                                  ))}
                              </select>
                              <motion.button
                                onClick={() => removeUserPreference(index)}
                                className="px-3 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg transition-colors"
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                              >
                                <Trash2 className="w-4 h-4" />
                              </motion.button>
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                          <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">
                              Priority (1-100)
                            </label>
                            <input
                              type="number"
                              min="1"
                              max="100"
                              value={preference.priority}
                              onChange={(e) =>
                                updateUserPreference(index, { priority: parseInt(e.target.value) })
                              }
                              className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600/50 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">
                              Temperature
                            </label>
                            <input
                              type="number"
                              min="0"
                              max="2"
                              step="0.1"
                              value={preference.settings?.temperature || 0.7}
                              onChange={(e) =>
                                updateUserPreference(index, {
                                  settings: {
                                    ...preference.settings,
                                    temperature: parseFloat(e.target.value),
                                  },
                                })
                              }
                              className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600/50 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                            />
                          </div>

                          <div className="flex items-center">
                            <label className="flex items-center text-sm text-slate-300">
                              <input
                                type="checkbox"
                                checked={preference.isActive}
                                onChange={(e) =>
                                  updateUserPreference(index, { isActive: e.target.checked })
                                }
                                className="mr-2 w-4 h-4 text-blue-600 bg-slate-700 border-slate-600 rounded focus:ring-blue-500"
                              />
                              Active
                            </label>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}

                {userPreferences.length > 0 && (
                  <div className="flex justify-end pt-4 border-t border-slate-700/50">
                    <motion.button
                      onClick={saveUserPreferences}
                      className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white rounded-lg transition-all font-medium"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <Settings className="w-4 h-4" />
                      Save Preferences
                    </motion.button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};
