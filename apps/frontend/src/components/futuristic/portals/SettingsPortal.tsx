import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAgents } from '../../../contexts/AgentContext';
import { AgentSettings } from '../../AgentSettings';
import { ModelProviderSettings } from '../../ModelProviderSettings';
import { Button } from '../../ui/button';
import { 
  Bot, 
  Server, 
  Settings, 
  Users, 
  AlertCircle, 
  CheckCircle2, 
  RefreshCw,
  Cpu,
  Network,
  Zap,
  Brain,
  Database,
  Shield,
  Activity
} from 'lucide-react';

type SettingsTab = 'agents' | 'providers' | 'general';

interface SettingsPortalProps {
  className?: string;
}

export const SettingsPortal: React.FC<SettingsPortalProps> = ({ className }) => {
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
  
  const [activeTab, setActiveTab] = useState<SettingsTab>('providers');
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
      return;
    }

    setInitializationStatus(prev => ({ ...prev, loading: true, error: null }));
    
    try {
      const results = await Promise.allSettled([
        loadProviders?.() || Promise.resolve(),
        loadModels?.() || Promise.resolve()
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
          ? 'Failed to load some neural model data' 
          : null
      }));
    } catch (error) {
      console.error('Failed to initialize model data:', error);
      setInitializationStatus(prev => ({ 
        ...prev, 
        loading: false,
        initialized: true,
        error: error instanceof Error ? error.message : 'Failed to load neural model data'
      }));
    }
  }, [loadProviders, loadModels, initializationStatus.initialized, initializationStatus.loading]);

  useEffect(() => {
    if (!initializationStatus.initialized && !initializationStatus.loading) {
      initializeModelData();
    }
  }, [initializeModelData, initializationStatus.initialized, initializationStatus.loading]);

  const handleRefreshAgents = useCallback(() => {
    console.log('Refreshing neural agents...');
  }, []);

  const handleRefreshProviders = useCallback(async () => {
    setInitializationStatus(prev => ({ ...prev, loading: true, error: null }));
    
    try {
      if (refreshModelData) {
        await refreshModelData();
      }
      setInitializationStatus(prev => ({ ...prev, loading: false }));
    } catch (error) {
      console.error('Failed to refresh neural providers:', error);
      setInitializationStatus(prev => ({ 
        ...prev, 
        loading: false, 
        error: error instanceof Error ? error.message : 'Failed to refresh neural providers'
      }));
    }
  }, [refreshModelData]);

  // Calculate statistics
  const agentCount = Object.keys(agents).length;
  const activeAgentCount = Object.values(agents).filter((agent: any) => agent.isActive !== false).length;
  const providerCount = modelState?.providers?.length || 0;
  const activeProviderCount = modelState?.providers?.filter((p: any) => p.isActive)?.length || 0;
  const modelCount = modelState?.models?.length || 0;
  const availableModelCount = modelState?.models?.filter((m: any) => m.isAvailable)?.length || 0;

  const tabs = [
    {
      id: 'agents' as const,
      label: 'Neural Agents',
      icon: Bot,
      count: agentCount,
      color: 'blue',
      description: 'Manage AI consciousness entities'
    },
    {
      id: 'providers' as const,
      label: 'Model Providers',
      icon: Server,
      count: providerCount,
      color: 'purple',
      description: 'Configure neural model sources'
    },
    {
      id: 'general' as const,
      label: 'System Config',
      icon: Settings,
      count: 0,
      color: 'emerald',
      description: 'Global system parameters'
    }
  ];

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Neural Settings Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative p-6 bg-gradient-to-br from-slate-800/50 to-slate-900/50 backdrop-blur-xl rounded-2xl border border-slate-700/50"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <motion.div
              className="w-12 h-12 bg-gradient-to-br from-blue-500 via-purple-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg"
              animate={{ 
                boxShadow: [
                  '0 10px 30px rgba(59, 130, 246, 0.3)',
                  '0 10px 30px rgba(168, 85, 247, 0.4)',
                  '0 10px 30px rgba(59, 130, 246, 0.3)'
                ]
              }}
              transition={{ duration: 3, repeat: Infinity }}
            >
              <Settings className="w-6 h-6 text-white" />
            </motion.div>
            <div>
              <h1 className="text-2xl font-bold text-white mb-2">
                Neural Configuration Matrix
              </h1>
              <p className="text-slate-400">
                Configure AI consciousness entities, neural model providers, and system parameters
              </p>
            </div>
          </div>
          
          {/* Status Indicators */}
          <div className="flex items-center gap-4">
            <AnimatePresence mode="wait">
              {initializationStatus.loading && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="flex items-center gap-2 px-3 py-2 bg-blue-500/20 rounded-lg border border-blue-500/30"
                >
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity }}
                  >
                    <RefreshCw className="w-4 h-4 text-blue-400" />
                  </motion.div>
                  <span className="text-sm text-blue-300 font-medium">
                    Neural Sync...
                  </span>
                </motion.div>
              )}
              
              {initializationStatus.error && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="flex items-center gap-2 px-3 py-2 bg-red-500/20 rounded-lg border border-red-500/30"
                >
                  <AlertCircle className="w-4 h-4 text-red-400" />
                  <span className="text-sm text-red-300 font-medium">
                    Sync Error
                  </span>
                </motion.div>
              )}
              
              {!initializationStatus.loading && !initializationStatus.error && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="flex items-center gap-2 px-3 py-2 bg-emerald-500/20 rounded-lg border border-emerald-500/30"
                >
                  <motion.div
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  >
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  </motion.div>
                  <span className="text-sm text-emerald-300 font-medium">
                    Neural Ready
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
            
            <motion.button
              onClick={handleRefreshProviders}
              disabled={initializationStatus.loading}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-slate-700/80 to-slate-800/80 hover:from-slate-600/80 hover:to-slate-700/80 text-slate-300 rounded-xl transition-all duration-300 border border-slate-600/50 hover:border-slate-500/50 disabled:opacity-50"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <motion.div
                animate={{ rotate: initializationStatus.loading ? 360 : 0 }}
                transition={{ duration: 1, repeat: initializationStatus.loading ? Infinity : 0 }}
              >
                <RefreshCw className="w-4 h-4" />
              </motion.div>
              <span className="text-sm font-medium">Sync</span>
            </motion.button>
          </div>
        </div>
        
        {/* Neural Stats Grid */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="flex items-center gap-6 mt-6"
        >
          {[
            { icon: Bot, label: `${activeAgentCount}/${agentCount} Agents Active`, color: 'blue' },
            { icon: Server, label: `${activeProviderCount}/${providerCount} Providers Active`, color: 'purple' },
            { icon: Database, label: `${availableModelCount}/${modelCount} Models Available`, color: 'emerald' }
          ].map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 + index * 0.1 }}
              className="flex items-center gap-2"
            >
              <stat.icon className={`w-4 h-4 text-${stat.color}-400`} />
              <span className="text-sm text-slate-400">
                {stat.label}
              </span>
            </motion.div>
          ))}
        </motion.div>
      </motion.div>

      {/* Neural Tab Navigation */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="flex gap-2 p-2 bg-gradient-to-r from-slate-800/50 to-slate-900/50 backdrop-blur-xl rounded-xl border border-slate-700/50"
      >
        {tabs.map((tab, index) => (
          <motion.button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-300 ${
              activeTab === tab.id
                ? `bg-gradient-to-r from-${tab.color}-600/30 to-${tab.color}-700/30 text-${tab.color}-300 border border-${tab.color}-500/30`
                : 'text-slate-400 hover:text-slate-300 hover:bg-slate-700/30'
            }`}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 + index * 0.1 }}
          >
            <tab.icon className="w-5 h-5" />
            <div className="text-left">
              <div className="font-semibold">{tab.label}</div>
              <div className="text-xs opacity-70">{tab.description}</div>
            </div>
            {tab.count > 0 && (
              <motion.span
                className={`ml-auto px-2 py-0.5 bg-${tab.color}-500/20 text-${tab.color}-300 text-xs rounded-full border border-${tab.color}-500/30`}
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ duration: 2, repeat: Infinity, delay: index * 0.5 }}
              >
                {tab.count}
              </motion.span>
            )}
          </motion.button>
        ))}
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
              <h3 className="text-sm font-semibold text-red-300 mb-1">
                Neural Initialization Error
              </h3>
              <p className="text-sm text-red-400 mb-3">
                {initializationStatus.error}
              </p>
              <motion.button
                onClick={handleRefreshProviders}
                className="text-sm text-red-300 hover:text-red-200 font-medium underline"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                Retry Neural Sync
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Neural Content Panels */}
      <motion.div
        className="min-h-[500px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
      >
        <AnimatePresence mode="wait">
          {activeTab === 'agents' && (
            <motion.div
              key="agents"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.3 }}
              className="bg-gradient-to-br from-slate-800/30 to-slate-900/30 backdrop-blur-xl rounded-2xl border border-slate-700/50 overflow-hidden"
            >
              {/* Integrate the actual AgentSettings component */}
              <AgentSettings 
                agents={agents}
                onUpdateAgent={updateAgentState}
                onRefreshAgents={handleRefreshAgents}
                modelState={modelState}
                getRecommendedModels={getRecommendedModels}
                getModelsForProvider={getModelsForProvider}
              />
            </motion.div>
          )}
          
          {activeTab === 'providers' && (
            <motion.div
              key="providers"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.3 }}
              className="bg-gradient-to-br from-slate-800/30 to-slate-900/30 backdrop-blur-xl rounded-2xl border border-slate-700/50 overflow-hidden"
            >
              {/* Integrate the actual ModelProviderSettings component */}
              <ModelProviderSettings 
                className="p-0" // Remove default padding since we're in a portal
                providers={modelState?.providers || []}
                models={modelState?.models || []}
                loading={modelState?.loadingProviders || modelState?.loadingModels || initializationStatus.loading}
                error={modelState?.providersError || modelState?.modelsError || initializationStatus.error}
                onCreateProvider={createProvider}
                onUpdateProvider={updateProvider}
                onTestProvider={testProvider}
                onDeleteProvider={deleteProvider}
                onRefresh={handleRefreshProviders}
              />
            </motion.div>
          )}
          
          {activeTab === 'general' && (
            <motion.div
              key="general"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.3 }}
              className="bg-gradient-to-br from-slate-800/30 to-slate-900/30 backdrop-blur-xl rounded-2xl p-6 border border-slate-700/50"
            >
              <div className="flex items-center gap-3 mb-6">
                <motion.div
                  className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-lg flex items-center justify-center"
                  animate={{ rotate: [0, 10, -10, 0] }}
                  transition={{ duration: 5, repeat: Infinity }}
                >
                  <Settings className="w-5 h-5 text-white" />
                </motion.div>
                <div>
                  <h2 className="text-xl font-bold text-white">System Configuration</h2>
                  <p className="text-slate-400 text-sm">Global neural system parameters and preferences</p>
                </div>
              </div>
              
              <div className="text-center py-12">
                <motion.div
                  animate={{ 
                    boxShadow: [
                      '0 0 20px rgba(16, 185, 129, 0.3)',
                      '0 0 30px rgba(16, 185, 129, 0.5)',
                      '0 0 20px rgba(16, 185, 129, 0.3)'
                    ]
                  }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="w-16 h-16 bg-gradient-to-br from-emerald-500/20 to-teal-500/20 rounded-xl flex items-center justify-center mx-auto mb-4 border-2 border-dashed border-emerald-500/30"
                >
                  <Cpu className="w-8 h-8 text-emerald-400" />
                </motion.div>
                <h3 className="text-lg font-semibold text-white mb-2">
                  Global System Configuration
                </h3>
                <p className="text-slate-400">
                  System-wide neural parameters coming soon...
                </p>
                
                {/* Preview of future features */}
                <div className="mt-8 grid grid-cols-2 gap-4 max-w-md mx-auto">
                  {[
                    { icon: Shield, label: 'Security Matrix', color: 'red' },
                    { icon: Activity, label: 'Performance Tuning', color: 'yellow' },
                    { icon: Zap, label: 'Neural Acceleration', color: 'blue' },
                    { icon: Network, label: 'Consciousness Sync', color: 'purple' }
                  ].map((feature, index) => (
                    <motion.div
                      key={feature.label}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: index * 0.1 }}
                      className={`p-3 bg-gradient-to-br from-${feature.color}-500/10 to-${feature.color}-600/10 rounded-lg border border-${feature.color}-500/20`}
                    >
                      <feature.icon className={`w-6 h-6 text-${feature.color}-400 mx-auto mb-2`} />
                      <p className="text-xs text-slate-400">{feature.label}</p>
                    </motion.div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}; 