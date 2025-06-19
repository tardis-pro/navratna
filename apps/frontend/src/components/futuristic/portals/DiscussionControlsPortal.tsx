import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  AlertCircle, 
  Activity,
  Settings,
  Brain,
  Code,
  FileText,
  TrendingUp,
  Zap,
  Cpu,
  Network
} from 'lucide-react';
import { useDiscussion } from '../../../contexts/DiscussionContext';
import { useAgents } from '../../../contexts/AgentContext';

interface DiscussionControlsPortalProps {
  className?: string;
  onThinkTokensToggle?: (visible: boolean) => void;
  showThinkTokens?: boolean;
}

export const DiscussionControlsPortal: React.FC<DiscussionControlsPortalProps> = ({ 
  className, 
  onThinkTokensToggle,
  showThinkTokens = false 
}) => {
  const { 
    isActive, 
    start, 
    stop,
    messages,
    participants,
    discussionId,
    isLoading: discussionLoading,
    lastError,
    isWebSocketConnected
  } = useDiscussion();
  
  const { agents } = useAgents();
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const canStart = Object.keys(agents).length >= 2;
  const agentCount = Object.keys(agents).length;
  const messageCount = messages?.length || 0;
  const participantCount = participants?.length || 0;

  const handleStart = async () => {
    if (!canStart) return;
    setIsLoading(true);
    try {
      await start();
    } finally {
      setIsLoading(false);
    }
  };

  const handleStop = async () => {
    setIsLoading(true);
    try {
      await stop();
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = async () => {
    if (!discussionId) return;
    setIsLoading(true);
    try {
      await stop(); // Stop current discussion to reset
      console.log('Discussion reset');
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickAction = async (action: string) => {
    if (!discussionId || !isActive) {
      console.warn(`Cannot execute ${action}: No active discussion`);
      return;
    }
    
    setIsLoading(true);
    try {
      switch (action) {
        case 'analyze':
          console.log('Analyzing conversation...', { messageCount, participantCount });
          break;
        case 'sentiment':
          console.log('Analyzing sentiment...', { messages: messageCount });
          break;
        case 'code':
          console.log('Generating code artifact...');
          break;
        case 'summary':
          console.log('Generating summary...', { messages: messageCount });
          break;
      }
    } catch (error) {
      console.error('Quick action failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/*  Status Grid */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Agents', value: agentCount, color: 'blue', icon: Brain },
          { label: 'Messages', value: messageCount, color: 'emerald', icon: Network },
          { label: 'Participants', value: participantCount, color: 'purple', icon: Activity },
          { label: 'Status', value: isActive ? 'ACTIVE' : 'IDLE', color: 'orange', icon: Zap, isText: true }
        ].map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="relative group"
          >
            {/*  pulse background */}
            <motion.div
              className={`absolute inset-0 bg-gradient-to-br from-${stat.color}-500/20 to-${stat.color}-600/20 rounded-xl blur-sm`}
              animate={{ 
                scale: [1, 1.05, 1],
                opacity: [0.5, 0.8, 0.5]
              }}
              transition={{ 
                duration: 2,
                repeat: Infinity,
                delay: index * 0.5
              }}
            />
            
            <div className={`relative p-4 bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-xl rounded-xl border border-${stat.color}-500/30 group-hover:border-${stat.color}-400/50 transition-all duration-300`}>
              <div className="flex items-center justify-between">
                <div>
                  <div className={`text-2xl font-bold bg-gradient-to-r from-${stat.color}-400 to-${stat.color}-500 bg-clip-text text-transparent`}>
                    {stat.isText ? (
                      <span className={`text-sm font-semibold ${isActive ? 'text-green-400' : 'text-slate-400'}`}>
                        {stat.value}
                      </span>
                    ) : (
                      stat.value
                    )}
                  </div>
                  <div className="text-xs font-medium text-slate-400">{stat.label}</div>
                </div>
                <stat.icon className={`w-6 h-6 text-${stat.color}-400`} />
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Primary Control Matrix */}
      <motion.div
        className="relative p-6 bg-gradient-to-br from-slate-800/50 to-slate-900/50 backdrop-blur-xl rounded-2xl border border-slate-700/50"
        whileHover={{ scale: 1.02 }}
        transition={{ type: "spring", stiffness: 300 }}
      >
        <div className="flex items-center gap-4">
          {!isActive ? (
            <motion.button
              onClick={handleStart}
              disabled={!canStart || isLoading}
              className="flex-1 flex items-center justify-center gap-3 bg-gradient-to-r from-blue-600 via-blue-700 to-cyan-600 hover:from-blue-700 hover:via-blue-800 hover:to-cyan-700 disabled:from-slate-600 disabled:to-slate-700 text-white px-6 py-4 rounded-xl font-semibold transition-all duration-300 shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 disabled:shadow-none relative overflow-hidden"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <motion.div
                className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0"
                animate={{ x: [-100, 100] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
              <Play className="w-5 h-5" />
              <span>Initialize Discussion</span>
              <Zap className="w-4 h-4" />
            </motion.button>
          ) : (
            <motion.button
              onClick={handleStop}
              disabled={isLoading}
              className="flex-1 flex items-center justify-center gap-3 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white px-6 py-4 rounded-xl font-semibold transition-all duration-300 shadow-lg shadow-red-500/25 hover:shadow-red-500/40 relative overflow-hidden"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Pause className="w-5 h-5" />
              <span>Terminate</span>
            </motion.button>
          )}
          
          <motion.button
            onClick={handleReset}
            disabled={isLoading}
            className="flex items-center justify-center gap-2 bg-gradient-to-r from-slate-700 to-slate-800 hover:from-slate-600 hover:to-slate-700 text-white px-6 py-4 rounded-xl font-semibold transition-all duration-300 shadow-lg"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <RotateCcw className="w-5 h-5" />
            <span>Reset</span>
          </motion.button>

          <motion.button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center justify-center bg-gradient-to-r from-slate-800/80 to-slate-900/80 hover:from-slate-700/80 hover:to-slate-800/80 text-slate-300 px-4 py-4 rounded-xl transition-all duration-300 border border-slate-600/50 hover:border-slate-500/50"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <Settings className="w-5 h-5" />
          </motion.button>
        </div>
      </motion.div>

      {/* Alert System */}
      <AnimatePresence>
        {!canStart && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="flex items-center gap-3 p-4 bg-gradient-to-r from-amber-900/30 to-orange-900/30 border border-amber-500/30 rounded-xl backdrop-blur-sm"
          >
            <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0" />
            <div>
              <span className="text-amber-300 font-medium block">
                 Network Insufficient
              </span>
              <span className="text-amber-400/80 text-sm">
                Minimum 2 agents required for discussion matrix
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* System Status */}
      <motion.div
        className="flex items-center justify-between p-4 bg-gradient-to-r from-slate-800/50 to-slate-900/50 backdrop-blur-xl rounded-xl border border-slate-700/50"
        whileHover={{ borderColor: 'rgba(59, 130, 246, 0.5)' }}
      >
        <span className="text-sm font-medium text-slate-300"> Network Status</span>
        <div className="flex items-center gap-3">
          <motion.div
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <Activity className={`w-5 h-5 ${isActive ? "text-emerald-400" : "text-slate-500"}`} />
          </motion.div>
          <span className={`text-sm font-medium ${isActive ? "text-emerald-400" : "text-slate-500"}`}>
            {isActive ? "ACTIVE" : "STANDBY"}
          </span>
        </div>
      </motion.div>

      {/* Advanced Controls */}
      <AnimatePresence>
        {showAdvanced && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-4 overflow-hidden"
          >
            <div className="p-6 bg-gradient-to-br from-slate-800/50 to-slate-900/50 backdrop-blur-xl rounded-xl border border-slate-700/50">
              <h4 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <Cpu className="w-5 h-5 text-blue-400" />
                 Command Matrix
              </h4>
              
              <div className="grid grid-cols-2 gap-3">
                {[
                  { id: 'analyze', icon: Brain, label: 'Analyze', color: 'purple' },
                  { id: 'sentiment', icon: TrendingUp, label: 'Sentiment', color: 'emerald' },
                  { id: 'code', icon: Code, label: 'Code Gen', color: 'blue' },
                  { id: 'summary', icon: FileText, label: 'Summary', color: 'orange' }
                ].map((action) => (
                  <motion.button
                    key={action.id}
                    onClick={() => handleQuickAction(action.id)}
                    disabled={isLoading || (action.id !== 'code' && messageCount === 0)}
                    className={`flex items-center gap-3 p-3 bg-gradient-to-r from-${action.color}-900/30 to-${action.color}-800/30 hover:from-${action.color}-800/40 hover:to-${action.color}-700/40 text-${action.color}-300 rounded-lg font-medium transition-all duration-300 border border-${action.color}-500/20 hover:border-${action.color}-400/40 disabled:opacity-50 disabled:cursor-not-allowed`}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <action.icon className="w-5 h-5" />
                    <span>{action.label}</span>
                  </motion.button>
                ))}
              </div>

              {/*  Toggle */}
              <div className="mt-6 pt-4 border-t border-slate-700/50">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-400">Think Tokens Visualization</span>
                  <motion.button
                    onClick={() => onThinkTokensToggle?.(!showThinkTokens)}
                    className={`w-12 h-6 rounded-full transition-colors ${
                      showThinkTokens ? 'bg-blue-600' : 'bg-slate-600'
                    }`}
                    whileTap={{ scale: 0.95 }}
                  >
                    <motion.div
                      className="w-5 h-5 bg-white rounded-full mt-0.5"
                      animate={{ x: showThinkTokens ? 24 : 2 }}
                      transition={{ type: "spring", stiffness: 500, damping: 30 }}
                    />
                  </motion.button>
                </div>
                
                {/* Service Status Matrix */}
                <div className="mt-4 space-y-2">
                  {[
                    'Security Gateway',
                    'Agent Intelligence', 
                    'Discussion Orchestration',
                    'Capability Registry'
                  ].map((service, index) => (
                    <motion.div
                      key={service}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.1 }}
                      className="flex items-center justify-between text-xs"
                    >
                      <span className="text-slate-400">{service}</span>
                      <div className="flex items-center gap-2">
                        <motion.div
                          className="w-2 h-2 bg-emerald-400 rounded-full"
                          animate={{ opacity: [0.5, 1, 0.5] }}
                          transition={{ duration: 2, repeat: Infinity, delay: index * 0.3 }}
                        />
                        <span className="text-emerald-400 font-medium">ONLINE</span>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Connection Status & Errors */}
      <div className="space-y-2">
        <div className={`flex items-center gap-2 text-xs p-3 rounded-lg border backdrop-blur-sm ${
          isWebSocketConnected 
            ? 'text-green-400 bg-green-500/10 border-green-500/30' 
            : 'text-red-400 bg-red-500/10 border-red-500/30'
        }`}>
          <div className={`w-2 h-2 rounded-full ${
            isWebSocketConnected ? 'bg-green-400 animate-pulse' : 'bg-red-400'
          }`} />
          <span>WebSocket: {isWebSocketConnected ? 'Connected' : 'Disconnected'}</span>
        </div>
        
        {lastError && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-3 backdrop-blur-sm"
          >
            <AlertCircle className="w-3 h-3 flex-shrink-0" />
            <span>{lastError}</span>
          </motion.div>
        )}
        
        {discussionId && (
          <div className="text-xs text-slate-400 bg-slate-800/30 rounded-lg p-2 border border-slate-700/30">
            <span className="font-mono">Discussion: {discussionId.slice(0, 8)}...{discussionId.slice(-4)}</span>
          </div>
        )}
      </div>
    </div>
  );
}; 