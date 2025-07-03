import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAgents } from '../../../contexts/AgentContext';
import { uaipAPI } from '../../../utils/uaip-api';
import { DiscussionTrigger } from '../../DiscussionTrigger';
import { useWebSocket } from '../../../hooks/useUAIP';
import { 
  MessageSquare, 
  Send, 
  Bot, 
  User, 
  Loader2, 
  X,
  Minimize2,
  Maximize2,
  Plus,
  Brain,
  Zap,
  Database,
  Sparkles,
  Users,
  Activity,
  CheckCircle2,
  AlertCircle,
  LayoutGrid,
  Maximize,
  Settings
} from 'lucide-react';
import { Discussion, CreateDiscussionRequest, DiscussionMessage, MessageType } from '@uaip/types';

interface ChatMessage {
  id: string;
  content: string;
  sender: 'user' | 'agent';
  senderName: string;
  timestamp: string;
  agentId?: string;
  messageType?: MessageType;
  confidence?: number;
  memoryEnhanced?: boolean;
  knowledgeUsed?: number;
  toolsExecuted?: Array<{
    toolId: string;
    toolName: string;
    success: boolean;
    result?: any;
    error?: string;
    timestamp: string;
  }>;
  metadata?: Record<string, any>;
}

interface ChatWindow {
  id: string;
  agentId: string;
  agentName: string;
  discussionId?: string;
  messages: ChatMessage[];
  isMinimized: boolean;
  isLoading: boolean;
  error: string | null;
  hasLoadedHistory: boolean;
  totalMessages: number;
  canLoadMore: boolean;
  mode: 'floating' | 'portal';
}

interface UnifiedChatSystemProps {
  className?: string;
  mode?: 'floating' | 'portal' | 'hybrid';
  defaultAgentId?: string;
}

export const UnifiedChatSystem: React.FC<UnifiedChatSystemProps> = ({ 
  className, 
  mode = 'hybrid',
  defaultAgentId 
}) => {
  const { agents } = useAgents();
  const { isConnected: isWebSocketConnected, sendMessage: sendWebSocketMessage, lastEvent } = useWebSocket();
  
  // State management
  const [chatWindows, setChatWindows] = useState<ChatWindow[]>([]);
  const [currentMessage, setCurrentMessage] = useState<{ [windowId: string]: string }>({});
  const [viewMode, setViewMode] = useState<'floating' | 'portal'>(mode === 'portal' ? 'portal' : 'floating');
  const [selectedAgentId, setSelectedAgentId] = useState<string>(defaultAgentId || '');
  const [portalMessages, setPortalMessages] = useState<ChatMessage[]>([]);
  const [conversationHistory, setConversationHistory] = useState<Array<{content: string; sender: string; timestamp: string}>>([]);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const agentList = Object.values(agents);
  const selectedAgent = agentList.find(agent => agent.id === selectedAgentId);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [portalMessages]);

  // Listen for agent chat open events
  useEffect(() => {
    const handleOpenAgentChat = (event: CustomEvent) => {
      const { agentId, agentName } = event.detail;
      openChatWindow(agentId, agentName);
    };

    window.addEventListener('openAgentChat', handleOpenAgentChat as EventListener);
    return () => {
      window.removeEventListener('openAgentChat', handleOpenAgentChat as EventListener);
    };
  }, []);

  // Listen for WebSocket agent responses
  useEffect(() => {
    if (lastEvent && lastEvent.type === 'agent_response') {
      const { agentId, response, agentName, confidence, memoryEnhanced, knowledgeUsed, toolsExecuted } = lastEvent.payload;
      
      const agentMessage: ChatMessage = {
        id: `msg-${Date.now()}-agent`,
        content: response,
        sender: 'agent',
        senderName: agentName,
        timestamp: new Date().toISOString(),
        agentId: agentId,
        messageType: MessageType.MESSAGE,
        confidence,
        memoryEnhanced,
        knowledgeUsed,
        toolsExecuted,
        metadata: {
          confidence,
          memoryEnhanced,
          knowledgeUsed,
          toolsExecuted
        }
      };

      // Update floating windows
      const targetWindow = chatWindows.find(w => w.agentId === agentId);
      if (targetWindow) {
        setChatWindows(prev => 
          prev.map(w => w.id === targetWindow.id ? { 
            ...w, 
            messages: [...w.messages, agentMessage],
            isLoading: false,
            error: null
          } : w)
        );
      }

      // Update portal mode if current agent
      if (viewMode === 'portal' && agentId === selectedAgentId) {
        setPortalMessages(prev => [...prev, agentMessage]);
        setConversationHistory(prev => [...prev, { content: response, sender: agentName, timestamp: new Date().toISOString() }]);
      }
    }
  }, [lastEvent, chatWindows, viewMode, selectedAgentId]);

  // Auto-select first agent for portal mode
  useEffect(() => {
    if (viewMode === 'portal' && !selectedAgentId && agentList.length > 0) {
      setSelectedAgentId(agentList[0].id);
    }
  }, [agentList, selectedAgentId, viewMode]);

  // Clear portal conversation when agent changes
  useEffect(() => {
    if (viewMode === 'portal' && selectedAgentId) {
      setPortalMessages([]);
      setConversationHistory([]);
    }
  }, [selectedAgentId, viewMode]);

  const openChatWindow = useCallback(async (agentId: string, agentName: string) => {
    // Check if chat window already exists
    const existingWindow = chatWindows.find(w => w.agentId === agentId);
    if (existingWindow) {
      setChatWindows(prev => 
        prev.map(w => w.id === existingWindow.id ? { ...w, isMinimized: false } : w)
      );
      return;
    }

    // Create new floating chat window
    const newWindow: ChatWindow = {
      id: `chat-${Date.now()}-${agentId}`,
      agentId,
      agentName,
      messages: [],
      isMinimized: false,
      isLoading: false,
      error: null,
      hasLoadedHistory: true,
      totalMessages: 0,
      canLoadMore: false,
      mode: 'floating'
    };

    setChatWindows(prev => [...prev, newWindow]);
    setCurrentMessage(prev => ({ ...prev, [newWindow.id]: '' }));
    
    console.log('Opened chat with agent:', agentName);
  }, [chatWindows]);

  const closeChatWindow = useCallback((windowId: string) => {
    setChatWindows(prev => prev.filter(w => w.id !== windowId));
    setCurrentMessage(prev => {
      const newMessages = { ...prev };
      delete newMessages[windowId];
      return newMessages;
    });
  }, []);

  const minimizeChatWindow = useCallback((windowId: string) => {
    setChatWindows(prev => 
      prev.map(w => w.id === windowId ? { ...w, isMinimized: !w.isMinimized } : w)
    );
  }, []);

  const sendFloatingMessage = useCallback(async (windowId: string) => {
    const window = chatWindows.find(w => w.id === windowId);
    const messageText = currentMessage[windowId]?.trim();
    
    if (!window || !messageText || window.isLoading) return;

    if (!isWebSocketConnected) {
      setChatWindows(prev => 
        prev.map(w => w.id === windowId ? { 
          ...w, 
          error: 'WebSocket not connected. Please wait for connection.'
        } : w)
      );
      return;
    }

    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      content: messageText,
      sender: 'user',
      senderName: 'You',
      timestamp: new Date().toISOString(),
      messageType: MessageType.MESSAGE,
      metadata: { agentId: window.agentId }
    };

    setChatWindows(prev => 
      prev.map(w => w.id === windowId ? { 
        ...w, 
        messages: [...w.messages, userMessage],
        isLoading: true,
        error: null
      } : w)
    );
    
    setCurrentMessage(prev => ({ ...prev, [windowId]: '' }));

    try {
      const chatMessage = {
        type: 'agent_chat',
        payload: {
          agentId: window.agentId,
          message: messageText,
          conversationHistory: window.messages.slice(-10).map(m => ({
            content: m.content,
            sender: m.sender === 'user' ? 'user' : m.senderName,
            timestamp: m.timestamp
          })),
          context: {},
          messageId: `msg-${Date.now()}`,
          timestamp: new Date().toISOString()
        }
      };

      sendWebSocketMessage(chatMessage);
    } catch (error) {
      console.error('WebSocket chat error:', error);
      setChatWindows(prev => 
        prev.map(w => w.id === windowId ? { 
          ...w, 
          isLoading: false,
          error: 'Failed to send message'
        } : w)
      );
    }
  }, [chatWindows, currentMessage, isWebSocketConnected, sendWebSocketMessage]);

  const sendPortalMessage = useCallback(async () => {
    const messageText = currentMessage['portal']?.trim();
    if (!messageText || !selectedAgentId) return;

    if (!isWebSocketConnected) return;

    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      content: messageText,
      sender: 'user',
      senderName: 'You',
      timestamp: new Date().toISOString(),
      messageType: MessageType.MESSAGE
    };

    setPortalMessages(prev => [...prev, userMessage]);
    setCurrentMessage(prev => ({ ...prev, portal: '' }));
    setConversationHistory(prev => [...prev, { content: messageText, sender: 'user', timestamp: new Date().toISOString() }]);

    try {
      const chatMessage = {
        type: 'agent_chat',
        payload: {
          agentId: selectedAgentId,
          message: messageText,
          conversationHistory: conversationHistory.slice(-10),
          context: {},
          messageId: `msg-${Date.now()}`,
          timestamp: new Date().toISOString()
        }
      };

      sendWebSocketMessage(chatMessage);
    } catch (error) {
      console.error('Portal chat error:', error);
    }
  }, [currentMessage, selectedAgentId, conversationHistory, isWebSocketConnected, sendWebSocketMessage]);

  const handleKeyPress = useCallback((e: React.KeyboardEvent, windowId: string) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (windowId === 'portal') {
        sendPortalMessage();
      } else {
        sendFloatingMessage(windowId);
      }
    }
  }, [sendPortalMessage, sendFloatingMessage]);

  const clearPortalConversation = useCallback(() => {
    setPortalMessages([]);
    setConversationHistory([]);
  }, []);

  // Auto-scroll for floating windows
  const scrollToBottom = useCallback((windowId: string) => {
    const messagesContainer = document.getElementById(`messages-${windowId}`);
    if (messagesContainer) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  }, []);

  useEffect(() => {
    chatWindows.forEach(window => {
      if (!window.isMinimized) {
        scrollToBottom(window.id);
      }
    });
  }, [chatWindows, scrollToBottom]);

  const sortedChatWindows = useMemo(() => {
    return chatWindows.sort((a, b) => {
      if (a.isMinimized && !b.isMinimized) return 1;
      if (!a.isMinimized && b.isMinimized) return -1;
      return b.id.localeCompare(a.id);
    });
  }, [chatWindows]);

  // Render floating windows
  const renderFloatingWindows = () => (
    <div className="fixed bottom-0 right-0 z-50 flex items-end gap-3 p-4">
      <AnimatePresence>
        {sortedChatWindows.map((window, index) => (
          <motion.div
            key={window.id}
            initial={{ opacity: 0, y: 100, scale: 0.8, rotateX: -15 }}
            animate={{ 
              opacity: 1, 
              y: 0, 
              scale: 1,
              rotateX: 0,
              height: window.isMinimized ? 'auto' : '500px'
            }}
            exit={{ opacity: 0, y: 100, scale: 0.8, rotateX: -15 }}
            whileHover={{ 
              scale: 1.02, 
              y: -4,
              transition: { duration: 0.2 }
            }}
            transition={{ 
              duration: 0.4, 
              type: "spring", 
              stiffness: 200, 
              damping: 20 
            }}
            className={`
              relative overflow-hidden rounded-xl shadow-2xl backdrop-blur-xl
              bg-gradient-to-br from-slate-900/90 via-blue-900/40 to-purple-900/30
              border border-blue-500/30 hover:border-cyan-400/50
              ${window.isMinimized ? 'w-80' : 'w-80 h-96'}
              before:absolute before:inset-0 before:bg-gradient-to-r 
              before:from-cyan-500/10 before:via-transparent before:to-purple-500/10
              before:opacity-0 hover:before:opacity-100 before:transition-opacity before:duration-500
            `}
            style={{ 
              marginRight: `${index * 20}px`,
              filter: 'drop-shadow(0 25px 25px rgba(0, 0, 0, 0.15)) drop-shadow(0 0 20px rgba(59, 130, 246, 0.2))'
            }}
          >
            {/* Chat Header */}
            <motion.div 
              className="relative flex items-center justify-between p-4 border-b border-cyan-500/20 bg-gradient-to-r from-slate-800/80 to-blue-900/40 backdrop-blur-sm"
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <div className="flex items-center gap-3">
                <motion.div 
                  className="relative w-10 h-10 rounded-xl overflow-hidden flex items-center justify-center"
                  whileHover={{ scale: 1.1, rotate: 5 }}
                  transition={{ type: "spring", stiffness: 300 }}
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-cyan-400 via-blue-500 to-purple-600 animate-gradient-shift" />
                  <div className="absolute inset-0.5 bg-slate-900 rounded-lg" />
                  <Bot className="w-5 h-5 text-cyan-400 relative z-10" />
                  {window.isLoading && (
                    <motion.div
                      className="absolute inset-0 border-2 border-cyan-400/30 rounded-xl"
                      animate={{ rotate: 360 }}
                      transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                    />
                  )}
                </motion.div>
                <div>
                  <div className="font-semibold text-white text-sm tracking-wide">{window.agentName}</div>
                  <div className="flex items-center gap-2 text-xs">
                    <motion.div
                      className={`w-2 h-2 rounded-full ${
                        window.isLoading ? 'bg-yellow-400' : 'bg-emerald-400'
                      }`}
                      animate={{ 
                        scale: window.isLoading ? [1, 1.2, 1] : 1,
                        opacity: window.isLoading ? [1, 0.6, 1] : 1
                      }}
                      transition={{ 
                        duration: 1.5, 
                        repeat: window.isLoading ? Infinity : 0 
                      }}
                    />
                    <span className={window.isLoading ? 'text-yellow-300' : 'text-emerald-300'}>
                      {window.isLoading ? 'Thinking...' : 'Online'}
                    </span>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <button
                  onClick={() => minimizeChatWindow(window.id)}
                  className="relative w-8 h-8 rounded-lg overflow-hidden flex items-center justify-center group hover:scale-110 active:scale-95 transition-transform"
                >
                  <div className="absolute inset-0 bg-slate-700/30 group-hover:bg-cyan-500/30 transition-colors" />
                  <div className="absolute inset-0 border border-slate-500/30 group-hover:border-cyan-400/50 rounded-lg transition-colors" />
                  {window.isMinimized ? 
                    <Maximize2 className="w-4 h-4 text-slate-300 group-hover:text-cyan-300 transition-colors relative z-10" /> : 
                    <Minimize2 className="w-4 h-4 text-slate-300 group-hover:text-cyan-300 transition-colors relative z-10" />
                  }
                </button>
                <button
                  onClick={() => closeChatWindow(window.id)}
                  className="relative w-8 h-8 rounded-lg overflow-hidden flex items-center justify-center group hover:scale-110 active:scale-95 transition-transform"
                >
                  <div className="absolute inset-0 bg-red-500/20 group-hover:bg-red-500/40 transition-colors" />
                  <div className="absolute inset-0 border border-red-400/30 group-hover:border-red-400/60 rounded-lg transition-colors" />
                  <X className="w-4 h-4 text-red-400 group-hover:text-red-300 transition-colors relative z-10" />
                </button>
              </div>
            </motion.div>

            {!window.isMinimized && (
              <>
                {/* Messages */}
                <motion.div 
                  id={`messages-${window.id}`}
                  className="flex-1 overflow-y-auto p-4 space-y-4 max-h-80 scroll-smooth"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  style={{
                    scrollbarWidth: 'thin',
                    scrollbarColor: 'rgba(59, 130, 246, 0.3) transparent'
                  }}
                >
                  {window.messages.map((message, msgIndex) => (
                    <motion.div
                      key={message.id}
                      className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                      initial={{ opacity: 0, y: 20, scale: 0.9 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ 
                        delay: msgIndex * 0.05,
                        type: "spring",
                        stiffness: 200
                      }}
                    >
                      <motion.div
                        className={`relative max-w-xs rounded-xl text-sm overflow-hidden ${
                          message.sender === 'user' ? 'ml-4' : 'mr-4'
                        }`}
                        whileHover={{ scale: 1.02, y: -1 }}
                        transition={{ type: "spring", stiffness: 300 }}
                      >
                        {/* Message background with gradient border */}
                        <div className={`absolute inset-0 rounded-xl ${
                          message.sender === 'user'
                            ? 'bg-gradient-to-r from-blue-500 to-cyan-500'
                            : 'bg-gradient-to-r from-slate-600 to-blue-600'
                        }`} />
                        <div className={`absolute inset-0.5 rounded-lg ${
                          message.sender === 'user'
                            ? 'bg-gradient-to-r from-blue-600 to-cyan-600'
                            : 'bg-gradient-to-r from-slate-800 to-slate-700'
                        }`} />
                        
                        <div className="relative z-10 p-3">
                          <div className={`whitespace-pre-wrap ${
                            message.sender === 'user' ? 'text-white' : 'text-slate-100'
                          }`}>
                            {message.content}
                          </div>
                          
                          <div className={`text-xs mt-2 flex items-center justify-between ${
                            message.sender === 'user' ? 'text-blue-100' : 'text-slate-300'
                          }`}>
                            <span className="opacity-80">
                              {new Date(message.timestamp).toLocaleTimeString()}
                            </span>
                            {message.metadata && (
                              <div className="flex items-center gap-2 ml-2">
                                {message.confidence && (
                                  <motion.span 
                                    className="opacity-70 flex items-center gap-1"
                                    whileHover={{ scale: 1.1 }}
                                    title="Confidence Score"
                                  >
                                    <Zap className="w-3 h-3" />
                                    {Math.round(message.confidence * 100)}%
                                  </motion.span>
                                )}
                                {message.memoryEnhanced && (
                                  <motion.span 
                                    className="opacity-70" 
                                    title="Memory Enhanced"
                                    whileHover={{ scale: 1.2, rotate: 5 }}
                                  >
                                    <Brain className="w-3 h-3 text-purple-400" />
                                  </motion.span>
                                )}
                                {message.knowledgeUsed && message.knowledgeUsed > 0 && (
                                  <motion.span 
                                    className="opacity-70" 
                                    title="Knowledge Used"
                                    whileHover={{ scale: 1.2, rotate: -5 }}
                                  >
                                    <Database className="w-3 h-3 text-emerald-400" />
                                  </motion.span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    </motion.div>
                  ))}
                  
                  {window.isLoading && (
                    <motion.div 
                      className="flex justify-start"
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ type: "spring", stiffness: 200 }}
                    >
                      <div className="relative mr-4 rounded-xl overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-r from-slate-600 to-purple-600 animate-gradient-shift" />
                        <div className="absolute inset-0.5 bg-slate-800 rounded-lg" />
                        <div className="relative z-10 px-4 py-3 flex items-center gap-3">
                          <motion.div
                            animate={{ rotate: 360 }}
                            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                          >
                            <Loader2 className="w-4 h-4 text-purple-400" />
                          </motion.div>
                          <span className="text-slate-200 text-sm">Thinking...</span>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {window.error && (
                    <motion.div 
                      className="flex justify-center"
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ type: "spring", stiffness: 200 }}
                    >
                      <div className="relative max-w-xs rounded-xl overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-r from-red-600 to-orange-600" />
                        <div className="absolute inset-0.5 bg-red-900/40 backdrop-blur-sm rounded-lg" />
                        <div className="relative z-10 px-4 py-3">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-red-400">⚠️</span>
                            <span className="text-red-200 text-sm">{window.error}</span>
                          </div>
                          <button
                            onClick={() => setChatWindows(prev => 
                              prev.map(w => w.id === window.id ? { ...w, error: null } : w)
                            )}
                            className="text-xs text-red-300 hover:text-red-200 underline hover:no-underline transition-colors hover:scale-105 active:scale-95"
                          >
                            Dismiss
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </motion.div>

                {/* Input */}
                <motion.div 
                  className="p-4 border-t border-cyan-500/20 bg-gradient-to-r from-slate-800/60 to-blue-900/30 backdrop-blur-sm"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                >
                  <div className="flex gap-3">
                    <div className="flex-1 relative">
                      <input
                        type="text"
                        value={currentMessage[window.id] || ''}
                        onChange={(e) => setCurrentMessage(prev => ({ ...prev, [window.id]: e.target.value }))}
                        onKeyDown={(e) => handleKeyPress(e, window.id)}
                        placeholder="Type a message..."
                        className="w-full px-4 py-3 bg-slate-800/50 border border-slate-600/30 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-400/50 text-sm backdrop-blur-sm transition-all duration-300 hover:scale-[1.01] focus:scale-[1.02]"
                        disabled={window.isLoading}
                        style={{
                          background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.6), rgba(30, 58, 138, 0.3))'
                        }}
                      />
                    </div>
                    <button
                      onClick={() => sendFloatingMessage(window.id)}
                      disabled={!currentMessage[window.id]?.trim() || window.isLoading}
                      className="relative px-4 py-3 rounded-xl overflow-hidden flex items-center justify-center group disabled:cursor-not-allowed hover:scale-105 active:scale-95 transition-transform duration-200"
                    >
                      <div className={`absolute inset-0 transition-all duration-300 ${
                        !currentMessage[window.id]?.trim() || window.isLoading
                          ? 'bg-slate-700/50'
                          : 'bg-gradient-to-r from-cyan-500 to-blue-600 group-hover:from-cyan-400 group-hover:to-blue-500'
                      }`} />
                      <div className="absolute inset-0.5 bg-slate-900 rounded-lg" />
                      {window.isLoading ? (
                        <motion.div
                          className="relative z-10"
                          animate={{ rotate: 360 }}
                          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                        >
                          <Loader2 className="w-5 h-5 text-cyan-400" />
                        </motion.div>
                      ) : (
                        <Send className="w-5 h-5 text-white relative z-10 group-hover:text-cyan-100 transition-colors" />
                      )}
                    </button>
                  </div>
                  
                  {/* Connection Status */}
                  <div className="flex items-center justify-between mt-3 text-xs">
                    <div className="flex items-center gap-3">
                      <motion.span 
                        className="flex items-center gap-2 px-2 py-1 rounded-lg bg-slate-800/50 border border-slate-600/30"
                        whileHover={{ scale: 1.05 }}
                      >
                        <motion.div
                          className={`w-2 h-2 rounded-full ${
                            window.discussionId ? 'bg-emerald-400' : 'bg-yellow-400'
                          }`}
                          animate={{ 
                            scale: [1, 1.2, 1],
                            opacity: [1, 0.7, 1]
                          }}
                          transition={{ 
                            duration: 2, 
                            repeat: Infinity,
                            ease: "easeInOut"
                          }}
                        />
                        <span className={`${
                          window.discussionId ? 'text-emerald-300' : 'text-yellow-300'
                        }`}>
                          {window.discussionId ? 'Persistent Chat' : 'Memory Only'}
                        </span>
                      </motion.span>
                    </div>
                    <span className="text-slate-400 px-2 py-1 rounded bg-slate-800/30">
                      {window.agentName}
                    </span>
                  </div>
                </motion.div>
              </>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );

  // Render portal mode
  const renderPortalMode = () => (
    <div className={`flex flex-col h-full space-y-6 ${className}`}>
      {/* Chat Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden bg-gradient-to-br from-slate-900/60 via-blue-900/30 to-purple-900/20 backdrop-blur-xl rounded-2xl p-6 border border-cyan-500/20"
      >
        <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/5 via-transparent to-purple-500/5" />
        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-4">
            <motion.div
              className="w-12 h-12 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-xl flex items-center justify-center"
              animate={{ 
                boxShadow: [
                  '0 0 20px rgba(59, 130, 246, 0.3)',
                  '0 0 30px rgba(6, 182, 212, 0.4)',
                  '0 0 20px rgba(59, 130, 246, 0.3)'
                ]
              }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <MessageSquare className="w-6 h-6 text-white" />
            </motion.div>
            <div>
              <h3 className="text-xl font-bold text-white">Agent Chat</h3>
              <div className="flex items-center gap-3">
                <p className="text-slate-300">
                  {selectedAgent ? `Chatting with ${selectedAgent.name}` : 'Select an agent to start chatting'}
                </p>
                <div className={`w-2 h-2 rounded-full ${isWebSocketConnected ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
                <span className={`text-xs ${isWebSocketConnected ? 'text-green-400' : 'text-red-400'}`}>
                  {isWebSocketConnected ? 'Real-time' : 'Offline'}
                </span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {portalMessages.length > 0 && (
              <DiscussionTrigger
                trigger={
                  <button 
                    className="px-4 py-2 text-sm bg-gradient-to-r from-purple-500/20 to-pink-500/20 text-purple-300 rounded-xl border border-purple-500/30 hover:from-purple-500/30 hover:to-pink-500/30 transition-all flex items-center gap-2 hover:scale-105 active:scale-95"
                  >
                    <Users className="w-4 h-4" />
                    Discuss
                  </button>
                }
                contextType="chat"
                contextData={{
                  chatHistory: portalMessages.map(msg => ({
                    content: msg.content,
                    sender: msg.sender,
                    timestamp: msg.timestamp
                  })),
                  topic: selectedAgent ? `Chat with ${selectedAgent.name}` : 'Agent Chat Discussion'
                }}
                preselectedAgents={selectedAgentId ? [selectedAgentId] : []}
              />
            )}
            {portalMessages.length > 0 && (
              <button
                onClick={clearPortalConversation}
                className="px-4 py-2 text-sm bg-red-500/20 text-red-400 rounded-xl border border-red-500/30 hover:bg-red-500/30 transition-colors hover:scale-105 active:scale-95"
              >
                Clear
              </button>
            )}
            <button
              onClick={() => setViewMode(viewMode === 'floating' ? 'portal' : 'floating')}
              className="px-4 py-2 text-sm bg-slate-700/50 text-slate-300 rounded-xl border border-slate-600/30 hover:bg-slate-600/50 transition-colors flex items-center gap-2 hover:scale-105 active:scale-95"
            >
              {viewMode === 'floating' ? <LayoutGrid className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
              {viewMode === 'floating' ? 'Portal' : 'Float'}
            </button>
          </div>
        </div>

        {/* Agent Selector */}
        {agentList.length > 0 && (
          <div className="mt-6">
            <select
              value={selectedAgentId}
              onChange={(e) => setSelectedAgentId(e.target.value)}
              className="w-full bg-slate-800/50 border border-slate-600/30 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-cyan-500/50 transition-all duration-300 hover:scale-[1.01] focus:scale-[1.02]"
              style={{
                background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.6), rgba(30, 58, 138, 0.3))'
              }}
            >
              <option value="">Select an agent...</option>
              {agentList.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name} ({agent.role})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Agent Capabilities Display */}
        {selectedAgent && (
          <motion.div 
            className="mt-4 p-4 bg-slate-800/30 border border-slate-700/30 rounded-xl"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            transition={{ duration: 0.3 }}
          >
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-slate-300">Agent Capabilities</h4>
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-400" />
                <span className="text-sm text-emerald-400">Enhanced</span>
              </div>
            </div>
            
            <div className="flex flex-wrap gap-2 mb-3">
              {selectedAgent.capabilities?.slice(0, 6).map((capability, index) => (
                <motion.span
                  key={index}
                  className="text-xs px-3 py-1 bg-gradient-to-r from-blue-500/20 to-cyan-500/20 text-blue-300 rounded-lg border border-blue-500/30"
                  whileHover={{ scale: 1.05 }}
                >
                  {capability}
                </motion.span>
              ))}
              {selectedAgent.capabilities && selectedAgent.capabilities.length > 6 && (
                <span className="text-xs px-3 py-1 bg-slate-600/50 text-slate-400 rounded-lg border border-slate-500/30">
                  +{selectedAgent.capabilities.length - 6} more
                </span>
              )}
            </div>

            <div className="grid grid-cols-3 gap-4 text-sm">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-yellow-400" />
                <span className="text-slate-400">Knowledge</span>
              </div>
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-purple-400" />
                <span className="text-slate-400">Tools</span>
              </div>
              <div className="flex items-center gap-2">
                <Brain className="w-4 h-4 text-cyan-400" />
                <span className="text-slate-400">Memory</span>
              </div>
            </div>
          </motion.div>
        )}
      </motion.div>

      {/* Chat Messages */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex-1 relative overflow-hidden bg-gradient-to-br from-slate-900/60 via-blue-900/30 to-purple-900/20 backdrop-blur-xl rounded-2xl border border-cyan-500/20"
      >
        <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/5 via-transparent to-purple-500/5" />
        <div className="relative h-full flex flex-col">
          <div className="flex-1 overflow-y-auto p-6 space-y-4" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(59, 130, 246, 0.3) transparent' }}>
            <AnimatePresence>
              {portalMessages.length === 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center justify-center h-32"
                >
                  <div className="text-center">
                    <motion.div
                      className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center"
                      animate={{ 
                        rotate: [0, 5, -5, 0],
                        scale: [1, 1.05, 1]
                      }}
                      transition={{ 
                        duration: 4, 
                        repeat: Infinity,
                        ease: "easeInOut"
                      }}
                    >
                      <Bot className="w-8 h-8 text-slate-400" />
                    </motion.div>
                    <p className="text-slate-400 text-lg">
                      {selectedAgent ? `Start a conversation with ${selectedAgent.name}` : 'Select an agent to begin chatting'}
                    </p>
                  </div>
                </motion.div>
              )}

              {portalMessages.map((message, index) => (
                <motion.div
                  key={message.id}
                  initial={{ opacity: 0, y: 20, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ 
                    delay: index * 0.05,
                    type: "spring",
                    stiffness: 200
                  }}
                  className={`flex gap-4 ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {message.sender !== 'user' && (
                    <motion.div 
                      className="w-10 h-10 bg-gradient-to-br from-purple-500 to-indigo-500 rounded-xl flex items-center justify-center flex-shrink-0"
                      whileHover={{ scale: 1.1, rotate: 5 }}
                    >
                      <Bot className="w-5 h-5 text-white" />
                    </motion.div>
                  )}
                  
                  <div className={`max-w-[80%] ${message.sender === 'user' ? 'order-1' : ''}`}>
                    <motion.div
                      className={`relative overflow-hidden rounded-2xl ${
                        message.sender === 'user'
                          ? 'bg-gradient-to-br from-blue-500 to-cyan-500 text-white ml-auto'
                          : 'bg-slate-800/50 text-white border border-slate-600/30'
                      }`}
                      whileHover={{ scale: 1.01, y: -1 }}
                      transition={{ type: "spring", stiffness: 300 }}
                    >
                      <div className="p-4">
                        <p className="text-sm leading-relaxed">{message.content}</p>
                        
                        {/* Agent message metadata */}
                        {message.sender !== 'user' && (
                          <div className="flex items-center gap-4 mt-3 pt-3 border-t border-slate-600/30 text-xs text-slate-400">
                            {message.confidence && (
                              <div className="flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                <span>{Math.round(message.confidence * 100)}%</span>
                              </div>
                            )}
                            {message.memoryEnhanced && (
                              <div className="flex items-center gap-1">
                                <Brain className="w-3 h-3 text-purple-400" />
                                <span>Memory</span>
                              </div>
                            )}
                            {message.knowledgeUsed && message.knowledgeUsed > 0 && (
                              <div className="flex items-center gap-1">
                                <Sparkles className="w-3 h-3 text-yellow-400" />
                                <span>{message.knowledgeUsed} KB</span>
                              </div>
                            )}
                            {message.toolsExecuted && message.toolsExecuted.length > 0 && (
                              <div className="flex items-center gap-1">
                                <Zap className="w-3 h-3 text-cyan-400" />
                                <span>{message.toolsExecuted.length} tools</span>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Tool Execution Results */}
                        {message.sender !== 'user' && message.toolsExecuted && message.toolsExecuted.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-slate-600/30">
                            <div className="text-xs text-slate-400 mb-2">Tools Executed:</div>
                            <div className="space-y-2">
                              {message.toolsExecuted.map((tool, toolIndex) => (
                                <motion.div
                                  key={toolIndex}
                                  className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg ${
                                    tool.success 
                                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                                      : 'bg-red-500/10 text-red-400 border border-red-500/20'
                                  }`}
                                  whileHover={{ scale: 1.02 }}
                                >
                                  <Zap className="w-3 h-3" />
                                  <span className="font-medium">{tool.toolName}</span>
                                  {tool.success ? (
                                    <CheckCircle2 className="w-3 h-3" />
                                  ) : (
                                    <AlertCircle className="w-3 h-3" />
                                  )}
                                </motion.div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </motion.div>
                    
                    <div className="text-xs text-slate-500 mt-2 px-4">
                      {new Date(message.timestamp).toLocaleTimeString()}
                    </div>
                  </div>

                  {message.sender === 'user' && (
                    <motion.div 
                      className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-xl flex items-center justify-center flex-shrink-0"
                      whileHover={{ scale: 1.1, rotate: -5 }}
                    >
                      <User className="w-5 h-5 text-white" />
                    </motion.div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>

            <div ref={messagesEndRef} />
          </div>

          {/* Message Input */}
          <motion.div 
            className="p-6 border-t border-cyan-500/20 bg-gradient-to-r from-slate-800/60 to-blue-900/30 backdrop-blur-sm"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <div className="flex gap-4 items-end">
              <div className="flex-1 relative">
                <input
                  type="text"
                  value={currentMessage['portal'] || ''}
                  onChange={(e) => setCurrentMessage(prev => ({ ...prev, portal: e.target.value }))}
                  onKeyDown={(e) => handleKeyPress(e, 'portal')}
                  placeholder={selectedAgent ? `Message ${selectedAgent.name}...` : "Select an agent first..."}
                  disabled={!selectedAgentId}
                  className="w-full bg-slate-800/50 border border-slate-600/30 rounded-xl px-4 py-4 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-400/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 hover:scale-[1.01] focus:scale-[1.02]"
                  style={{
                    background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.6), rgba(30, 58, 138, 0.3))'
                  }}
                />
              </div>
              <button
                onClick={sendPortalMessage}
                disabled={!currentMessage['portal']?.trim() || !selectedAgentId}
                className="relative p-4 bg-gradient-to-br from-cyan-500 to-blue-600 text-white rounded-xl hover:from-cyan-400 hover:to-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 overflow-hidden hover:scale-105 active:scale-95"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent opacity-0 hover:opacity-100 transition-opacity" />
                <Send className="w-5 h-5 relative z-10" />
              </button>
            </div>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );

  // Main render logic
  if (mode === 'floating') {
    return renderFloatingWindows();
  } else if (mode === 'portal') {
    // Portal mode can switch between portal and floating views
    return viewMode === 'portal' ? renderPortalMode() : renderFloatingWindows();
  } else {
    // Hybrid mode - show both
    return (
      <>
        {viewMode === 'portal' ? renderPortalMode() : renderFloatingWindows()}
        {/* Always show floating windows */}
        {viewMode === 'portal' && renderFloatingWindows()}
      </>
    );
  }
};