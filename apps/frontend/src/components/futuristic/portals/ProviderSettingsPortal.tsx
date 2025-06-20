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
  Zap
} from 'lucide-react';

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

export const ProviderSettingsPortal: React.FC<ProviderSettingsPortalProps> = ({ className, viewport }) => {
  const { 
    modelState,
    loadProviders,
    loadModels,
    refreshModelData,
    createProvider,
    updateProvider,
    testProvider,
    deleteProvider
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
    initialized: false
  });

  // Default viewport if not provided
  const defaultViewport: ViewportSize = {
    width: typeof window !== 'undefined' ? window.innerWidth : 1024,
    height: typeof window !== 'undefined' ? window.innerHeight : 768,
    isMobile: typeof window !== 'undefined' ? window.innerWidth < 768 : false,
    isTablet: typeof window !== 'undefined' ? window.innerWidth >= 768 && window.innerWidth < 1024 : false,
    isDesktop: typeof window !== 'undefined' ? window.innerWidth >= 1024 : true
  };

  const currentViewport = viewport || defaultViewport;

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
          ? 'Failed to load some  model data' 
          : null
      }));
    } catch (error) {
      console.error('Failed to initialize model data:', error);
      setInitializationStatus(prev => ({ 
        ...prev, 
        loading: false,
        initialized: true,
        error: error instanceof Error ? error.message : 'Failed to load  model data'
      }));
    }
  }, [loadProviders, loadModels, initializationStatus.initialized, initializationStatus.loading]);

  useEffect(() => {
    if (!initializationStatus.initialized && !initializationStatus.loading) {
      initializeModelData();
    }
  }, [initializeModelData, initializationStatus.initialized, initializationStatus.loading]);

  const handleRefreshProviders = useCallback(async () => {
    setInitializationStatus(prev => ({ ...prev, loading: true, error: null }));
    
    try {
      if (refreshModelData) {
        await refreshModelData();
      }
      setInitializationStatus(prev => ({ ...prev, loading: false }));
    } catch (error) {
      console.error('Failed to refresh  providers:', error);
      setInitializationStatus(prev => ({ 
        ...prev, 
        loading: false, 
        error: error instanceof Error ? error.message : 'Failed to refresh  providers'
      }));
    }
  }, [refreshModelData]);

  // Calculate statistics
  const providerCount = modelState?.providers?.length || 0;
  const activeProviderCount = modelState?.providers?.filter((p: any) => p.isActive)?.length || 0;
  const modelCount = modelState?.models?.length || 0;
  const availableModelCount = modelState?.models?.filter((m: any) => m.isAvailable)?.length || 0;

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Provider Settings Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative p-4 md:p-6 bg-gradient-to-br from-purple-500/10 to-pink-500/10 backdrop-blur-xl rounded-2xl border border-purple-500/20"
      >
        <div className={`flex items-center ${currentViewport.isMobile ? 'flex-col gap-4' : 'justify-between'}`}>
          <div className="flex items-center gap-4">
            <motion.div
              className="w-10 h-10 md:w-12 md:h-12 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center shadow-lg"
              animate={{ 
                boxShadow: [
                  '0 10px 30px rgba(147, 51, 234, 0.3)',
                  '0 10px 30px rgba(236, 72, 153, 0.4)',
                  '0 10px 30px rgba(147, 51, 234, 0.3)'
                ]
              }}
              transition={{ duration: 3, repeat: Infinity }}
            >
              <Server className="w-5 h-5 md:w-6 md:h-6 text-white" />
            </motion.div>
            <div className={currentViewport.isMobile ? 'text-center' : ''}>
              <h1 className={`font-bold text-white mb-2 ${currentViewport.isMobile ? 'text-lg' : 'text-2xl'}`}>
                {currentViewport.isMobile ? 'Model Providers' : 'Model Providers'}
              </h1>
              <p className={`text-purple-100 ${currentViewport.isMobile ? 'text-xs' : 'text-sm'}`}>
                {currentViewport.isMobile 
                  ? 'Configure model sources'
                  : 'Configure and manage your  model provider connections'
                }
              </p>
            </div>
          </div>
          
          {/* Status Indicators */}
          <div className={`flex items-center gap-2 md:gap-4 ${currentViewport.isMobile ? 'flex-wrap justify-center' : ''}`}>
            <AnimatePresence mode="wait">
              {initializationStatus.loading && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="flex items-center gap-2 px-2 md:px-3 py-1 md:py-2 bg-purple-500/20 rounded-lg border border-purple-500/30"
                >
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity }}
                  >
                    <RefreshCw className="w-3 h-3 md:w-4 md:h-4 text-purple-400" />
                  </motion.div>
                  <span className="text-xs md:text-sm text-purple-300 font-medium">
                    {currentViewport.isMobile ? 'Sync...' : ' Sync...'}
                  </span>
                </motion.div>
              )}
              
              {initializationStatus.error && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="flex items-center gap-2 px-2 md:px-3 py-1 md:py-2 bg-red-500/20 rounded-lg border border-red-500/30"
                >
                  <AlertCircle className="w-3 h-3 md:w-4 md:h-4 text-red-400" />
                  <span className="text-xs md:text-sm text-red-300 font-medium">
                    {currentViewport.isMobile ? 'Error' : 'Sync Error'}
                  </span>
                </motion.div>
              )}
              
              {!initializationStatus.loading && !initializationStatus.error && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="flex items-center gap-2 px-2 md:px-3 py-1 md:py-2 bg-emerald-500/20 rounded-lg border border-emerald-500/30"
                >
                  <motion.div
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  >
                    <CheckCircle2 className="w-3 h-3 md:w-4 md:h-4 text-emerald-400" />
                  </motion.div>
                  <span className="text-xs md:text-sm text-emerald-300 font-medium">
                    {currentViewport.isMobile ? 'Ready' : ' Ready'}
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
            
            <motion.button
              onClick={handleRefreshProviders}
              disabled={initializationStatus.loading}
              className="flex items-center gap-2 px-3 md:px-4 py-1 md:py-2 bg-gradient-to-r from-purple-600/80 to-pink-600/80 hover:from-purple-500/80 hover:to-pink-500/80 text-white rounded-xl transition-all duration-300 border border-purple-500/50 hover:border-purple-400/50 disabled:opacity-50"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <motion.div
                animate={{ rotate: initializationStatus.loading ? 360 : 0 }}
                transition={{ duration: 1, repeat: initializationStatus.loading ? Infinity : 0 }}
              >
                <RefreshCw className="w-3 h-3 md:w-4 md:h-4" />
              </motion.div>
              <span className="text-xs md:text-sm font-medium">Sync</span>
            </motion.button>
          </div>
        </div>
        
        {/* Provider Stats Grid */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className={`flex items-center gap-4 md:gap-6 mt-4 md:mt-6 ${currentViewport.isMobile ? 'flex-wrap justify-center' : ''}`}
        >
          {[
            { icon: Server, label: `${providerCount} Providers`, color: 'purple' },
            { icon: Activity, label: `${activeProviderCount} Active`, color: 'green' },
            { icon: Database, label: `${availableModelCount}/${modelCount} Models`, color: 'blue' }
          ].map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 + index * 0.1 }}
              className="flex items-center gap-2"
            >
              <stat.icon className={`w-4 h-4 text-${stat.color}-400`} />
              <span className={`text-slate-300 ${currentViewport.isMobile ? 'text-xs' : 'text-sm'}`}>
                {stat.label}
              </span>
            </motion.div>
          ))}
        </motion.div>
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
                 Initialization Error
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
                Retry  Sync
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Provider Settings Content */}
      <motion.div
        className={`${currentViewport.isMobile ? 'min-h-[400px]' : 'min-h-[500px]'}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
      >
        <div className="bg-gradient-to-br from-purple-500/5 to-pink-500/5 backdrop-blur-xl rounded-2xl border border-purple-500/10 overflow-hidden">
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
        </div>
      </motion.div>
    </div>
  );
}; 