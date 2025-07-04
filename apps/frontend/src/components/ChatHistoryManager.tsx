import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { chatPersistenceService, ChatSession } from '../services/ChatPersistenceService';
import {
  History,
  MessageSquare,
  User,
  Clock,
  Search,
  Filter,
  Download,
  Trash2,
  ChevronDown,
  ChevronRight,
  Calendar,
  Bot
} from 'lucide-react';

interface ChatHistoryManagerProps {
  onOpenChat?: (agentId: string, agentName: string, sessionId?: string) => void;
  onClose?: () => void;
}

interface GroupedSessions {
  [key: string]: ChatSession[];
}

export const ChatHistoryManager: React.FC<ChatHistoryManagerProps> = ({
  onOpenChat,
  onClose
}) => {
  const { isAuthenticated } = useAuth();
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAgent, setSelectedAgent] = useState<string>('all');
  const [showPersistentOnly, setShowPersistentOnly] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['Today', 'Yesterday']));

  useEffect(() => {
    if (isAuthenticated) {
      loadChatHistory();
    }
  }, [isAuthenticated]);

  const loadChatHistory = async () => {
    try {
      setLoading(true);
      const allSessions = await chatPersistenceService.getAllSessions();
      setSessions(allSessions);
    } catch (error) {
      console.error('Failed to load chat history:', error);
    } finally {
      setLoading(false);
    }
  };

  const deleteSession = async (sessionId: string) => {
    try {
      await chatPersistenceService.deleteSession(sessionId);
      setSessions(prev => prev.filter(s => s.id !== sessionId));
    } catch (error) {
      console.error('Failed to delete session:', error);
    }
  };

  const exportSession = async (session: ChatSession) => {
    try {
      const messages = await chatPersistenceService.getMessages(session.id);
      const exportData = {
        session,
        messages: messages.map(msg => ({
          content: msg.content,
          sender: msg.sender,
          senderName: msg.senderName,
          timestamp: msg.timestamp
        }))
      };
      
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `chat-${session.agentName}-${session.createdAt.split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to export session:', error);
    }
  };

  const getTimeGroup = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays <= 7) return 'This Week';
    if (diffDays <= 30) return 'This Month';
    return 'Older';
  };

  const filteredSessions = sessions.filter(session => {
    const matchesSearch = session.agentName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesAgent = selectedAgent === 'all' || session.agentId === selectedAgent;
    const matchesPersistent = !showPersistentOnly || session.isPersistent;
    return matchesSearch && matchesAgent && matchesPersistent;
  });

  const groupedSessions: GroupedSessions = filteredSessions.reduce((groups, session) => {
    const group = getTimeGroup(session.lastActivity || session.createdAt);
    if (!groups[group]) groups[group] = [];
    groups[group].push(session);
    return groups;
  }, {} as GroupedSessions);

  // Sort groups by time relevance
  const sortedGroups = Object.entries(groupedSessions).sort(([a], [b]) => {
    const order = ['Today', 'Yesterday', 'This Week', 'This Month', 'Older'];
    return order.indexOf(a) - order.indexOf(b);
  });

  const uniqueAgents = Array.from(new Set(sessions.map(s => ({ id: s.agentId, name: s.agentName }))))
    .sort((a, b) => a.name.localeCompare(b.name));

  const toggleGroup = (groupName: string) => {
    setExpandedGroups(prev => {
      const newSet = new Set(prev);
      if (newSet.has(groupName)) {
        newSet.delete(groupName);
      } else {
        newSet.add(groupName);
      }
      return newSet;
    });
  };

  const formatRelativeTime = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
    
    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString();
  };

  if (!isAuthenticated) {
    return (
      <div className="p-6 text-center">
        <Bot className="h-12 w-12 mx-auto mb-4 text-gray-400" />
        <p className="text-gray-500">Please sign in to view chat history</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="p-6 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <History className="h-6 w-6 text-blue-500" />
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Chat History</h2>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              ✕
            </button>
          )}
        </div>

        {/* Search and Filters */}
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search conversations..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>

          <div className="flex gap-3">
            <select
              value={selectedAgent}
              onChange={(e) => setSelectedAgent(e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="all">All Agents</option>
              {uniqueAgents.map(agent => (
                <option key={agent.id} value={agent.id}>{agent.name}</option>
              ))}
            </select>

            <label className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg">
              <input
                type="checkbox"
                checked={showPersistentOnly}
                onChange={(e) => setShowPersistentOnly(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">Saved only</span>
            </label>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
          </div>
        ) : sortedGroups.length === 0 ? (
          <div className="text-center py-12">
            <MessageSquare className="h-12 w-12 mx-auto mb-4 text-gray-400" />
            <p className="text-gray-500">No chat history found</p>
          </div>
        ) : (
          <div className="space-y-4">
            {sortedGroups.map(([groupName, groupSessions]) => (
              <div key={groupName} className="space-y-2">
                <button
                  onClick={() => toggleGroup(groupName)}
                  className="flex items-center gap-2 w-full text-left p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                >
                  {expandedGroups.has(groupName) ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                  <span className="font-medium text-gray-900 dark:text-white">{groupName}</span>
                  <span className="text-sm text-gray-500">({groupSessions.length})</span>
                </button>

                <AnimatePresence>
                  {expandedGroups.has(groupName) && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="space-y-2 ml-6"
                    >
                      {groupSessions
                        .sort((a, b) => new Date(b.lastActivity || b.createdAt).getTime() - new Date(a.lastActivity || a.createdAt).getTime())
                        .map(session => (
                          <div
                            key={session.id}
                            className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors"
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-2">
                                  <Bot className="h-4 w-4 text-blue-500" />
                                  <span className="font-medium text-gray-900 dark:text-white">
                                    {session.agentName}
                                  </span>
                                  {session.isPersistent && (
                                    <span className="px-2 py-1 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 text-xs rounded-full">
                                      Saved
                                    </span>
                                  )}
                                </div>
                                
                                <div className="flex items-center gap-4 text-sm text-gray-500">
                                  <div className="flex items-center gap-1">
                                    <MessageSquare className="h-3 w-3" />
                                    <span>{session.messageCount} messages</span>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    <span>{formatRelativeTime(session.lastActivity || session.createdAt)}</span>
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => onOpenChat?.(session.agentId, session.agentName, session.id)}
                                  className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/50 rounded-lg transition-colors"
                                  title="Resume Chat"
                                >
                                  <MessageSquare className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={() => exportSession(session)}
                                  className="p-2 text-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors"
                                  title="Export Chat"
                                >
                                  <Download className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={() => deleteSession(session.id)}
                                  className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/50 rounded-lg transition-colors"
                                  title="Delete Chat"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatHistoryManager;