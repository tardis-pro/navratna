import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { useAgents } from '../../../contexts/AgentContext';
import { useDiscussion } from '../../../contexts/DiscussionContext';
import type { Message } from '../../../types/agent';
import { cn } from '../../../lib/utils';
import { 
  MessageSquare, 
  Brain, 
  Clock, 
  User, 
  Play, 
  Users, 
  AlertCircle, 
  Loader2,
  Activity,
  Network,
  Zap,
  Eye,
  EyeOff,
  Filter,
  Search,
  Download,
  Maximize2,
  Minimize2
} from 'lucide-react';

// Function to parse and clean content with think tags
const parseMessageContent = (content: string, showThoughts: boolean): string => {
  const thinkMatch = content.match(/<think>([\s\S]*?)<\/think>/);
  
  if (thinkMatch && showThoughts) {
    // Show both thought and regular content
    const thoughtContent = thinkMatch[1].trim();
    const cleanContent = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    
    if (cleanContent && thoughtContent) {
      return `${cleanContent}\n\n💭 ${thoughtContent}`;
    }
    return thoughtContent || cleanContent;
  }
  
  // Remove think tags and return clean content
  return content.replace(/<think>[\s\S]*?<\/think>/g, '').trim() || content;
};

interface DiscussionLogPortalProps {
  className?: string;
  showThinkTokens?: boolean;
  onThinkTokensToggle?: (visible: boolean) => void;
}

export const DiscussionLogPortal: React.FC<DiscussionLogPortalProps> = ({ 
  className, 
  showThinkTokens = false,
  onThinkTokensToggle
}) => {
  const { agents } = useAgents();
  const { 
    history, 
    isActive, 
    discussionId, 
    participants, 
    start, 
    lastError,
    isWebSocketConnected,
    websocketError 
  } = useDiscussion();
  
  const [isStarting, setIsStarting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterAgent, setFilterAgent] = useState('all');
  const [isExpanded, setIsExpanded] = useState(false);
  const [initializationStatus, setInitializationStatus] = useState<{
    hasAgents: boolean;
    hasParticipants: boolean;
    hasDiscussion: boolean;
    isConnected: boolean;
  }>({
    hasAgents: false,
    hasParticipants: false,
    hasDiscussion: false,
    isConnected: false
  });

  // Monitor initialization status
  useEffect(() => {
    setInitializationStatus({
      hasAgents: Object.keys(agents).length > 0,
      hasParticipants: participants.length > 0,
      hasDiscussion: !!discussionId,
      isConnected: isWebSocketConnected
    });
  }, [agents, participants, discussionId, isWebSocketConnected]);

  // Auto-start discussion when conditions are met
  useEffect(() => {
    const { hasAgents, hasParticipants, hasDiscussion, isConnected } = initializationStatus;
    
    // Only auto-start if we have agents but no active discussion
    if (hasAgents && !isActive && !isStarting && !hasDiscussion) {
      console.log('🚀 Auto-starting discussion with available agents');
      handleStartDiscussion();
    }
  }, [initializationStatus, isActive, isStarting]);

  const handleStartDiscussion = async () => {
    if (isStarting || isActive) return;
    
    setIsStarting(true);
    try {
      console.log('🎬 Starting discussion...', { 
        agentCount: Object.keys(agents).length,
        participants: participants.length 
      });
      
      await start();
      console.log('✅ Discussion started successfully');
    } catch (error) {
      console.error('❌ Failed to start discussion:', error);
    } finally {
      setIsStarting(false);
    }
  };

  if (!history) {
    return (
      <div className={cn("space-y-6", className)}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-6 bg-gradient-to-br from-slate-800/50 to-slate-900/50 backdrop-blur-xl rounded-2xl border border-slate-700/50"
        >
          <div className="text-center text-slate-400">
            <MessageSquare className="w-12 h-12 mx-auto mb-4 text-slate-600" />
            <p>No discussion history available</p>
          </div>
        </motion.div>
      </div>
    );
  }

  // Filter and sort messages
  const messages = history
    .filter(message => {
      const matchesSearch = !searchTerm || 
        message.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
        message.sender.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesAgent = filterAgent === 'all' || message.sender === filterAgent;
      const matchesType = showThinkTokens || message.type !== 'thought';
      
      return matchesSearch && matchesAgent && matchesType;
    })
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  const getAgentColor = (sender: string) => {
    const colors = [
      'blue', 'emerald', 'purple', 'orange', 'pink', 'indigo'
    ];
    
    const agentNames = Object.values(agents).map(a => a.name);
    const index = agentNames.indexOf(sender);
    return colors[index % colors.length] || colors[0];
  };

  const renderMessage = (message: Message, index: number) => {
    const agent = Object.values(agents).find(a => a.name === message.sender);
    const isThought = message.type === 'thought';
    const content = parseMessageContent(message.content, showThinkTokens);
    const color = getAgentColor(message.sender);
    
    return (
      <motion.div
        key={message.id}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.05 }}
        className="group relative"
      >
        {/* Message pulse background */}
        <motion.div
          className={`absolute inset-0 bg-gradient-to-br from-${color}-500/10 to-${color}-600/10 rounded-xl blur-sm opacity-0 group-hover:opacity-100`}
          transition={{ duration: 0.3 }}
        />
        
        <div className={cn(
          "relative p-4 rounded-xl transition-all duration-300",
          isThought 
            ? "bg-gradient-to-br from-amber-900/20 to-amber-800/20 border border-amber-500/30"
            : "bg-gradient-to-br from-slate-800/50 to-slate-900/50 border border-slate-700/50 hover:border-slate-600/50"
        )}>
          {/* Message Header */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-3">
              <motion.div
                className={cn(
                  "w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br shadow-lg",
                  `from-${color}-500 to-${color}-600`
                )}
                whileHover={{ scale: 1.1 }}
                transition={{ type: "spring", stiffness: 400 }}
              >
                {isThought ? (
                  <Brain className="w-5 h-5 text-white" />
                ) : (
                  <User className="w-5 h-5 text-white" />
                )}
              </motion.div>
              
              <div>
                <div className="flex items-center space-x-2">
                  <span className="font-semibold text-white">
                    {message.sender}
                  </span>
                  {agent && (
                    <span className={`px-2 py-1 bg-${color}-500/20 text-${color}-300 text-xs rounded-full border border-${color}-500/30`}>
                      {agent.role}
                    </span>
                  )}
                  {isThought && (
                    <span className="px-2 py-1 bg-amber-500/20 text-amber-300 text-xs rounded-full border border-amber-500/30">
                      thinking
                    </span>
                  )}
                </div>
              </div>
            </div>
            
            <div className="flex items-center space-x-2 text-xs text-slate-400">
              <Clock className="w-3 h-3" />
              <span>{format(message.timestamp, 'HH:mm:ss')}</span>
            </div>
          </div>
          
          {/* Message Content */}
          <div className={cn(
            "text-sm leading-relaxed whitespace-pre-wrap",
            isThought 
              ? "text-amber-200/90 italic" 
              : "text-slate-200"
          )}>
            {content}
          </div>
        </div>
      </motion.div>
    );
  };

  const renderInitializationStatus = () => {
    const { hasAgents, hasParticipants, hasDiscussion, isConnected } = initializationStatus;
    
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="p-6 bg-gradient-to-br from-slate-800/50 to-slate-900/50 backdrop-blur-xl rounded-2xl border border-slate-700/50"
      >
        <div className="flex items-center space-x-3 mb-6">
          <motion.div
            className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg"
            animate={{ rotate: [0, 360] }}
            transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
          >
            <Users className="w-6 h-6 text-white" />
          </motion.div>
          <div>
            <h3 className="text-xl font-bold text-white">
              Discussion Matrix Status
            </h3>
            <p className="text-sm text-slate-400">
              System initialization and network diagnostics
            </p>
          </div>
        </div>
        
        <div className="grid grid-cols-2 gap-4 mb-6">
          {[
            { label: 'Available Agents', value: hasAgents ? `${Object.keys(agents).length} agents` : 'No agents', status: hasAgents, color: 'blue' },
            { label: 'Participants', value: hasParticipants ? `${participants.length} active` : 'No participants', status: hasParticipants, color: 'emerald' },
            { label: 'Discussion Session', value: hasDiscussion ? 'Active' : 'Not started', status: hasDiscussion, color: 'purple' },
            { label: 'Network Status', value: isConnected ? 'Connected' : 'Disconnected', status: isConnected, color: 'orange' }
          ].map((item, index) => (
            <motion.div
              key={item.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className={`p-4 bg-gradient-to-br from-${item.color}-900/30 to-${item.color}-800/30 rounded-xl border border-${item.color}-500/30`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-slate-400 mb-1">{item.label}</div>
                  <div className={`text-sm font-semibold ${item.status ? `text-${item.color}-300` : 'text-slate-400'}`}>
                    {item.value}
                  </div>
                </div>
                <motion.div
                  className={`w-3 h-3 rounded-full ${item.status ? `bg-${item.color}-400` : 'bg-slate-600'}`}
                  animate={item.status ? { scale: [1, 1.2, 1] } : {}}
                  transition={{ duration: 2, repeat: Infinity }}
                />
              </div>
            </motion.div>
          ))}
        </div>
        
        {/* Error Display */}
        <AnimatePresence>
          {(lastError || websocketError) && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="mb-4 p-4 bg-gradient-to-r from-red-900/30 to-red-800/30 border border-red-500/30 rounded-xl backdrop-blur-sm"
            >
              <div className="flex items-center space-x-2">
                <AlertCircle className="w-5 h-5 text-red-400" />
                <span className="text-sm font-medium text-red-300">
                  System Error Detected
                </span>
              </div>
              <p className="text-sm text-red-400 mt-2">
                {lastError || websocketError}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
        
        {/* Start Discussion Button */}
        {hasAgents && !isActive && !hasDiscussion && (
          <motion.button
            onClick={handleStartDiscussion}
            disabled={isStarting}
            className="w-full flex items-center justify-center space-x-3 px-6 py-4 bg-gradient-to-r from-blue-600 via-blue-700 to-cyan-600 hover:from-blue-700 hover:via-blue-800 hover:to-cyan-700 disabled:from-slate-600 disabled:to-slate-700 text-white rounded-xl font-semibold transition-all duration-300 shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 disabled:shadow-none relative overflow-hidden"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <motion.div
              className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0"
              animate={{ x: [-100, 100] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
            {isStarting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Initializing Neural Network...</span>
              </>
            ) : (
              <>
                <Play className="w-5 h-5" />
                <span>Initialize Discussion Matrix</span>
                <Zap className="w-4 h-4" />
              </>
            )}
          </motion.button>
        )}
      </motion.div>
    );
  };

  return (
    <div className={cn("space-y-6", className)}>
      {/* Portal Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-6 bg-gradient-to-br from-slate-800/50 to-slate-900/50 backdrop-blur-xl rounded-2xl border border-slate-700/50"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-4">
            <motion.div
              className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg"
              whileHover={{ scale: 1.1, rotate: 5 }}
              transition={{ type: "spring", stiffness: 400 }}
            >
              <MessageSquare className="w-6 h-6 text-white" />
            </motion.div>
            <div>
              <h2 className="text-2xl font-bold text-white">
                Discussion Log Portal
              </h2>
              <p className="text-sm text-slate-400">
                {isActive ? 'Live conversation stream' : 'Historical message archive'}
              </p>
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            {/* Connection Status */}
            <div className="flex items-center space-x-2">
              <motion.div
                className={cn(
                  "w-3 h-3 rounded-full",
                  isWebSocketConnected ? "bg-emerald-400" : "bg-red-400"
                )}
                animate={isWebSocketConnected ? { scale: [1, 1.2, 1] } : {}}
                transition={{ duration: 2, repeat: Infinity }}
              />
              <span className="text-xs text-slate-400">
                {isWebSocketConnected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
            
            {/* Expand Toggle */}
            <motion.button
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-2 bg-gradient-to-r from-slate-700 to-slate-800 hover:from-slate-600 hover:to-slate-700 text-slate-300 rounded-lg transition-all duration-300"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </motion.button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-4 gap-4 mb-4">
          {[
            { label: 'Total Messages', value: messages.length, color: 'blue', icon: MessageSquare },
            { label: 'Active Agents', value: Object.keys(agents).length, color: 'emerald', icon: Users },
            { label: 'Session Status', value: isActive ? 'LIVE' : 'IDLE', color: 'purple', icon: Activity, isText: true },
            { label: 'Network', value: isWebSocketConnected ? 'ONLINE' : 'OFFLINE', color: 'orange', icon: Network, isText: true }
          ].map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.1 }}
              className={`p-3 bg-gradient-to-br from-${stat.color}-900/30 to-${stat.color}-800/30 rounded-xl border border-${stat.color}-500/30`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className={`text-lg font-bold text-${stat.color}-300`}>
                    {stat.isText ? (
                      <span className={`text-sm font-semibold ${
                        (stat.label === 'Session Status' && isActive) || 
                        (stat.label === 'Network' && isWebSocketConnected) 
                          ? `text-${stat.color}-300` : 'text-slate-400'
                      }`}>
                        {stat.value}
                      </span>
                    ) : (
                      stat.value
                    )}
                  </div>
                  <div className="text-xs text-slate-400">{stat.label}</div>
                </div>
                <stat.icon className={`w-5 h-5 text-${stat.color}-400`} />
              </div>
            </motion.div>
          ))}
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search messages..."
                className="pl-10 pr-4 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-white placeholder-slate-400 focus:border-blue-500 focus:outline-none transition-colors"
              />
            </div>
            
            {/* Agent Filter */}
            <select
              value={filterAgent}
              onChange={(e) => setFilterAgent(e.target.value)}
              className="px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-white focus:border-blue-500 focus:outline-none transition-colors"
            >
              <option value="all">All Agents</option>
              {Object.values(agents).map(agent => (
                <option key={agent.name} value={agent.name}>{agent.name}</option>
              ))}
            </select>
          </div>
          
          <div className="flex items-center space-x-3">
            {/* Think Tokens Toggle */}
            <div className="flex items-center space-x-2">
              <span className="text-xs text-slate-400">Think Tokens</span>
              <motion.button
                onClick={() => onThinkTokensToggle?.(!showThinkTokens)}
                className={`w-10 h-5 rounded-full transition-colors ${
                  showThinkTokens ? 'bg-blue-600' : 'bg-slate-600'
                }`}
                whileTap={{ scale: 0.95 }}
              >
                <motion.div
                  className="w-4 h-4 bg-white rounded-full mt-0.5"
                  animate={{ x: showThinkTokens ? 20 : 2 }}
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                />
              </motion.button>
            </div>
            
            {/* Export Button */}
            <motion.button
              className="flex items-center space-x-2 px-3 py-2 bg-gradient-to-r from-slate-700 to-slate-800 hover:from-slate-600 hover:to-slate-700 text-slate-300 rounded-lg transition-all duration-300"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Download className="w-4 h-4" />
              <span className="text-xs">Export</span>
            </motion.button>
          </div>
        </div>
      </motion.div>

      {/* Show initialization status if no messages */}
      {messages.length === 0 && renderInitializationStatus()}

      {/* Messages */}
      {messages.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-br from-slate-800/50 to-slate-900/50 backdrop-blur-xl rounded-2xl border border-slate-700/50 overflow-hidden"
        >
          <div className="p-6">
            <motion.div
              className={cn(
                "space-y-4 overflow-y-auto transition-all duration-300",
                isExpanded ? "max-h-[80vh]" : "max-h-96"
              )}
              layout
            >
              <AnimatePresence>
                {messages.map((message, index) => renderMessage(message, index))}
              </AnimatePresence>
            </motion.div>
          </div>
        </motion.div>
      )}
    </div>
  );
};