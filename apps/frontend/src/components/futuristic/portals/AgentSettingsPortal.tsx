import React, { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useAgents } from '../../../contexts/AgentContext';
import { AgentSettings } from '../../AgentSettings';
import { 
  Bot, 
  CheckCircle2, 
  RefreshCw,
  Users,
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

interface AgentSettingsPortalProps {
  className?: string;
  viewport?: ViewportSize;
}

export const AgentSettingsPortal: React.FC<AgentSettingsPortalProps> = ({ className, viewport }) => {
  const { 
    agents, 
    updateAgentState,
    modelState,
    getRecommendedModels,
    getModelsForProvider
  } = useAgents();
  
  const [refreshing, setRefreshing] = useState(false);

  // Default viewport if not provided
  const defaultViewport: ViewportSize = {
    width: typeof window !== 'undefined' ? window.innerWidth : 1024,
    height: typeof window !== 'undefined' ? window.innerHeight : 768,
    isMobile: typeof window !== 'undefined' ? window.innerWidth < 768 : false,
    isTablet: typeof window !== 'undefined' ? window.innerWidth >= 768 && window.innerWidth < 1024 : false,
    isDesktop: typeof window !== 'undefined' ? window.innerWidth >= 1024 : true
  };

  const currentViewport = viewport || defaultViewport;

  // Enhanced refresh handler that coordinates with AgentSettings
  const handleRefreshAgents = useCallback(async () => {
    setRefreshing(true);
    try {
      // The actual refresh logic will be handled by the AgentSettings component
      // This just provides the UI feedback for the portal
      console.log('Initiating  agent refresh from portal...');
    } catch (error) {
      console.error('Portal refresh error:', error);
    } finally {
      // Keep refreshing state for a minimum time for better UX
      setTimeout(() => setRefreshing(false), 500);
    }
  }, []);

  // Calculate statistics with better error handling
  const agentStats = React.useMemo(() => {
    const agentList = Object.values(agents);
    return {
      total: agentList.length,
      active: agentList.filter((agent: any) => agent.isActive !== false).length,
      configured: agentList.filter((agent: any) => agent.modelId && agent.personaId).length
    };
  }, [agents]);

  return (
    <div className={`space-y-4 ${className} ${currentViewport.isMobile ? 'px-2' : ''}`}>
      {/*  Agent Configuration Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative p-4 md:p-6 bg-gradient-to-br from-blue-500/10 to-cyan-500/10 backdrop-blur-xl rounded-2xl border border-blue-500/20"
      >
        <div className={`flex items-center ${currentViewport.isMobile ? 'flex-col gap-4' : 'justify-between'}`}>
          <div className="flex items-center gap-4">
            <motion.div
              className="w-10 h-10 md:w-12 md:h-12 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl flex items-center justify-center shadow-lg"
              animate={{ 
                boxShadow: [
                  '0 10px 30px rgba(59, 130, 246, 0.3)',
                  '0 10px 30px rgba(6, 182, 212, 0.4)',
                  '0 10px 30px rgba(59, 130, 246, 0.3)'
                ]
              }}
              transition={{ duration: 3, repeat: Infinity }}
            >
              <Bot className="w-5 h-5 md:w-6 md:h-6 text-white" />
            </motion.div>
            <div className={currentViewport.isMobile ? 'text-center' : ''}>
              <h1 className={`font-bold text-white mb-2 ${currentViewport.isMobile ? 'text-lg' : 'text-2xl'}`}>
                {currentViewport.isMobile ? ' Agents' : ' Agent Configuration'}
              </h1>
              <p className={`text-blue-100 ${currentViewport.isMobile ? 'text-xs' : 'text-sm'}`}>
                {currentViewport.isMobile 
                  ? 'Configure AI consciousness entities'
                  : 'Manage and configure your AI consciousness entities and their  models'
                }
              </p>
            </div>
          </div>
          
          {/* Status Indicators */}
          <div className={`flex items-center gap-2 md:gap-4 ${currentViewport.isMobile ? 'flex-wrap justify-center' : ''}`}>
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-center gap-2 px-2 md:px-3 py-1 md:py-2 bg-blue-500/20 rounded-lg border border-blue-500/30"
            >
              <motion.div
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <CheckCircle2 className="w-3 h-3 md:w-4 md:h-4 text-blue-400" />
              </motion.div>
              <span className="text-xs md:text-sm text-blue-300 font-medium">
                {currentViewport.isMobile ? 'Ready' : 'Agents Ready'}
              </span>
            </motion.div>
            
            <motion.button
              onClick={handleRefreshAgents}
              disabled={refreshing}
              className="flex items-center gap-2 px-3 md:px-4 py-1 md:py-2 bg-gradient-to-r from-blue-600/80 to-cyan-600/80 hover:from-blue-500/80 hover:to-cyan-500/80 text-white rounded-xl transition-all duration-300 border border-blue-500/50 hover:border-blue-400/50 disabled:opacity-50"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <motion.div
                animate={{ rotate: refreshing ? 360 : 0 }}
                transition={{ duration: 1, repeat: refreshing ? Infinity : 0 }}
              >
                <RefreshCw className="w-3 h-3 md:w-4 md:h-4" />
              </motion.div>
              <span className="text-xs md:text-sm font-medium">Refresh</span>
            </motion.button>
          </div>
        </div>
        
        {/* Agent Statistics Grid */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className={`flex items-center gap-4 md:gap-6 mt-4 md:mt-6 ${currentViewport.isMobile ? 'flex-wrap justify-center' : ''}`}
        >
          {[
            { icon: Users, label: `${agentStats.total} Total`, color: 'blue' },
            { icon: Activity, label: `${agentStats.active} Active`, color: 'green' },
            { icon: Zap, label: `${agentStats.configured} Configured`, color: 'purple' }
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

      {/* Agent Settings Content */}
      <motion.div
        className={`${currentViewport.isMobile ? 'min-h-[400px]' : 'min-h-[500px]'}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
      >
        <div className="bg-gradient-to-br from-blue-500/5 to-cyan-500/5 backdrop-blur-xl rounded-2xl border border-blue-500/10 overflow-hidden">
          <AgentSettings 
            agents={agents}
            onUpdateAgent={updateAgentState}
            onRefreshAgents={handleRefreshAgents}
            modelState={modelState}
            getRecommendedModels={getRecommendedModels}
            getModelsForProvider={getModelsForProvider}
          />
        </div>
      </motion.div>
    </div>
  );
}; 