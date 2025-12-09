import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { UnifiedChatSystem } from './futuristic/portals/UnifiedChatSystem';
import { ChatHistoryManager } from './ChatHistoryManager';
import { chatPersistenceService, ChatSession } from '../services/ChatPersistenceService';
import { useAgents } from '../contexts/AgentContext';
import {
  MessageSquare,
  Plus,
  History,
  Bot,
  X,
  Maximize2,
  Minimize2,
  MoreVertical,
  Archive,
  Trash2,
  Download,
  Settings,
  User,
  Clock,
  Activity,
} from 'lucide-react';

interface EnhancedChatManagerProps {
  className?: string;
  mode?: 'floating' | 'portal' | 'hybrid';
}

interface ChatAction {
  type: 'new' | 'history' | 'resume';
  agentId: string;
  agentName: string;
  sessionId?: string;
}

export const EnhancedChatManager: React.FC<EnhancedChatManagerProps> = ({
  className,
  mode = 'hybrid',
}) => {
  const { agents } = useAgents();
  const [showHistoryManager, setShowHistoryManager] = useState(false);
  const [showAgentSelector, setShowAgentSelector] = useState(false);
  const [pendingAction, setPendingAction] = useState<ChatAction | null>(null);
  const [recentSessions, setRecentSessions] = useState<ChatSession[]>([]);
  const [currentChatMode, setCurrentChatMode] = useState<'floating' | 'portal'>(
    mode === 'portal' ? 'portal' : 'floating'
  );

  // Load recent chat sessions
  const loadRecentSessions = useCallback(async () => {
    try {
      const sessions = chatPersistenceService.getAllChatSessions();
      // Get the 5 most recent sessions
      const recent = sessions
        .sort((a, b) => b.lastActivity.getTime() - a.lastActivity.getTime())
        .slice(0, 5);
      setRecentSessions(recent);
    } catch (error) {
      console.error('Failed to load recent sessions:', error);
    }
  }, []);

  useEffect(() => {
    loadRecentSessions();

    // Listen for storage changes to update recent sessions
    const handleStorageChange = () => {
      loadRecentSessions();
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [loadRecentSessions]);

  // Handle new chat creation
  const handleNewChat = useCallback((agentId: string, agentName: string) => {
    // Create a new chat event that forces a new session
    const chatEvent = new CustomEvent('openNewAgentChat', {
      detail: {
        agentId,
        agentName,
        forceNew: true,
      },
    });
    window.dispatchEvent(chatEvent);
    setShowAgentSelector(false);
  }, []);

  // Handle existing chat resumption
  const handleResumeChat = useCallback((agentId: string, agentName: string, sessionId?: string) => {
    // Open existing chat session
    const chatEvent = new CustomEvent('openAgentChat', {
      detail: {
        agentId,
        agentName,
        sessionId,
      },
    });
    window.dispatchEvent(chatEvent);
    setShowHistoryManager(false);
  }, []);

  // Quick action handlers
  const handleQuickNewChat = useCallback(
    (agentId: string, agentName: string) => {
      handleNewChat(agentId, agentName);
    },
    [handleNewChat]
  );

  const handleQuickResumeChat = useCallback(
    (session: ChatSession) => {
      handleResumeChat(session.agentId, session.agentName, session.id);
    },
    [handleResumeChat]
  );

  const renderAgentSelector = () => (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && setShowAgentSelector(false)}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="w-full max-w-2xl max-h-[80vh] bg-gradient-to-br from-slate-900/95 via-slate-800/90 to-slate-900/95 backdrop-blur-xl rounded-2xl border border-slate-700/30 overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-700/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl flex items-center justify-center">
              <Plus className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">Start New Chat</h3>
              <p className="text-sm text-slate-400">
                Choose an agent to begin a fresh conversation
              </p>
            </div>
          </div>

          <button
            onClick={() => setShowAgentSelector(false)}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-700/50 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Agent List */}
        <div className="p-6 max-h-96 overflow-y-auto">
          <div className="grid grid-cols-1 gap-3">
            {Object.values(agents).map((agent) => (
              <motion.button
                key={agent.id}
                onClick={() => handleQuickNewChat(agent.id, agent.name)}
                className="flex items-center gap-4 p-4 bg-slate-800/50 hover:bg-slate-700/50 border border-slate-700/50 hover:border-slate-600/50 rounded-lg transition-all duration-200 text-left group"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-500 rounded-xl flex items-center justify-center">
                  <Bot className="w-6 h-6 text-white" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-semibold text-white group-hover:text-blue-300 transition-colors">
                      {agent.name}
                    </h4>
                    <span className="text-xs px-2 py-1 bg-blue-500/20 text-blue-300 rounded-full">
                      {agent.role}
                    </span>
                  </div>
                  <p className="text-sm text-slate-400 truncate">
                    {agent.description || 'Ready to assist you'}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <div
                    className={`w-2 h-2 rounded-full ${agent.isActive ? 'bg-green-400' : 'bg-gray-400'}`}
                  />
                  <span
                    className={`text-xs ${agent.isActive ? 'text-green-400' : 'text-gray-400'}`}
                  >
                    {agent.isActive ? 'Online' : 'Offline'}
                  </span>
                </div>
              </motion.button>
            ))}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );

  const renderQuickActions = () => (
    <div className="fixed bottom-6 right-6 z-40 flex flex-col gap-3">
      {/* Recent Sessions Quick Access */}
      {recentSessions.length > 0 && (
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="bg-slate-800/90 backdrop-blur-xl border border-slate-700/50 rounded-xl p-4 shadow-2xl"
        >
          <div className="flex items-center gap-2 mb-3 text-sm font-medium text-slate-300">
            <Clock className="w-4 h-4" />
            Recent Chats
          </div>

          <div className="space-y-2">
            {recentSessions.slice(0, 3).map((session) => (
              <button
                key={session.id}
                onClick={() => handleQuickResumeChat(session)}
                className="flex items-center gap-3 w-full p-2 bg-slate-700/50 hover:bg-slate-600/50 rounded-lg transition-colors text-left group"
              >
                <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-blue-500 rounded-lg flex items-center justify-center">
                  <Bot className="w-4 h-4 text-white" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-white group-hover:text-blue-300 transition-colors truncate">
                    {session.agentName}
                  </div>
                  <div className="text-xs text-slate-400">{session.messageCount} messages</div>
                </div>
              </button>
            ))}
          </div>
        </motion.div>
      )}

      {/* Main Action Buttons */}
      <div className="flex flex-col gap-3">
        <motion.button
          onClick={() => setShowAgentSelector(true)}
          className="w-14 h-14 bg-gradient-to-br from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 rounded-full flex items-center justify-center shadow-2xl hover:shadow-green-500/25 transition-all duration-300 group"
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          title="Start New Chat"
        >
          <Plus className="w-6 h-6 text-white group-hover:scale-110 transition-transform" />
        </motion.button>

        <motion.button
          onClick={() => setShowHistoryManager(true)}
          className="w-14 h-14 bg-gradient-to-br from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 rounded-full flex items-center justify-center shadow-2xl hover:shadow-purple-500/25 transition-all duration-300 group"
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          title="Chat History"
        >
          <History className="w-6 h-6 text-white group-hover:scale-110 transition-transform" />
        </motion.button>

        <motion.button
          onClick={() => setCurrentChatMode(currentChatMode === 'portal' ? 'floating' : 'portal')}
          className="w-14 h-14 bg-gradient-to-br from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-cyan-700 rounded-full flex items-center justify-center shadow-2xl hover:shadow-blue-500/25 transition-all duration-300 group"
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          title={`Switch to ${currentChatMode === 'portal' ? 'Floating' : 'Portal'} Mode`}
        >
          {currentChatMode === 'portal' ? (
            <Minimize2 className="w-6 h-6 text-white group-hover:scale-110 transition-transform" />
          ) : (
            <Maximize2 className="w-6 h-6 text-white group-hover:scale-110 transition-transform" />
          )}
        </motion.button>
      </div>
    </div>
  );

  return (
    <>
      {/* Main Chat System */}
      <UnifiedChatSystem mode={currentChatMode} className={className} />

      {/* Quick Action Buttons */}
      {renderQuickActions()}

      {/* Modals */}
      <AnimatePresence>
        {showAgentSelector && renderAgentSelector()}

        {showHistoryManager && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="w-full max-w-6xl h-[90vh]"
            >
              <ChatHistoryManager
                onOpenChat={handleResumeChat}
                onClose={() => setShowHistoryManager(false)}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
